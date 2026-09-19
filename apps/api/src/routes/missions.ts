import type { FastifyInstance } from 'fastify';
import type { PoolClient, Pool } from 'pg';
import { z } from 'zod';
import { db } from '../db.js';

const paramsSchema = z.object({ playerId: z.string().uuid() });
const claimSchema = z.object({ missionCode: z.string().min(1).max(64) });

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

type MissionProgress = {
  knownDeposits: number;
  territories: number;
  buildings: number;
  extractions: number;
  technologyLevels: number;
  sales: number;
};

type MissionDefinition = {
  code: string;
  title: string;
  body: string;
  rewardSoft: number;
  complete: (progress: MissionProgress) => boolean;
};

const MISSIONS: readonly MissionDefinition[] = [
  {
    code: 'first_scan',
    title: 'Найдите первое месторождение',
    body: 'Проведите георазведку и обнаружьте первую промышленную залежь.',
    rewardSoft: 3_000,
    complete: (p) => p.knownDeposits >= 1,
  },
  {
    code: 'first_claim',
    title: 'Закрепите территорию',
    body: 'Возьмите в аренду первый участок с найденным ресурсом.',
    rewardSoft: 5_000,
    complete: (p) => p.territories >= 1,
  },
  {
    code: 'first_build',
    title: 'Постройте добывающий объект',
    body: 'Создайте первую шахту, карьер или скважину.',
    rewardSoft: 7_500,
    complete: (p) => p.buildings >= 1,
  },
  {
    code: 'first_extraction',
    title: 'Запустите добычу',
    body: 'Запустите первый промышленный объект и начните выпуск ресурса.',
    rewardSoft: 10_000,
    complete: (p) => p.extractions >= 1,
  },
  {
    code: 'first_technology',
    title: 'Запустите исследование технологии',
    body: 'Исследуйте первый уровень производственной, экономической или логистической технологии.',
    rewardSoft: 12_500,
    complete: (p) => p.technologyLevels >= 1,
  },
  {
    code: 'first_sale',
    title: 'Заключите первую сделку',
    body: 'Продайте добытый ресурс на рынке.',
    rewardSoft: 15_000,
    complete: (p) => p.sales >= 1,
  },
] as const;

