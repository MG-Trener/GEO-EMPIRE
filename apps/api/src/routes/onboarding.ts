import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';

const bootstrapBodySchema = z.object({
  authSubject: z.string().trim().min(3).max(160),
  displayName: z.string().trim().min(2).max(64).optional(),
  companyName: z.string().trim().min(2).max(96).optional(),
});

type PlayerRow = {
  id: string;
  display_name: string;
  company_name: string | null;
  soft_currency: string;
  premium_currency: string;
  range_level: number;
  coverage_level: number;
  depth_level: number;
  accuracy_level: number;
  sensitivity_level: number;
  territories: string;
  buildings: string;
  known_deposits: string;
};

async function loadPlayer(client: { query: typeof db.query }, playerId: string): Promise<PlayerRow | undefined> {
  const result = await client.query<PlayerRow>(
    `
      SELECT
        p.id::text,
        p.display_name,
        p.company_name,
        w.soft_currency::text,
        w.premium_currency::text,
        g.range_level,
        g.coverage_level,
        g.depth_level,
        g.accuracy_level,
        g.sensitivity_level,
        (SELECT count(*)::text FROM territory_claims t WHERE t.player_id = p.id AND t.lease_until > now()) AS territories,
        (SELECT count(*)::text FROM buildings b WHERE b.owner_player_id = p.id) AS buildings,
        (SELECT count(*)::text FROM player_deposit_knowledge k WHERE k.player_id = p.id) AS known_deposits
      FROM players p
      JOIN wallets w ON w.player_id = p.id
      JOIN player_geology_skills g ON g.player_id = p.id
      WHERE p.id = $1
    `,
    [playerId],
  );

  return result.rows[0];
}

function serializePlayer(row: PlayerRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    companyName: row.company_name,
    wallet: {
      soft: Number(row.soft_currency),
      premium: Number(row.premium_currency),
    },
    geology: {
      range: Number(row.range_level),
      coverage: Number(row.coverage_level),
      depth: Number(row.depth_level),
      accuracy: Number(row.accuracy_level),
      sensitivity: Number(row.sensitivity_level),
    },
    stats: {
      territories: Number(row.territories),
      buildings: Number(row.buildings),
      knownDeposits: Number(row.known_deposits),
    },
  };
}

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/bootstrap', async (request, reply) => {
    const parsed = bootstrapBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_onboarding_request', details: parsed.error.flatten() });
    }

    const { authSubject, displayName, companyName } = parsed.data;
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const existing = await client.query<{ id: string }>(
        'SELECT id::text FROM players WHERE auth_subject = $1 FOR UPDATE',
        [authSubject],
      );

      let playerId = existing.rows[0]?.id;
      let status: 'existing' | 'created' = 'existing';

      if (playerId) {
        if (displayName && companyName) {
          await client.query(
            `
              UPDATE players
              SET display_name = $2, company_name = $3, updated_at = now()
              WHERE id = $1
            `,
            [playerId, displayName, companyName],
          );
        }
      } else {
        if (!displayName || !companyName) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'player_not_found' });
        }

        const created = await client.query<{ id: string }>(
          `
            INSERT INTO players (auth_subject, display_name, company_name)
            VALUES ($1, $2, $3)
            RETURNING id::text
          `,
          [authSubject, displayName, companyName],
        );

        playerId = created.rows[0]?.id;
        if (!playerId) {
          throw new Error('player_insert_failed');
        }

        await client.query(
          'INSERT INTO player_geology_skills (player_id) VALUES ($1)',
          [playerId],
        );
        await client.query(
          'INSERT INTO wallets (player_id, soft_currency, premium_currency) VALUES ($1, 50000, 25)',
          [playerId],
        );
        await client.query(
          `
            INSERT INTO wallet_transactions (
              player_id,
              soft_delta,
              premium_delta,
              reason,
              reference_type,
              reference_id
            )
            VALUES ($1, 50000, 25, 'starter_grant', 'onboarding', 'initial_company')
          `,
          [playerId],
        );
        status = 'created';
      }

      const row = await loadPlayer(client, playerId);
      if (!row) {
        throw new Error('player_bootstrap_failed');
      }

      await client.query('COMMIT');
      return {
        status,
        starterGrant: status === 'created' ? { soft: 50000, premium: 25 } : null,
        player: serializePlayer(row),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'onboarding_failed' });
    } finally {
      client.release();
    }
  });
}
