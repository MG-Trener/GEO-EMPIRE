import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { TERRITORY_CLAIM_COST } from '../game/economy-config.js';
import { getPlayerTechnologyModifiers } from '../game/technology-service.js';

const paramsSchema = z.object({
  playerId: z.string().uuid(),
  depositId: z.coerce.number().int().positive(),
});

type ParcelRow = {
  h3_index: string;
  owner_id: string | null;
  owner_name: string | null;
  lease_until: string | null;
};

export async function developmentAssistRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:playerId/deposits/:depositId/parcel', async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_development_parcel_request' });

    const { playerId, depositId } = parsed.data;
    const result = await db.query<ParcelRow>(
      `
        SELECT
          d.cell_h3::text AS h3_index,
          c.player_id::text AS owner_id,
          p.display_name AS owner_name,
          c.lease_until::text
        FROM player_deposit_knowledge k
        JOIN resource_deposits d ON d.id = k.deposit_id
        LEFT JOIN territory_claims c
          ON c.cell_h3 = d.cell_h3 AND c.lease_until > now()
        LEFT JOIN players p ON p.id = c.player_id
        WHERE k.player_id = $1 AND k.deposit_id = $2
      `,
      [playerId, depositId],
    );

    const row = result.rows[0];
    if (!row) return reply.code(404).send({ error: 'deposit_not_known' });

    const modifiers = await getPlayerTechnologyModifiers(playerId);
    const claimCost = Math.max(1, Math.round(TERRITORY_CLAIM_COST * modifiers.claimCostMultiplier));
    const status = row.owner_id === playerId ? 'owned' : row.owner_id ? 'rival' : 'free';

    return {
      playerId,
      depositId: String(depositId),
      h3Index: row.h3_index,
      status,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      leaseUntil: row.lease_until,
      claimCost,
      baseClaimCost: TERRITORY_CLAIM_COST,
      technologyDiscountPercent: Math.round((1 - modifiers.claimCostMultiplier) * 10_000) / 100,
    };
  });
}
