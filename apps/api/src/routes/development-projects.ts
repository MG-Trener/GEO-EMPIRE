import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import {
  buildDevelopmentOptions,
  getDevelopmentConstructionSeconds,
  type DevelopmentMethod,
  type DevelopmentOption,
} from '../game/development-config.js';
import { getResourceMarketPrice } from '../game/market-config.js';

const paramsSchema = z.object({
  playerId: z.string().uuid(),
  depositId: z.coerce.number().int().positive(),
});

const planSchema = z.object({
  playerId: z.string().uuid(),
  depositId: z.coerce.number().int().positive(),
  method: z.enum(['open_pit', 'underground_mine', 'oil_well', 'gas_well']),
});

const approveParamsSchema = z.object({ projectId: z.string().uuid() });
const approveBodySchema = z.object({ playerId: z.string().uuid() });

type DepositRow = {
  deposit_id: string;
  h3_index: string;
  resource_code: string;
  resource_name: string;
  unit: string;
  rarity: number;
  estimated_quantity_min: string | null;
  estimated_quantity_max: string | null;
  estimated_depth_from_m: string | null;
  estimated_depth_to_m: string | null;
  estimated_quality: string | null;
  estimated_quality_min: string | null;
  estimated_quality_max: string | null;
  confidence: string | null;
  knowledge_updated_at: string;
};

