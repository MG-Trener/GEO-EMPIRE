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
}

export async function getPlayerTechnologyLevels(playerId: string): Promise<TechnologyLevels> {
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
