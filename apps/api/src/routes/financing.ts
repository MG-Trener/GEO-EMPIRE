import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { buildProjectFinancingOffer, calculateLoanTotalDue } from '../game/financing-config.js';

const offerParamsSchema = z.object({
  playerId: z.string().uuid(),
  projectId: z.string().uuid(),
});

const createLoanSchema = z.object({
  playerId: z.string().uuid(),
  projectId: z.string().uuid(),
  amount: z.coerce.number().int().positive().optional(),
});

const repayParamsSchema = z.object({ loanId: z.string().uuid() });
const repayBodySchema = z.object({
  playerId: z.string().uuid(),
  amount: z.coerce.number().int().positive(),
});

const listParamsSchema = z.object({ playerId: z.string().uuid() });

type ProjectFinancingRow = {
  id: string;
  status: string;
  capex: string;
  opex_per_unit: string;
  planned_daily_output: string;
  payback_days: string | null;
  project_value: string;
  geology_confidence: string;
  geology_snapshot_at: string;
  knowledge_updated_at: string;
  wallet_soft: string;
};

type LoanRow = {
  id: string;
  development_project_id: string;
  principal: string;
  total_due: string;
  outstanding: string;
  annual_interest_rate: string;
  repayment_share: string;
  status: string;
  issued_at: string;
  repaid_at: string | null;
  updated_at: string;
};

function serializeLoan(row: LoanRow) {
  return {
    id: row.id,
    projectId: row.development_project_id,
    principal: Number(row.principal),
    totalDue: Number(row.total_due),
    outstanding: Number(row.outstanding),
    repaid: Number(row.total_due) - Number(row.outstanding),
    annualInterestRate: Number(row.annual_interest_rate),
    repaymentShare: Number(row.repayment_share),
    status: row.status,
    issuedAt: row.issued_at,
    repaidAt: row.repaid_at,
    updatedAt: row.updated_at,
  };
}

function offerFromRow(row: ProjectFinancingRow) {
  const projectOutdated = new Date(row.knowledge_updated_at).getTime() > new Date(row.geology_snapshot_at).getTime();
  return buildProjectFinancingOffer({
    capex: Number(row.capex),
    plannedDailyOutput: Number(row.planned_daily_output),
    opexPerUnit: Number(row.opex_per_unit),
    paybackDays: row.payback_days === null ? null : Number(row.payback_days),
    projectValue: Number(row.project_value),
    geologyConfidence: Number(row.geology_confidence),
    walletSoft: Number(row.wallet_soft),
    projectStatus: row.status,
    projectOutdated,
  });
}

async function loadProjectForFinancing(playerId: string, projectId: string): Promise<ProjectFinancingRow | null> {
  const result = await db.query<ProjectFinancingRow>(
    `
      SELECT
        dp.id::text,
        dp.status,
        dp.capex::text,
        dp.opex_per_unit::text,
        dp.planned_daily_output::text,
        dp.payback_days::text,
        dp.project_value::text,
        dp.geology_confidence::text,
        dp.geology_snapshot_at::text,
        k.updated_at::text AS knowledge_updated_at,
        w.soft_currency::text AS wallet_soft
      FROM development_projects dp
      JOIN player_deposit_knowledge k
        ON k.player_id = dp.player_id AND k.deposit_id = dp.deposit_id
      JOIN wallets w ON w.player_id = dp.player_id
      WHERE dp.player_id = $1 AND dp.id = $2
    `,
    [playerId, projectId],
  );
  return result.rows[0] ?? null;
}