type ProjectRow = {
  id: string;
  method: DevelopmentMethod;
  building_code: DevelopmentOption['buildingCode'];
  status: string;
  capex: string;
  opex_per_unit: string;
  market_price_per_unit: string;
  recovery_rate: string;
  planned_daily_output: string;
  expected_daily_revenue: string;
  expected_daily_margin: string;
  payback_days: string | null;
  mine_life_days: number;
  project_value: string;
  geology_confidence: string;
  geology_snapshot_at: string;
  building_id: string | null;
  building_status: string | null;
  building_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type LockedProjectRow = {
  id: string;
  player_id: string;
  deposit_id: string;
  method: DevelopmentMethod;
  building_code: DevelopmentOption['buildingCode'];
  status: string;
  capex: string;
  geology_confidence: string;
  geology_snapshot_at: string;
  h3_index: string;
  knowledge_confidence: string;
  knowledge_updated_at: string;
};

function serializeProject(row: ProjectRow, knowledgeUpdatedAt: string) {
  return {
    id: row.id,
    method: row.method,
    buildingCode: row.building_code,
    status: row.status,
    capex: Number(row.capex),
    opexPerUnit: Number(row.opex_per_unit),
    marketPricePerUnit: Number(row.market_price_per_unit),
    recoveryRate: Number(row.recovery_rate),
    plannedDailyOutput: Number(row.planned_daily_output),
    expectedDailyRevenue: Number(row.expected_daily_revenue),
    expectedDailyOperatingMargin: Number(row.expected_daily_margin),
    paybackDays: row.payback_days === null ? null : Number(row.payback_days),
    estimatedMineLifeDays: Number(row.mine_life_days),
    projectValue: Number(row.project_value),
    geologyConfidence: Number(row.geology_confidence),
    geologySnapshotAt: row.geology_snapshot_at,
    outdated: new Date(knowledgeUpdatedAt).getTime() > new Date(row.geology_snapshot_at).getTime(),
    building: row.building_id
      ? {
          id: row.building_id,
          status: row.building_status,
          completesAt: row.building_completed_at,
          constructionComplete: row.building_completed_at
            ? new Date(row.building_completed_at).getTime() <= Date.now()
            : false,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function depositPayload(row: DepositRow) {
  const confidence = Number(row.confidence ?? 0);
  const qualityCenter = Number(row.estimated_quality ?? 0);
  const fallbackError = Math.max(0.05, 1 - confidence);

  return {
    id: row.deposit_id,
    h3Index: row.h3_index,
    resource: {
      code: row.resource_code,
      name: row.resource_name,
      unit: row.unit,
      rarity: Number(row.rarity),
    },
    estimates: {
      quantity: {
        min: Number(row.estimated_quantity_min ?? 0),
        max: Number(row.estimated_quantity_max ?? 0),
      },
      depth: {
        fromMeters: Number(row.estimated_depth_from_m ?? 0),
        toMeters: Number(row.estimated_depth_to_m ?? 0),
      },
      quality: {
        min: Number(row.estimated_quality_min ?? Math.max(0, qualityCenter * (1 - fallbackError))),
        max: Number(row.estimated_quality_max ?? qualityCenter * (1 + fallbackError)),
      },
      confidence,
    },
    knowledgeUpdatedAt: row.knowledge_updated_at,
  };
}

async function loadDeposit(playerId: string, depositId: number): Promise<DepositRow | null> {
  const result = await db.query<DepositRow>(
    `
      SELECT
        d.id::text AS deposit_id,
        d.cell_h3::text AS h3_index,
        r.code AS resource_code,
        r.name_ru AS resource_name,
        r.unit,
        r.rarity,
        k.estimated_quantity_min::text,
        k.estimated_quantity_max::text,
        k.estimated_depth_from_m::text,
        k.estimated_depth_to_m::text,
        k.estimated_quality::text,
        k.estimated_quality_min::text,
        k.estimated_quality_max::text,
        k.confidence::text,
        k.updated_at::text AS knowledge_updated_at
      FROM player_deposit_knowledge k
      JOIN resource_deposits d ON d.id = k.deposit_id
      JOIN resources r ON r.id = d.resource_id
      WHERE k.player_id = $1
        AND k.deposit_id = $2
        AND d.quantity_remaining > 0
    `,
    [playerId, depositId],
  );
  return result.rows[0] ?? null;
}

function buildOptions(row: DepositRow): DevelopmentOption[] {
  const deposit = depositPayload(row);
  const marketPrice = getResourceMarketPrice(row.resource_code);
  if (!marketPrice) return [];

  return buildDevelopmentOptions({
    resourceCode: row.resource_code,
    unit: row.unit,
    quantityMin: deposit.estimates.quantity.min,
    quantityMax: deposit.estimates.quantity.max,
    depthFromMeters: deposit.estimates.depth.fromMeters,
    depthToMeters: deposit.estimates.depth.toMeters,
    qualityMin: deposit.estimates.quality.min,
    qualityMax: deposit.estimates.quality.max,
    confidence: deposit.estimates.confidence,
    marketPricePerUnit: marketPrice,
  });
}

export async function developmentProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:playerId/deposits/:depositId/options', async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_development_request' });

    const { playerId, depositId } = parsed.data;
    const depositRow = await loadDeposit(playerId, depositId);
    if (!depositRow) return reply.code(404).send({ error: 'deposit_not_known' });

    const [projectResult, walletResult, claimResult] = await Promise.all([
      db.query<ProjectRow>(
        `
          SELECT
            dp.id::text,
            dp.method,
            dp.building_code,
            dp.status,
            dp.capex::text,
            dp.opex_per_unit::text,
            dp.market_price_per_unit::text,
            dp.recovery_rate::text,
            dp.planned_daily_output::text,
            dp.expected_daily_revenue::text,
            dp.expected_daily_margin::text,
            dp.payback_days::text,
            dp.mine_life_days,
            dp.project_value::text,
            dp.geology_confidence::text,
            dp.geology_snapshot_at::text,
            dp.building_id::text,
            b.status AS building_status,
            b.completed_at::text AS building_completed_at,
            dp.created_at::text,
            dp.updated_at::text
          FROM development_projects dp
          LEFT JOIN buildings b ON b.id = dp.building_id
          WHERE dp.player_id = $1 AND dp.deposit_id = $2
        `,
        [playerId, depositId],
      ),
      db.query<{ soft_currency: string }>(
        `SELECT soft_currency::text FROM wallets WHERE player_id = $1`,
        [playerId],
      ),
      db.query<{ player_id: string }>(
        `
          SELECT player_id::text
          FROM territory_claims
          WHERE cell_h3 = $1::h3index AND lease_until > now()
        `,
        [depositRow.h3_index],
      ),
    ]);

    const options = buildOptions(depositRow);
    const selected = projectResult.rows[0] ?? null;
    const serialized = selected ? serializeProject(selected, depositRow.knowledge_updated_at) : null;
    const walletSoft = Number(walletResult.rows[0]?.soft_currency ?? 0);
    const territoryOwned = claimResult.rows[0]?.player_id === playerId;
    const confidenceReady = Number(depositRow.confidence ?? 0) >= 0.85;
    const projectFresh = serialized ? !serialized.outdated : false;
    const sufficientFunds = serialized ? walletSoft >= serialized.capex : false;
    const canApprove = Boolean(
      serialized
      && serialized.status === 'planned'
      && projectFresh
      && confidenceReady
      && territoryOwned
      && sufficientFunds,
    );

    return {
      playerId,
      deposit: depositPayload(depositRow),
      approvalRule: {
        minimumGeologyConfidence: 0.85,
        message: 'Для утверждения капитальных вложений достоверность геологической модели должна быть не ниже 85%.',
      },
      approvalState: {
        confidenceReady,
        territoryOwned,
        walletSoft,
        sufficientFunds,
        projectFresh,
        canApprove,
      },
      options,
      selectedProject: serialized,
    };
  });

  app.post('/projects', async (request, reply) => {
    const parsed = planSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_development_project', details: parsed.error.flatten() });
    }

    const { playerId, depositId, method } = parsed.data;
    const depositRow = await loadDeposit(playerId, depositId);
    if (!depositRow) return reply.code(404).send({ error: 'deposit_not_known' });

    const option = buildOptions(depositRow).find((item) => item.method === method);
    if (!option) {
      return reply.code(409).send({ error: 'development_method_not_viable' });
    }

    const result = await db.query<ProjectRow>(
      `
        INSERT INTO development_projects (
          player_id,
          deposit_id,
          method,
          building_code,
          status,
          capex,
          opex_per_unit,
          market_price_per_unit,
          recovery_rate,
          planned_daily_output,
          expected_daily_revenue,
          expected_daily_margin,
          payback_days,
          mine_life_days,
          project_value,
          geology_confidence,
          geology_snapshot_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, 'planned', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now()
        )
        ON CONFLICT (player_id, deposit_id) DO UPDATE SET
          method = EXCLUDED.method,
          building_code = EXCLUDED.building_code,
          capex = EXCLUDED.capex,
          opex_per_unit = EXCLUDED.opex_per_unit,
          market_price_per_unit = EXCLUDED.market_price_per_unit,
          recovery_rate = EXCLUDED.recovery_rate,
          planned_daily_output = EXCLUDED.planned_daily_output,
          expected_daily_revenue = EXCLUDED.expected_daily_revenue,
          expected_daily_margin = EXCLUDED.expected_daily_margin,
          payback_days = EXCLUDED.payback_days,
          mine_life_days = EXCLUDED.mine_life_days,
          project_value = EXCLUDED.project_value,
          geology_confidence = EXCLUDED.geology_confidence,
          geology_snapshot_at = EXCLUDED.geology_snapshot_at,
          updated_at = now()
        WHERE development_projects.status = 'planned'
        RETURNING
          id::text,
          method,
          building_code,
          status,
          capex::text,
          opex_per_unit::text,
          market_price_per_unit::text,
          recovery_rate::text,
          planned_daily_output::text,
          expected_daily_revenue::text,
          expected_daily_margin::text,
          payback_days::text,
          mine_life_days,
          project_value::text,
          geology_confidence::text,
          geology_snapshot_at::text,
          building_id::text,
          NULL::text AS building_status,
          NULL::text AS building_completed_at,
          created_at::text,
          updated_at::text
      `,
      [
        playerId,
        depositId,
        option.method,
        option.buildingCode,
        option.capex,
        option.opexPerUnit,
        option.marketPricePerUnit,
        option.recoveryRate,
        option.plannedDailyOutput,
        option.expectedDailyRevenue,
        option.expectedDailyOperatingMargin,
        option.paybackDays,
        option.estimatedMineLifeDays,
        option.projectValue,
        option.geologyConfidence,
        depositRow.knowledge_updated_at,
      ],
    );

    const project = result.rows[0];
    if (!project) {
      return reply.code(409).send({ error: 'development_project_already_committed' });
    }

    return {
      status: 'planned',
      deposit: depositPayload(depositRow),
      project: serializeProject(project, depositRow.knowledge_updated_at),
    };
  });

  app.post('/projects/:projectId/approve', async (request, reply) => {
    const parsedParams = approveParamsSchema.safeParse(request.params);
    const parsedBody = approveBodySchema.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: 'invalid_project_approval' });
    }

    const { projectId } = parsedParams.data;
    const { playerId } = parsedBody.data;
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const projectResult = await client.query<LockedProjectRow>(
        `
          SELECT
            dp.id::text,
            dp.player_id::text,
            dp.deposit_id::text,
            dp.method,
            dp.building_code,
            dp.status,
            dp.capex::text,
            dp.geology_confidence::text,
            dp.geology_snapshot_at::text,
            d.cell_h3::text AS h3_index,
            k.confidence::text AS knowledge_confidence,
            k.updated_at::text AS knowledge_updated_at
          FROM development_projects dp
          JOIN resource_deposits d ON d.id = dp.deposit_id
          JOIN player_deposit_knowledge k
            ON k.player_id = dp.player_id AND k.deposit_id = dp.deposit_id
          WHERE dp.id = $1 AND dp.player_id = $2
          FOR UPDATE OF dp, k
        `,
        [projectId, playerId],
      );

      const project = projectResult.rows[0];
      if (!project) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'development_project_not_found' });
      }
      if (project.status !== 'planned') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'development_project_not_planned', status: project.status });
      }

      const confidence = Number(project.knowledge_confidence);
      if (confidence < 0.85) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'geology_confidence_too_low', required: 0.85, actual: confidence });
      }
      if (new Date(project.knowledge_updated_at).getTime() > new Date(project.geology_snapshot_at).getTime()) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'development_project_outdated' });
      }

      const claimResult = await client.query<{ player_id: string }>(
        `
          SELECT player_id::text
          FROM territory_claims
          WHERE cell_h3 = $1::h3index AND lease_until > now()
          FOR UPDATE
        `,
        [project.h3_index],
      );
      if (claimResult.rows[0]?.player_id !== playerId) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'territory_not_owned' });
      }

      const occupiedResult = await client.query<{ building_id: string }>(
        `SELECT building_id::text FROM building_cells WHERE cell_h3 = $1::h3index FOR UPDATE`,
        [project.h3_index],
      );
      if (occupiedResult.rows[0]) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'cell_already_has_building' });
      }

      const typeResult = await client.query<{ id: number; name_ru: string; min_footprint_cells: number }>(
        `
          SELECT id, name_ru, min_footprint_cells
          FROM building_types
          WHERE code = $1 AND active = true
        `,
        [project.building_code],
      );
      const buildingType = typeResult.rows[0];
      if (!buildingType) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'building_type_not_found' });
      }
      if (Number(buildingType.min_footprint_cells) !== 1) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'multi_cell_development_not_supported_yet' });
      }

      const walletResult = await client.query<{ soft_currency: string }>(
        `SELECT soft_currency::text FROM wallets WHERE player_id = $1 FOR UPDATE`,
        [playerId],
      );
      const wallet = walletResult.rows[0];
      if (!wallet) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'wallet_not_found' });
      }

      const capex = Number(project.capex);
      const balance = Number(wallet.soft_currency);
      if (balance < capex) {
        await client.query('ROLLBACK');
        return reply.code(402).send({ error: 'insufficient_funds', required: capex, balance });
      }

      const constructionSeconds = getDevelopmentConstructionSeconds(project.method);
      const created = await client.query<{ id: string; completed_at: string }>(
        `
          INSERT INTO buildings (
            owner_player_id,
            building_type_id,
            level,
            status,
            started_at,
            completed_at
          )
          VALUES (
            $1,
            $2,
            1,
            'constructing',
            now(),
            now() + ($3::text || ' seconds')::interval
          )
          RETURNING id::text, completed_at::text
        `,
        [playerId, buildingType.id, constructionSeconds],
      );
      const building = created.rows[0];

      await client.query(
        `INSERT INTO building_cells (building_id, cell_h3) VALUES ($1, $2::h3index)`,
        [building.id, project.h3_index],
      );
      await client.query(
        `UPDATE wallets SET soft_currency = soft_currency - $2, updated_at = now() WHERE player_id = $1`,
        [playerId, capex],
      );
      await client.query(
        `
          INSERT INTO wallet_transactions (
            player_id, soft_delta, premium_delta, reason, reference_type, reference_id
          )
          VALUES ($1, $2, 0, 'development_capex', 'development_project', $3)
        `,
        [playerId, -capex, projectId],
      );
      await client.query(
        `
          UPDATE development_projects
          SET status = 'constructing', building_id = $2, approved_at = now(), updated_at = now()
          WHERE id = $1
        `,
        [projectId, building.id],
      );

      await client.query('COMMIT');
      return {
        status: 'constructing',
        projectId,
        charged: capex,
        wallet: { soft: balance - capex },
        building: {
          id: building.id,
          code: project.building_code,
          name: buildingType.name_ru,
          h3Index: project.h3_index,
          completesAt: building.completed_at,
          constructionSeconds,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'development_project_approval_failed' });
    } finally {
      client.release();
    }
  });
}
