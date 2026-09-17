import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';

const paramsSchema = z.object({ playerId: z.string().uuid() });

type SummaryRow = {
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

export async function playerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:playerId/summary', async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_player_id' });
    }

    const result = await db.query<SummaryRow>(
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
      [parsed.data.playerId],
    );

    const row = result.rows[0];
    if (!row) {
      return reply.code(404).send({ error: 'player_not_found' });
    }

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
  });
}
