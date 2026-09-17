import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { getResourceMarketPrice } from '../game/market-config.js';

const playerParamsSchema = z.object({ playerId: z.string().uuid() });
const sellSchema = z.object({
  playerId: z.string().uuid(),
  resourceId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive().max(1_000_000_000),
});

type InventoryMarketRow = {
  resource_id: number;
  resource_code: string;
  resource_name: string;
  unit: string;
  rarity: number;
  quantity: string;
};

type LockedInventoryRow = InventoryMarketRow & { player_id: string };
type WalletRow = { soft_currency: string; premium_currency: string };
type ActiveLoanRow = {
  id: string;
  outstanding: string;
  repayment_share: string;
  issued_at: string;
};

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export async function marketRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:playerId', async (request, reply) => {
    const parsed = playerParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_player_id' });

    const [inventoryResult, walletResult, debtResult] = await Promise.all([
      db.query<InventoryMarketRow>(
        `
          SELECT
            i.resource_id,
            r.code AS resource_code,
            r.name_ru AS resource_name,
            r.unit,
            r.rarity,
            i.quantity::text
          FROM player_inventory i
          JOIN resources r ON r.id = i.resource_id
          WHERE i.player_id = $1 AND i.quantity > 0 AND r.active = true
          ORDER BY r.category, r.rarity, r.code
        `,
        [parsed.data.playerId],
      ),
      db.query<WalletRow>(
        `SELECT soft_currency::text, premium_currency::text FROM wallets WHERE player_id = $1`,
        [parsed.data.playerId],
      ),
      db.query<{ outstanding: string; repayment_share: string }>(
        `
          SELECT
            COALESCE(sum(outstanding), 0)::text AS outstanding,
            COALESCE(max(repayment_share), 0)::text AS repayment_share
          FROM project_loans
          WHERE player_id = $1 AND status = 'active' AND outstanding > 0
        `,
        [parsed.data.playerId],
      ),
    ]);

    const wallet = walletResult.rows[0];
    if (!wallet) return reply.code(404).send({ error: 'player_not_found' });

    const debt = debtResult.rows[0];
    return {
      playerId: parsed.data.playerId,
      wallet: {
        soft: Number(wallet.soft_currency),
        premium: Number(wallet.premium_currency),
      },
      debt: {
        outstanding: Number(debt?.outstanding ?? 0),
        saleRepaymentShare: Number(debt?.repayment_share ?? 0),
      },
      offers: inventoryResult.rows.flatMap((row) => {
        const pricePerUnit = getResourceMarketPrice(row.resource_code);
        if (!pricePerUnit) return [];
        const quantity = Number(row.quantity);
        return [{
          resourceId: Number(row.resource_id),
          code: row.resource_code,
          name: row.resource_name,
          unit: row.unit,
          rarity: Number(row.rarity),
          quantity,
          pricePerUnit,
          totalValue: Math.floor(quantity * pricePerUnit),
        }];
      }),
    };
  });

  app.post('/sell', async (request, reply) => {
    const parsed = sellSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_market_sale', details: parsed.error.flatten() });
    }

    const { playerId, resourceId } = parsed.data;
    const quantity = round4(parsed.data.quantity);
    if (quantity <= 0) return reply.code(400).send({ error: 'invalid_market_sale' });

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const inventoryResult = await client.query<LockedInventoryRow>(
        `
          SELECT
            i.player_id::text,
            i.resource_id,
            r.code AS resource_code,
            r.name_ru AS resource_name,
            r.unit,
            r.rarity,
            i.quantity::text
          FROM player_inventory i
          JOIN resources r ON r.id = i.resource_id
          WHERE i.player_id = $1 AND i.resource_id = $2
          FOR UPDATE OF i
        `,
        [playerId, resourceId],
      );

      const inventory = inventoryResult.rows[0];
      if (!inventory) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'inventory_resource_not_found' });
      }

      const available = Number(inventory.quantity);
      if (quantity > available) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: 'insufficient_inventory',
          available,
          requested: quantity,
        });
      }

      const pricePerUnit = getResourceMarketPrice(inventory.resource_code);
      if (!pricePerUnit) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'resource_not_tradeable' });
      }

      const grossProceeds = Math.floor(quantity * pricePerUnit);
      if (grossProceeds <= 0) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'sale_value_too_small' });
      }

      const walletResult = await client.query<WalletRow>(
        `SELECT soft_currency::text, premium_currency::text FROM wallets WHERE player_id = $1 FOR UPDATE`,
        [playerId],
      );
      if (!walletResult.rows[0]) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'wallet_not_found' });
      }

      const activeLoans = await client.query<ActiveLoanRow>(
        `
          SELECT id::text, outstanding::text, repayment_share::text, issued_at::text
          FROM project_loans
          WHERE player_id = $1 AND status = 'active' AND outstanding > 0
          ORDER BY issued_at, id
          FOR UPDATE
        `,
        [playerId],
      );

      const totalOutstanding = activeLoans.rows.reduce((sum, loan) => sum + Number(loan.outstanding), 0);
      const repaymentShare = activeLoans.rows.reduce(
        (max, loan) => Math.max(max, Number(loan.repayment_share)),
        0,
      );
      const repaymentPool = totalOutstanding > 0
        ? Math.min(totalOutstanding, Math.floor(grossProceeds * repaymentShare))
        : 0;
      const netProceeds = grossProceeds - repaymentPool;

      const inventoryAfter = round4(available - quantity);
      await client.query(
        `
          UPDATE player_inventory
          SET quantity = $3, updated_at = now()
          WHERE player_id = $1 AND resource_id = $2
        `,
        [playerId, resourceId, inventoryAfter],
      );

      await client.query(
        `
          INSERT INTO inventory_transactions (
            player_id, resource_id, quantity_delta, reason, reference_type, reference_id
          )
          VALUES ($1, $2, $3, 'resource_sale', 'market', $4)
        `,
        [playerId, resourceId, -quantity, inventory.resource_code],
      );

      let remainingRepayment = repaymentPool;
      const repayments: Array<{ loanId: string; amount: number; outstanding: number; status: string }> = [];
      for (const loan of activeLoans.rows) {
        if (remainingRepayment <= 0) break;
        const before = Number(loan.outstanding);
        const payment = Math.min(before, remainingRepayment);
        if (payment <= 0) continue;
        const outstanding = before - payment;
        const status = outstanding <= 0 ? 'repaid' : 'active';

        await client.query(
          `
            UPDATE project_loans
            SET
              outstanding = $2,
              status = $3,
              repaid_at = CASE WHEN $3 = 'repaid' THEN now() ELSE repaid_at END,
              updated_at = now()
            WHERE id = $1
          `,
          [loan.id, outstanding, status],
        );
        await client.query(
          `
            INSERT INTO loan_transactions (
              loan_id, player_id, amount, transaction_type, reference_type, reference_id
            )
            VALUES ($1, $2, $3, 'repayment', 'market_sale', $4)
          `,
          [loan.id, playerId, payment, inventory.resource_code],
        );

        repayments.push({ loanId: loan.id, amount: payment, outstanding, status });
        remainingRepayment -= payment;
      }

      const updatedWallet = await client.query<WalletRow>(
        `
          UPDATE wallets
          SET soft_currency = soft_currency + $2, updated_at = now()
          WHERE player_id = $1
          RETURNING soft_currency::text, premium_currency::text
        `,
        [playerId, netProceeds],
      );

      await client.query(
        `
          INSERT INTO wallet_transactions (
            player_id, soft_delta, premium_delta, reason, reference_type, reference_id
          )
          VALUES ($1, $2, 0, 'resource_sale', 'resource', $3)
        `,
        [playerId, grossProceeds, inventory.resource_code],
      );
      if (repaymentPool > 0) {
        await client.query(
          `
            INSERT INTO wallet_transactions (
              player_id, soft_delta, premium_delta, reason, reference_type, reference_id
            )
            VALUES ($1, $2, 0, 'loan_repayment', 'market_sale', $3)
          `,
          [playerId, -repaymentPool, inventory.resource_code],
        );
      }

      await client.query('COMMIT');
      const wallet = updatedWallet.rows[0];
      return {
        status: 'sold',
        resource: {
          id: resourceId,
          code: inventory.resource_code,
          name: inventory.resource_name,
          unit: inventory.unit,
        },
        quantity,
        pricePerUnit,
        proceeds: grossProceeds,
        grossProceeds,
        debtRepayment: repaymentPool,
        netProceeds,
        repayments,
        inventoryQuantity: inventoryAfter,
        wallet: {
          soft: Number(wallet?.soft_currency ?? 0),
          premium: Number(wallet?.premium_currency ?? 0),
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'market_sale_failed' });
    } finally {
      client.release();
    }
  });
}
