import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { buildDevelopmentOptions, type DevelopmentMethod, type DevelopmentOption } from '../game/development-config.js';
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
  created_at: string;
  updated_at: string;
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

    const projectResult = await db.query<ProjectRow>(
      `
        SELECT
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
          created_at::text,
          updated_at::text
        FROM development_projects
        WHERE player_id = $1 AND deposit_id = $2
      `,
      [playerId, depositId],
    );

    const options = buildOptions(depositRow);
    return {
      playerId,
      deposit: depositPayload(depositRow),
      approvalRule: {
        minimumGeologyConfidence: 0.85,
        message: 'Для утверждения капитальных вложений достоверность геологической модели должна быть не ниже 85%.',
      },
      options,
      selectedProject: projectResult.rows[0]
        ? serializeProject(projectResult.rows[0], depositRow.knowledge_updated_at)
        : null,
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
}
