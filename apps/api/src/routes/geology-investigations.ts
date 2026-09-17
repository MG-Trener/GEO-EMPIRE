import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { db } from '../db.js';

const methodSchema = z.enum(['geophysics', 'seismic', 'drilling', 'assessment']);
const paramsSchema = z.object({
  playerId: z.string().uuid(),
  depositId: z.coerce.number().int().positive(),
});
const startSchema = z.object({
  playerId: z.string().uuid(),
  depositId: z.coerce.number().int().positive(),
  method: methodSchema,
});

type Method = z.infer<typeof methodSchema>;

type StudyConfig = {
  code: Method;
  name: string;
  description: string;
  cost: number;
  durationSeconds: number;
  confidenceGain: number;
  confidenceCap: number;
};

const STUDIES: readonly StudyConfig[] = [
  {
    code: 'geophysics',
    name: 'Геофизика',
    description: 'Уточняет контуры залежи и ориентировочный объём.',
    cost: 1200,
    durationSeconds: 20,
    confidenceGain: 0.28,
    confidenceCap: 0.86,
  },
  {
    code: 'seismic',
    name: 'Сейсморазведка',
    description: 'Сужает диапазон глубины и строение пласта.',
    cost: 3500,
    durationSeconds: 45,
    confidenceGain: 0.42,
    confidenceCap: 0.93,
  },
  {
    code: 'drilling',
    name: 'Разведочное бурение',
    description: 'Даёт прямые данные по качеству, плотности и запасам.',
    cost: 8000,
    durationSeconds: 90,
    confidenceGain: 0.62,
    confidenceCap: 0.978,
  },
  {
    code: 'assessment',
    name: 'Оценка запасов',
    description: 'Финальная модель месторождения перед крупными инвестициями.',
    cost: 15000,
    durationSeconds: 180,
    confidenceGain: 0.88,
    confidenceCap: 0.995,
  },
] as const;

const studyByCode = new Map(STUDIES.map((study) => [study.code, study]));