export async function financingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:playerId/projects/:projectId/offer', async (request, reply) => {
    const parsed = offerParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_financing_request' });

    const { playerId, projectId } = parsed.data;
    const project = await loadProjectForFinancing(playerId, projectId);
    if (!project) return reply.code(404).send({ error: 'development_project_not_found' });

    const existingResult = await db.query<LoanRow>(
      `
        SELECT
          id::text,
          development_project_id::text,
          principal::text,
          total_due::text,
          outstanding::text,
          annual_interest_rate::text,
          repayment_share::text,
          status,
          issued_at::text,
          repaid_at::text,
          updated_at::text
        FROM project_loans
        WHERE player_id = $1 AND development_project_id = $2
      `,
      [playerId, projectId],
    );

    const offer = offerFromRow(project);
    return {
      playerId,
      projectId,
      offer,
      existingLoan: existingResult.rows[0] ? serializeLoan(existingResult.rows[0]) : null,
    };
  });

  app.post('/loans', async (request, reply) => {
    const parsed = createLoanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_loan_request', details: parsed.error.flatten() });
    }

    const { playerId, projectId } = parsed.data;
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const projectResult = await client.query<ProjectFinancingRow>(
        `
          SELECT
            dp.id::text,
            dp.status,
            dp.capex::text,
            dp.opex_per_unit::text,
            dp.planned_daily_output::text,
            dp.payback_days::text,
            dp.project_value::text,
            dp.geology_confidence::text,
            dp.geology_snapshot_at::text,
            k.updated_at::text AS knowledge_updated_at,
            w.soft_currency::text AS wallet_soft
          FROM development_projects dp
          JOIN player_deposit_knowledge k
            ON k.player_id = dp.player_id AND k.deposit_id = dp.deposit_id
          JOIN wallets w ON w.player_id = dp.player_id
          WHERE dp.player_id = $1 AND dp.id = $2
          FOR UPDATE OF dp, k, w
        `,
        [playerId, projectId],
      );
      const project = projectResult.rows[0];
      if (!project) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'development_project_not_found' });
      }

      const existing = await client.query<{ id: string; status: string }>(
        `SELECT id::text, status FROM project_loans WHERE development_project_id = $1 FOR UPDATE`,
        [projectId],
      );
      if (existing.rows[0]) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'project_loan_already_exists', status: existing.rows[0].status });
      }

      const offer = offerFromRow(project);
      if (!offer.eligible) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'project_not_financeable', reason: offer.reason, offer });
      }

      const amount = parsed.data.amount ?? offer.recommendedLoan;
      if (!amount || amount < 10_000) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'loan_amount_too_small', minimum: 10_000 });
      }
      if (amount > offer.maxLoan) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'loan_amount_above_limit', requested: amount, maxLoan: offer.maxLoan });
      }

      const totalDue = calculateLoanTotalDue(amount, offer.annualInterestRate);
      const loanResult = await client.query<LoanRow>(
        `
          INSERT INTO project_loans (
            player_id,
            development_project_id,
            principal,
            total_due,
            outstanding,
            annual_interest_rate,
            repayment_share,
            status
          )
          VALUES ($1, $2, $3, $4, $4, $5, $6, 'active')
          RETURNING
            id::text,
            development_project_id::text,
            principal::text,
            total_due::text,
            outstanding::text,
            annual_interest_rate::text,
            repayment_share::text,
            status,
            issued_at::text,
            repaid_at::text,
            updated_at::text
        `,
        [playerId, projectId, amount, totalDue, offer.annualInterestRate, offer.repaymentShare],
      );
      const loan = loanResult.rows[0];

      const walletResult = await client.query<{ soft_currency: string }>(
        `
          UPDATE wallets
          SET soft_currency = soft_currency + $2, updated_at = now()
          WHERE player_id = $1
          RETURNING soft_currency::text
        `,
        [playerId, amount],
      );

      await client.query(
        `
          INSERT INTO wallet_transactions (
            player_id, soft_delta, premium_delta, reason, reference_type, reference_id
          )
          VALUES ($1, $2, 0, 'project_loan_disbursement', 'loan', $3)
        `,
        [playerId, amount, loan.id],
      );
      await client.query(
        `
          INSERT INTO loan_transactions (
            loan_id, player_id, amount, transaction_type, reference_type, reference_id
          )
          VALUES ($1, $2, $3, 'disbursement', 'development_project', $4)
        `,
        [loan.id, playerId, amount, projectId],
      );

      await client.query('COMMIT');
      return {
        status: 'active',
        offer,
        loan: serializeLoan(loan),
        wallet: { soft: Number(walletResult.rows[0]?.soft_currency ?? 0) },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'project_loan_failed' });
    } finally {
      client.release();
    }
  });

  app.post('/loans/:loanId/repay', async (request, reply) => {
    const params = repayParamsSchema.safeParse(request.params);
    const body = repayBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_loan_repayment' });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const loanResult = await client.query<LoanRow & { player_id: string }>(
        `
          SELECT
            id::text,
            player_id::text,
            development_project_id::text,
            principal::text,
            total_due::text,
            outstanding::text,
            annual_interest_rate::text,
            repayment_share::text,
            status,
            issued_at::text,
            repaid_at::text,
            updated_at::text
          FROM project_loans
          WHERE id = $1
          FOR UPDATE
        `,
        [params.data.loanId],
      );
      const loan = loanResult.rows[0];
      if (!loan || loan.player_id !== body.data.playerId) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'loan_not_found' });
      }
      if (loan.status !== 'active' || Number(loan.outstanding) <= 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'loan_not_active' });
      }

      const payment = Math.min(body.data.amount, Number(loan.outstanding));
      const walletResult = await client.query<{ soft_currency: string }>(
        `SELECT soft_currency::text FROM wallets WHERE player_id = $1 FOR UPDATE`,
        [body.data.playerId],
      );
      const balance = Number(walletResult.rows[0]?.soft_currency ?? 0);
      if (balance < payment) {
        await client.query('ROLLBACK');
        return reply.code(402).send({ error: 'insufficient_funds', required: payment, balance });
      }

      const outstanding = Number(loan.outstanding) - payment;
      const nextStatus = outstanding <= 0 ? 'repaid' : 'active';
      const updatedLoan = await client.query<LoanRow>(
        `
          UPDATE project_loans
          SET
            outstanding = $2,
            status = $3,
            repaid_at = CASE WHEN $3 = 'repaid' THEN now() ELSE repaid_at END,
            updated_at = now()
          WHERE id = $1
          RETURNING
            id::text,
            development_project_id::text,
            principal::text,
            total_due::text,
            outstanding::text,
            annual_interest_rate::text,
            repayment_share::text,
            status,
            issued_at::text,
            repaid_at::text,
            updated_at::text
        `,
        [loan.id, outstanding, nextStatus],
      );
      const walletAfter = await client.query<{ soft_currency: string }>(
        `
          UPDATE wallets
          SET soft_currency = soft_currency - $2, updated_at = now()
          WHERE player_id = $1
          RETURNING soft_currency::text
        `,
        [body.data.playerId, payment],
      );
      await client.query(
        `
          INSERT INTO wallet_transactions (
            player_id, soft_delta, premium_delta, reason, reference_type, reference_id
          ) VALUES ($1, $2, 0, 'loan_repayment', 'loan', $3)
        `,
        [body.data.playerId, -payment, loan.id],
      );
      await client.query(
        `
          INSERT INTO loan_transactions (
            loan_id, player_id, amount, transaction_type, reference_type, reference_id
          ) VALUES ($1, $2, $3, 'repayment', 'manual', NULL)
        `,
        [loan.id, body.data.playerId, payment],
      );

      await client.query('COMMIT');
      return {
        status: nextStatus,
        payment,
        loan: serializeLoan(updatedLoan.rows[0]),
        wallet: { soft: Number(walletAfter.rows[0]?.soft_currency ?? 0) },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'loan_repayment_failed' });
    } finally {
      client.release();
    }
  });

  app.get('/:playerId/loans', async (request, reply) => {
    const parsed = listParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_player_id' });

    const result = await db.query<LoanRow>(
      `
        SELECT
          id::text,
          development_project_id::text,
          principal::text,
          total_due::text,
          outstanding::text,
          annual_interest_rate::text,
          repayment_share::text,
          status,
          issued_at::text,
          repaid_at::text,
          updated_at::text
        FROM project_loans
        WHERE player_id = $1
        ORDER BY status = 'active' DESC, issued_at DESC
      `,
      [parsed.data.playerId],
    );

    return { playerId: parsed.data.playerId, loans: result.rows.map(serializeLoan) };
  });
}
