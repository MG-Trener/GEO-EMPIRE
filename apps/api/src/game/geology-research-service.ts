import { db } from '../db.js';
import { GEOLOGY_SKILL_KEYS, type GeologySkillKey } from './geology-config.js';

const skillColumn: Record<GeologySkillKey, string> = {
  range: 'range_level',
  coverage: 'coverage_level',
  depth: 'depth_level',
  accuracy: 'accuracy_level',
  sensitivity: 'sensitivity_level',
};

export type ActiveGeologyResearch = {
  id: string;
  skill: GeologySkillKey;
  targetLevel: number;
  currency: 'soft' | 'premium';
  cost: number;
  startedAt: string;
  completesAt: string;
};

export function geologyResearchDurationSeconds(skill: GeologySkillKey, currentLevel: number): number {
  const base: Record<GeologySkillKey, number> = {
    range: 60,
    coverage: 75,
    depth: 90,
    accuracy: 75,
    sensitivity: 105,
  };
  return Math.round(base[skill] * (1 + Math.max(0, currentLevel - 1) * 0.6));
}

export async function ensureGeologyResearchSchema(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS geology_researches (
      id bigserial PRIMARY KEY,
      player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      skill varchar(32) NOT NULL,
      target_level smallint NOT NULL CHECK (target_level BETWEEN 1 AND 10),
      currency varchar(8) NOT NULL CHECK (currency IN ('soft','premium')),
      cost numeric(18,2) NOT NULL DEFAULT 0,
      status varchar(16) NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','cancelled')),
      started_at timestamptz NOT NULL DEFAULT now(),
      completes_at timestamptz NOT NULL,
      completed_at timestamptz
    )
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS geology_researches_one_running_idx
    ON geology_researches (player_id)
    WHERE status = 'running'
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS geology_researches_player_idx
    ON geology_researches (player_id, started_at DESC)
  `);
}

export async function finalizeMatureGeologyResearch(playerId: string): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{
      id: string;
      skill: string;
      target_level: number;
    }>(
      `
        SELECT id::text, skill, target_level
        FROM geology_researches
        WHERE player_id = $1 AND status = 'running' AND completes_at <= now()
        ORDER BY completes_at
        LIMIT 1
        FOR UPDATE
      `,
      [playerId],
    );

    const mature = result.rows[0];
    if (!mature || !(GEOLOGY_SKILL_KEYS as readonly string[]).includes(mature.skill)) {
      await client.query('COMMIT');
      return;
    }

    const skill = mature.skill as GeologySkillKey;
    const column = skillColumn[skill];
    await client.query(
      `UPDATE player_geology_skills
       SET ${column} = GREATEST(${column}, $2), updated_at = now()
       WHERE player_id = $1`,
      [playerId, Number(mature.target_level)],
    );
    await client.query(
      `UPDATE geology_researches
       SET status = 'completed', completed_at = now()
       WHERE id = $1`,
      [mature.id],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getActiveGeologyResearch(playerId: string): Promise<ActiveGeologyResearch | null> {
  await finalizeMatureGeologyResearch(playerId);
  const result = await db.query<{
    id: string;
    skill: string;
    target_level: number;
    currency: 'soft' | 'premium';
    cost: string;
    started_at: string;
    completes_at: string;
  }>(
    `
      SELECT id::text, skill, target_level, currency, cost::text, started_at::text, completes_at::text
      FROM geology_researches
      WHERE player_id = $1 AND status = 'running'
      ORDER BY started_at DESC
      LIMIT 1
    `,
    [playerId],
  );

  const row = result.rows[0];
  if (!row || !(GEOLOGY_SKILL_KEYS as readonly string[]).includes(row.skill)) return null;
  return {
    id: row.id,
    skill: row.skill as GeologySkillKey,
    targetLevel: Number(row.target_level),
    currency: row.currency,
    cost: Number(row.cost),
    startedAt: row.started_at,
    completesAt: row.completes_at,
  };
}