export async function ensureMissionSchema(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS player_mission_rewards (
      player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      mission_code varchar(64) NOT NULL,
      soft_reward numeric(18,2) NOT NULL DEFAULT 0,
      claimed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, mission_code)
    )
  `);
}

async function loadProgress(queryable: Queryable, playerId: string): Promise<MissionProgress> {
  const result = await queryable.query<{
    known_deposits: string;
    territories: string;
    buildings: string;
    extractions: string;
    technology_levels: string;
    sales: string;
  }>(
    `
      SELECT
        (SELECT count(*)::text FROM player_deposit_knowledge WHERE player_id = $1) AS known_deposits,
        (SELECT count(*)::text FROM territory_claims WHERE player_id = $1 AND lease_until > now()) AS territories,
        (SELECT count(*)::text FROM buildings WHERE owner_player_id = $1) AS buildings,
        (SELECT count(*)::text FROM extraction_operations WHERE player_id = $1) AS extractions,
        (SELECT COALESCE(sum(level), 0)::text FROM player_technologies WHERE player_id = $1) AS technology_levels,
        (SELECT count(*)::text FROM wallet_transactions WHERE player_id = $1 AND reason = 'resource_sale') AS sales
    `,
    [playerId],
  );
  const row = result.rows[0];
  return {
    knownDeposits: Number(row?.known_deposits ?? 0),
    territories: Number(row?.territories ?? 0),
    buildings: Number(row?.buildings ?? 0),
    extractions: Number(row?.extractions ?? 0),
    technologyLevels: Number(row?.technology_levels ?? 0),
    sales: Number(row?.sales ?? 0),
  };
}

async function loadClaimed(queryable: Queryable, playerId: string): Promise<Set<string>> {
  const result = await queryable.query<{ mission_code: string }>(
    `SELECT mission_code FROM player_mission_rewards WHERE player_id = $1`,
    [playerId],
  );
  return new Set(result.rows.map((row) => row.mission_code));
}

function missionState(progress: MissionProgress, claimed: Set<string>) {
  let previousClaimed = true;
  const missions = MISSIONS.map((mission, index) => {
    const isClaimed = claimed.has(mission.code);
    const completed = mission.complete(progress);
    const unlocked = previousClaimed;
    previousClaimed = previousClaimed && isClaimed;
    return {
      step: index + 1,
      total: MISSIONS.length,
      code: mission.code,
      title: mission.title,
      body: mission.body,
      rewardSoft: mission.rewardSoft,
      completed,
      claimed: isClaimed,
      unlocked,
      claimable: unlocked && completed && !isClaimed,
    };
  });
  const current = missions.find((mission) => !mission.claimed) ?? null;
  return { missions, currentCode: current?.code ?? null, allClaimed: current === null };
}

export async function missionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:playerId/missions', async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_player_id' });
    const playerId = parsed.data.playerId;
    const [progress, claimed, walletResult] = await Promise.all([
      loadProgress(db, playerId),
      loadClaimed(db, playerId),
      db.query<{ soft_currency: string }>('SELECT soft_currency::text FROM wallets WHERE player_id = $1', [playerId]),
    ]);
    if (!walletResult.rows[0]) return reply.code(404).send({ error: 'player_not_found' });
    return {
      playerId,
      ...missionState(progress, claimed),
      walletSoft: Number(walletResult.rows[0].soft_currency),
    };
  });

  app.post('/:playerId/missions/claim', async (request, reply) => {
    const parsedParams = paramsSchema.safeParse(request.params);
    const parsedBody = claimSchema.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) return reply.code(400).send({ error: 'invalid_mission_claim' });

    const { playerId } = parsedParams.data;
    const mission = MISSIONS.find((item) => item.code === parsedBody.data.missionCode);
    if (!mission) return reply.code(404).send({ error: 'mission_not_found' });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const walletResult = await client.query<{ soft_currency: string }>(
        'SELECT soft_currency::text FROM wallets WHERE player_id = $1 FOR UPDATE',
        [playerId],
      );
      if (!walletResult.rows[0]) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'player_not_found' });
      }

      const [progress, claimed] = await Promise.all([
        loadProgress(client, playerId),
        loadClaimed(client, playerId),
      ]);
      if (claimed.has(mission.code)) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'mission_already_claimed' });
      }
      const missionIndex = MISSIONS.findIndex((item) => item.code === mission.code);
      const previousComplete = MISSIONS.slice(0, missionIndex).every((item) => claimed.has(item.code));
      if (!previousComplete) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'mission_locked' });
      }
      if (!mission.complete(progress)) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'mission_not_completed' });
      }

      await client.query(
        `INSERT INTO player_mission_rewards (player_id, mission_code, soft_reward) VALUES ($1, $2, $3)`,
        [playerId, mission.code, mission.rewardSoft],
      );
      const walletAfter = await client.query<{ soft_currency: string }>(
        `UPDATE wallets SET soft_currency = soft_currency + $2, updated_at = now()
         WHERE player_id = $1 RETURNING soft_currency::text`,
        [playerId, mission.rewardSoft],
      );
      await client.query(
        `INSERT INTO wallet_transactions (player_id, soft_delta, premium_delta, reason, reference_type, reference_id)
         VALUES ($1, $2, 0, 'mission_reward', 'mission', $3)`,
        [playerId, mission.rewardSoft, mission.code],
      );
      await client.query('COMMIT');
      return {
        status: 'claimed',
        missionCode: mission.code,
        rewardSoft: mission.rewardSoft,
        walletSoft: Number(walletAfter.rows[0]?.soft_currency ?? 0),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'mission_claim_failed' });
    } finally {
      client.release();
    }
  });
}
