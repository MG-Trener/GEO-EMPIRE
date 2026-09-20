import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { getPlayerTechnologyModifiers } from '../game/technology-service.js';
import {
  TERRITORY_CLAIM_COST,
  TERRITORY_INTERACTION_DISTANCE_METERS,
  TERRITORY_LEASE_DAYS,
} from '../game/economy-config.js';

const claimBodySchema = z.object({
  playerId: z.string().uuid(),
  playerLat: z.coerce.number().min(-90).max(90),
  playerLng: z.coerce.number().min(-180).max(180),
  h3Index: z.string().regex(/^[0-9a-f]+$/i),
});

type ExistingClaimRow = {
  player_id: string;
  owner_name: string | null;
  lease_until: string;
};
type OccupyingBuildingRow = {
  building_id: string;
  owner_player_id: string;
  owner_name: string | null;
  building_name: string | null;
};
type WalletRow = { soft_currency: string };
type DistanceRow = { distance_m: number };
type ClaimRow = { lease_until: string };

export async function territoryRoutesV2(app: FastifyInstance): Promise<void> {
  app.get('/rules', async () => ({
    baseClaimCost: TERRITORY_CLAIM_COST,
    leaseDays: TERRITORY_LEASE_DAYS,
    interactionDistanceMeters: TERRITORY_INTERACTION_DISTANCE_METERS,
  }));

  app.post('/claim', async (request, reply) => {
    const parsed = claimBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_claim_request', details: parsed.error.flatten() });

    const { playerId, playerLat, playerLng, h3Index } = parsed.data;
    const modifiers = await getPlayerTechnologyModifiers(playerId);
    const claimCost = Math.max(1, Math.round(TERRITORY_CLAIM_COST * modifiers.claimCostMultiplier));

    let distanceResult;
    try {
      distanceResult = await db.query<DistanceRow>(
        `
          SELECT ST_Distance(
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            ST_SetSRID(
              ST_MakePoint(
                (h3_cell_to_lat_lng($3::h3index))[1],
                (h3_cell_to_lat_lng($3::h3index))[0]
              ), 4326
            )::geography
          ) AS distance_m
        `,
        [playerLng, playerLat, h3Index],
      );
    } catch {
      return reply.code(400).send({ error: 'invalid_h3_index' });
    }

    const distanceMeters = Number(distanceResult.rows[0]?.distance_m ?? Number.POSITIVE_INFINITY);
    if (distanceMeters > TERRITORY_INTERACTION_DISTANCE_METERS) {
      return reply.code(403).send({
        error: 'territory_out_of_range',
        message: `Для аренды нужно находиться не дальше ${TERRITORY_INTERACTION_DISTANCE_METERS} м от участка`,
        distanceMeters: Math.round(distanceMeters * 100) / 100,
        maxDistanceMeters: TERRITORY_INTERACTION_DISTANCE_METERS,
      });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `
          INSERT INTO world_cells (h3_index, resolution, center)
          VALUES (
            $1::h3index,
            h3_get_resolution($1::h3index),
            ST_SetSRID(
              ST_MakePoint(
                (h3_cell_to_lat_lng($1::h3index))[1],
                (h3_cell_to_lat_lng($1::h3index))[0]
              ), 4326
            )::geography
          )
          ON CONFLICT (h3_index) DO NOTHING
        `,
        [h3Index],
      );

      const existing = await client.query<ExistingClaimRow>(
        `
          SELECT
            c.player_id::text,
            COALESCE(p.company_name, p.display_name) AS owner_name,
            c.lease_until::text
          FROM territory_claims c
          LEFT JOIN players p ON p.id = c.player_id
          WHERE c.cell_h3 = $1::h3index AND c.lease_until > now()
          FOR UPDATE OF c
        `,
        [h3Index],
      );
      const activeClaim = existing.rows[0];
      if (activeClaim) {
        await client.query('ROLLBACK');
        if (activeClaim.player_id === playerId) {
          return reply.send({ status: 'already_owned', h3Index, leaseUntil: activeClaim.lease_until, charged: 0, claimCost });
        }
        return reply.code(409).send({
          error: 'territory_already_claimed',
          message: activeClaim.owner_name
            ? `Участок уже занят компанией «${activeClaim.owner_name}»`
            : 'Участок уже занят другой компанией',
          ownerId: activeClaim.player_id,
          ownerName: activeClaim.owner_name,
        });
      }

      const occupyingBuilding = await client.query<OccupyingBuildingRow>(
        `
          SELECT
            b.id::text AS building_id,
            b.owner_player_id::text,
            COALESCE(p.company_name, p.display_name) AS owner_name,
            bt.name_ru AS building_name
          FROM building_cells bc
          JOIN buildings b ON b.id = bc.building_id
          LEFT JOIN players p ON p.id = b.owner_player_id
          LEFT JOIN building_types bt ON bt.id = b.building_type_id
          WHERE bc.cell_h3 = $1::h3index
          FOR UPDATE OF bc, b
        `,
        [h3Index],
      );
      const building = occupyingBuilding.rows[0];
      if (building && building.owner_player_id !== playerId) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: 'territory_occupied_by_rival_building',
          message: building.owner_name
            ? `На участке уже находится объект компании «${building.owner_name}»`
            : 'На участке уже находится объект другой компании',
          ownerId: building.owner_player_id,
          ownerName: building.owner_name,
          buildingId: building.building_id,
          buildingName: building.building_name,
        });
      }

      const walletResult = await client.query<WalletRow>(
        `SELECT soft_currency::text FROM wallets WHERE player_id = $1 FOR UPDATE`,
        [playerId],
      );
      const wallet = walletResult.rows[0];
      if (!wallet) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'wallet_not_found' }); }

      const currentBalance = Number(wallet.soft_currency);
      if (currentBalance < claimCost) {
        await client.query('ROLLBACK');
        return reply.code(402).send({ error: 'insufficient_funds', required: claimCost, balance: currentBalance });
      }

      const claimResult = await client.query<ClaimRow>(
        `
          INSERT INTO territory_claims (cell_h3, player_id, claimed_at, lease_until)
          VALUES ($1::h3index, $2, now(), now() + ($3::text || ' days')::interval)
          ON CONFLICT (cell_h3) DO UPDATE SET
            player_id = EXCLUDED.player_id,
            claimed_at = EXCLUDED.claimed_at,
            lease_until = EXCLUDED.lease_until
          WHERE territory_claims.lease_until <= now()
          RETURNING lease_until::text
        `,
        [h3Index, playerId, TERRITORY_LEASE_DAYS],
      );
      if (!claimResult.rows[0]) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: 'territory_already_claimed',
          message: 'Участок уже успела занять другая компания',
        });
      }

      await client.query(`UPDATE wallets SET soft_currency = soft_currency - $2, updated_at = now() WHERE player_id = $1`, [playerId, claimCost]);
      await client.query(
        `INSERT INTO wallet_transactions (player_id, soft_delta, reason, reference_type, reference_id)
         VALUES ($1, $2, 'territory_claim', 'h3_cell', $3)`,
        [playerId, -claimCost, h3Index],
      );

      await client.query('COMMIT');
      return {
        status: 'claimed',
        h3Index,
        leaseUntil: claimResult.rows[0].lease_until,
        baseClaimCost: TERRITORY_CLAIM_COST,
        claimCost,
        technologyDiscountPercent: Math.round((1 - modifiers.claimCostMultiplier) * 10_000) / 100,
        charged: claimCost,
        balance: currentBalance - claimCost,
        interaction: {
          distanceMeters: Math.round(distanceMeters * 100) / 100,
          maxDistanceMeters: TERRITORY_INTERACTION_DISTANCE_METERS,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'claim_failed' });
    } finally {
      client.release();
    }
  });
}
