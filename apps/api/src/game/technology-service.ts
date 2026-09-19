import { db } from '../db.js';
import {
  emptyTechnologyLevels,
  getTechnologyModifiers,
  TECHNOLOGY_KEYS,
  type TechnologyKey,
  type TechnologyLevels,
  type TechnologyModifiers,
} from './technology-config.js';

type TechnologyRow = {
  tech_key: string;
  level: number;
};

export type ActiveTechnologyResearch = {
  id: string;
  techKey: TechnologyKey;
  targetLevel: number;
  softCost: number;
  startedAt: string;
  completesAt: string;
};

export async function ensureTechnologySchema(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS player_technologies (
      player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      tech_key varchar(64) NOT NULL,
      level smallint NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 10),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, tech_key)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS player_technologies_player_idx
    ON player_technologies (player_id, updated_at DESC)
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS technology_researches (
      id bigserial PRIMARY KEY,
      player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      tech_key varchar(64) NOT NULL,
      target_level smallint NOT NULL CHECK (target_level BETWEEN 1 AND 10),
      soft_cost numeric(18,2) NOT NULL DEFAULT 0,
      status varchar(16) NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','cancelled')),
      started_at timestamptz NOT NULL DEFAULT now(),
      completes_at timestamptz NOT NULL,
      completed_at timestamptz
    )
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS technology_researches_one_running_idx
    ON technology_researches (player_id)
    WHERE status = 'running'
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS technology_researches_player_idx
    ON technology_researches (player_id, started_at DESC)
  `);
}

export async function finalizeMatureTechnologyResearch(playerId: string): Promise<void> {
  await db.query(
    `
      WITH mature AS (
        SELECT id, tech_key, target_level
        FROM technology_researches
        WHERE player_id = $1 AND status = 'running' AND completes_at <= now()
        ORDER BY completes_at
        LIMIT 1
        FOR UPDATE
      ), applied AS (
        INSERT INTO player_technologies (player_id, tech_key, level, updated_at)
        SELECT $1, tech_key, target_level, now()
        FROM mature
        ON CONFLICT (player_id, tech_key)
        DO UPDATE SET level = GREATEST(player_technologies.level, EXCLUDED.level), updated_at = now()
        RETURNING 1
      )
      UPDATE technology_researches
      SET status = 'completed', completed_at = now()
      WHERE id IN (SELECT id FROM mature)
    `,
    [playerId],
  );
}

export async function getActiveTechnologyResearch(playerId: string): Promise<ActiveTechnologyResearch | null> {
  await finalizeMatureTechnologyResearch(playerId);
  const result = await db.query<{
    id: string;
    tech_key: string;
    target_level: number;
    soft_cost: string;
    started_at: string;
    completes_at: string;
  }>(
    `
      SELECT id::text, tech_key, target_level, soft_cost::text, started_at::text, completes_at::text
      FROM technology_researches
      WHERE player_id = $1 AND status = 'running'
      ORDER BY started_at DESC
      LIMIT 1
    `,
    [playerId],
  );
  const row = result.rows[0];
  if (!row || !(TECHNOLOGY_KEYS as readonly string[]).includes(row.tech_key)) return null;
  return {
    id: row.id,
    techKey: row.tech_key as TechnologyKey,
    targetLevel: Number(row.target_level),
    softCost: Number(row.soft_cost),
    startedAt: row.started_at,
    completesAt: row.completes_at,
  };
}

export async function getPlayerTechnologyLevels(playerId: string): Promise<TechnologyLevels> {
  await finalizeMatureTechnologyResearch(playerId);
  const levels = emptyTechnologyLevels();
  const result = await db.query<TechnologyRow>(
    `
      SELECT tech_key, level
      FROM player_technologies
      WHERE player_id = $1
    `,
    [playerId],
  );

  for (const row of result.rows) {
    if ((TECHNOLOGY_KEYS as readonly string[]).includes(row.tech_key)) {
      levels[row.tech_key as TechnologyKey] = Math.max(0, Math.min(10, Number(row.level)));
    }
  }
  return levels;
}

export async function getPlayerTechnologyModifiers(playerId: string): Promise<TechnologyModifiers> {
  return getTechnologyModifiers(await getPlayerTechnologyLevels(playerId));
}