function round(value: number, decimals = 2): number {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function range(value: number, error: number) {
  return {
    min: round(Math.max(0, value * (1 - error)), 4),
    max: round(value * (1 + error), 4),
  };
}

type MatureStudyRow = { id: string; method: Method };
type DepositActualRow = {
  confidence: string;
  quantity_remaining: string;
  depth_from_m: string;
  depth_to_m: string;
  quality: string;
  density: string;
};

async function finalizeMatureStudy(client: PoolClient, playerId: string, depositId: number): Promise<void> {
  const mature = await client.query<MatureStudyRow>(
    `
      SELECT id::text, method
      FROM geology_investigations
      WHERE player_id = $1
        AND deposit_id = $2
        AND status = 'running'
        AND completes_at <= now()
      ORDER BY started_at
      LIMIT 1
      FOR UPDATE
    `,
    [playerId, depositId],
  );

  const study = mature.rows[0];
  if (!study) return;

  const config = studyByCode.get(study.method);
  if (!config) return;

  const actualResult = await client.query<DepositActualRow>(
    `
      SELECT
        COALESCE(k.confidence, 0.1)::text AS confidence,
        d.quantity_remaining::text,
        d.depth_from_m::text,
        d.depth_to_m::text,
        d.quality::text,
        d.density::text
      FROM player_deposit_knowledge k
      JOIN resource_deposits d ON d.id = k.deposit_id
      WHERE k.player_id = $1 AND k.deposit_id = $2
      FOR UPDATE OF k
    `,
    [playerId, depositId],
  );

  const actual = actualResult.rows[0];
  if (!actual) return;

  const currentConfidence = Math.max(0, Math.min(0.999, Number(actual.confidence)));
  const improved = currentConfidence + (1 - currentConfidence) * config.confidenceGain;
  const confidence = Math.max(currentConfidence, Math.min(config.confidenceCap, improved));
  const error = Math.max(0.005, 1 - confidence);

  const quantity = Number(actual.quantity_remaining);
  const depthFrom = Number(actual.depth_from_m);
  const depthTo = Number(actual.depth_to_m);
  const quality = Number(actual.quality);
  const density = Number(actual.density);
  const quantityRange = range(quantity, error);
  const qualityRange = range(quality, error);
  const densityRange = range(density, error);

  await client.query(
    `
      UPDATE player_deposit_knowledge
      SET
        estimated_quantity_min = $3,
        estimated_quantity_max = $4,
        estimated_depth_from_m = $5,
        estimated_depth_to_m = $6,
        estimated_quality = $7,
        estimated_quality_min = $8,
        estimated_quality_max = $9,
        estimated_density_min = $10,
        estimated_density_max = $11,
        confidence = $12,
        updated_at = now()
      WHERE player_id = $1 AND deposit_id = $2
    `,
    [
      playerId,
      depositId,
      quantityRange.min,
      quantityRange.max,
      round(Math.max(0, depthFrom * (1 - error)), 2),
      round(depthTo * (1 + error), 2),
      round(quality, 4),
      qualityRange.min,
      qualityRange.max,
      densityRange.min,
      densityRange.max,
      round(confidence, 4),
    ],
  );

  await client.query(
    `
      UPDATE geology_investigations
      SET status = 'completed', completed_at = now()
      WHERE id = $1
    `,
    [study.id],
  );
}

type StateRow = {
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
  estimated_quality_min: string | null;
  estimated_quality_max: string | null;
  estimated_density_min: string | null;
  estimated_density_max: string | null;
  estimated_quality: string | null;
  confidence: string | null;
  soft_currency: string;
  premium_currency: string;
};

type HistoryRow = { method: Method; completed_at: string };
type ActiveRow = { id: string; method: Method; started_at: string; completes_at: string };

async function loadState(client: PoolClient, playerId: string, depositId: number) {
  const stateResult = await client.query<StateRow>(
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
        k.estimated_quality_min::text,
        k.estimated_quality_max::text,
        k.estimated_density_min::text,
        k.estimated_density_max::text,
        k.estimated_quality::text,
        k.confidence::text,
        w.soft_currency::text,
        w.premium_currency::text
      FROM player_deposit_knowledge k
      JOIN resource_deposits d ON d.id = k.deposit_id
      JOIN resources r ON r.id = d.resource_id
      JOIN wallets w ON w.player_id = k.player_id
      WHERE k.player_id = $1 AND k.deposit_id = $2
    `,
    [playerId, depositId],
  );

  const row = stateResult.rows[0];
  if (!row) return null;

  const [historyResult, activeResult] = await Promise.all([
    client.query<HistoryRow>(
      `
        SELECT method, completed_at::text
        FROM geology_investigations
        WHERE player_id = $1 AND deposit_id = $2 AND status = 'completed'
        ORDER BY completed_at, started_at
      `,
      [playerId, depositId],
    ),
    client.query<ActiveRow>(
      `
        SELECT id::text, method, started_at::text, completes_at::text
        FROM geology_investigations
        WHERE player_id = $1 AND deposit_id = $2 AND status = 'running'
        ORDER BY started_at DESC
        LIMIT 1
      `,
      [playerId, depositId],
    ),
  ]);

  const completedCodes = new Set(historyResult.rows.map((item) => item.method));
  const nextStudy = STUDIES.find((study) => !completedCodes.has(study.code)) ?? null;
  const active = activeResult.rows[0] ?? null;
  const activeConfig = active ? studyByCode.get(active.method) ?? null : null;
  const confidence = Number(row.confidence ?? 0);
  const qualityCenter = Number(row.estimated_quality ?? 0);
  const fallbackError = Math.max(0.05, 1 - confidence);

  return {
    deposit: {
      id: row.deposit_id,
      h3Index: row.h3_index,
      resource: {
        code: row.resource_code,
        name: row.resource_name,
        unit: row.unit,
        rarity: Number(row.rarity),
      },
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
      density: row.estimated_density_min !== null && row.estimated_density_max !== null
        ? { min: Number(row.estimated_density_min), max: Number(row.estimated_density_max) }
        : null,
      confidence: round(confidence, 4),
    },
    completedStudies: historyResult.rows.map((item) => ({
      method: item.method,
      name: studyByCode.get(item.method)?.name ?? item.method,
      completedAt: item.completed_at,
    })),
    activeStudy: active && activeConfig
      ? {
          id: active.id,
          method: active.method,
          name: activeConfig.name,
          startedAt: active.started_at,
          completesAt: active.completes_at,
          durationSeconds: activeConfig.durationSeconds,
        }
      : null,
    nextStudy: nextStudy
      ? {
          method: nextStudy.code,
          name: nextStudy.name,
          description: nextStudy.description,
          cost: nextStudy.cost,
          durationSeconds: nextStudy.durationSeconds,
        }
      : null,
    wallet: {
      soft: Number(row.soft_currency),
      premium: Number(row.premium_currency),
    },
    stage: {
      completed: historyResult.rows.length,
      total: STUDIES.length,
      label: historyResult.rows.length === STUDIES.length
        ? 'Месторождение оценено'
        : historyResult.rows.length === 0
          ? 'Первичный скан'
          : studyByCode.get(historyResult.rows[historyResult.rows.length - 1].method)?.name ?? 'Исследование',
    },
  };
}

export async function geologyInvestigationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:playerId/deposits/:depositId/investigation', async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_investigation_request' });
    }

    const { playerId, depositId } = parsed.data;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await finalizeMatureStudy(client, playerId, depositId);
      const state = await loadState(client, playerId, depositId);
      if (!state) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'deposit_not_known' });
      }
      await client.query('COMMIT');
      return state;
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'investigation_state_failed' });
    } finally {
      client.release();
    }
  });

  app.post('/investigations/start', async (request, reply) => {
    const parsed = startSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_investigation_request', details: parsed.error.flatten() });
    }

    const { playerId, depositId, method } = parsed.data;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await finalizeMatureStudy(client, playerId, depositId);

      const knownResult = await client.query<{ exists: boolean }>(
        `SELECT EXISTS(
          SELECT 1 FROM player_deposit_knowledge WHERE player_id = $1 AND deposit_id = $2
        ) AS exists`,
        [playerId, depositId],
      );
      if (!knownResult.rows[0]?.exists) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'deposit_not_known' });
      }

      const activeResult = await client.query<{ id: string }>(
        `
          SELECT id::text
          FROM geology_investigations
          WHERE player_id = $1 AND deposit_id = $2 AND status = 'running'
          LIMIT 1
          FOR UPDATE
        `,
        [playerId, depositId],
      );
      if (activeResult.rows.length) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'investigation_already_running' });
      }

      const history = await client.query<{ method: Method }>(
        `
          SELECT method
          FROM geology_investigations
          WHERE player_id = $1 AND deposit_id = $2 AND status = 'completed'
          ORDER BY completed_at, started_at
        `,
        [playerId, depositId],
      );
      const completedCodes = new Set(history.rows.map((row) => row.method));
      const next = STUDIES.find((study) => !completedCodes.has(study.code)) ?? null;
      if (!next) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'deposit_fully_assessed' });
      }
      if (next.code !== method) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'investigation_out_of_sequence', expected: next.code });
      }

      const walletResult = await client.query<{ soft_currency: string; premium_currency: string }>(
        `SELECT soft_currency::text, premium_currency::text FROM wallets WHERE player_id = $1 FOR UPDATE`,
        [playerId],
      );
      const wallet = walletResult.rows[0];
      if (!wallet) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'wallet_not_found' });
      }
      if (Number(wallet.soft_currency) < next.cost) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: 'insufficient_soft_currency',
          required: next.cost,
          balance: Number(wallet.soft_currency),
        });
      }

      const studyResult = await client.query<{ id: string; started_at: string; completes_at: string }>(
        `
          INSERT INTO geology_investigations (
            player_id, deposit_id, method, status, soft_cost, started_at, completes_at
          )
          VALUES ($1, $2, $3, 'running', $4, now(), now() + ($5 * interval '1 second'))
          RETURNING id::text, started_at::text, completes_at::text
        `,
        [playerId, depositId, next.code, next.cost, next.durationSeconds],
      );

      await client.query(
        `UPDATE wallets SET soft_currency = soft_currency - $2, updated_at = now() WHERE player_id = $1`,
        [playerId, next.cost],
      );
      await client.query(
        `
          INSERT INTO wallet_transactions (
            player_id, soft_delta, premium_delta, reason, reference_type, reference_id
          )
          VALUES ($1, $2, 0, 'geology_investigation', 'deposit', $3)
        `,
        [playerId, -next.cost, String(depositId)],
      );

      const study = studyResult.rows[0];
      await client.query('COMMIT');

      return {
        status: 'running',
        investigation: {
          id: study.id,
          method: next.code,
          name: next.name,
          startedAt: study.started_at,
          completesAt: study.completes_at,
          durationSeconds: next.durationSeconds,
        },
        charged: next.cost,
        wallet: {
          soft: Number(wallet.soft_currency) - next.cost,
          premium: Number(wallet.premium_currency),
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'investigation_start_failed' });
    } finally {
      client.release();
    }
  });
}
