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
  claim_owner_id: string | null;
  claim_owner_name: string | null;
  lease_until: string | null;
  building_id: string | null;
  building_owner_id: string | null;
  building_owner_name: string | null;
  building_name: string | null;
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
          c.player_id::text AS claim_owner_id,
          COALESCE(claim_player.company_name, claim_player.display_name) AS claim_owner_name,
          c.lease_until::text,
          b.id::text AS building_id,
          b.owner_player_id::text AS building_owner_id,
          COALESCE(building_player.company_name, building_player.display_name) AS building_owner_name,
          bt.name_ru AS building_name
        FROM player_deposit_knowledge k
        JOIN resource_deposits d ON d.id = k.deposit_id
        LEFT JOIN territory_claims c
          ON c.cell_h3 = d.cell_h3 AND c.lease_until > now()
        LEFT JOIN players claim_player ON claim_player.id = c.player_id
        LEFT JOIN building_cells bc ON bc.cell_h3 = d.cell_h3
        LEFT JOIN buildings b ON b.id = bc.building_id
        LEFT JOIN players building_player ON building_player.id = b.owner_player_id
        LEFT JOIN building_types bt ON bt.id = b.building_type_id
        WHERE k.player_id = $1 AND k.deposit_id = $2
      `,
      [playerId, depositId],
    );

    const row = result.rows[0];
    if (!row) return reply.code(404).send({ error: 'deposit_not_known' });

    const modifiers = await getPlayerTechnologyModifiers(playerId);
    const claimCost = Math.max(1, Math.round(TERRITORY_CLAIM_COST * modifiers.claimCostMultiplier));

    // A physical object is authoritative for occupancy even when its old lease
    // has expired. This prevents the development screen from showing a rival
    // mine/well as a free parcel.
    const ownerId = row.building_owner_id ?? row.claim_owner_id;
    const ownerName = row.building_owner_name ?? row.claim_owner_name;
    const ownedByPlayer = row.claim_owner_id === playerId || row.building_owner_id === playerId;
    const occupiedByRival = Boolean(
      (row.claim_owner_id && row.claim_owner_id !== playerId)
      || (row.building_owner_id && row.building_owner_id !== playerId),
    );
    const status = occupiedByRival ? 'rival' : ownedByPlayer ? 'owned' : 'free';

    return {
      playerId,
      depositId: String(depositId),
      h3Index: row.h3_index,
      status,
      ownerId,
      ownerName,
      leaseUntil: row.lease_until,
      occupyingBuilding: row.building_id
        ? {
            id: row.building_id,
            name: row.building_name,
            ownerId: row.building_owner_id,
            ownerName: row.building_owner_name,
          }
        : null,
      claimCost,
      baseClaimCost: TERRITORY_CLAIM_COST,
      technologyDiscountPercent: Math.round((1 - modifiers.claimCostMultiplier) * 10_000) / 100,
    };
  });
}
