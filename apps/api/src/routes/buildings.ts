import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';

const constructBodySchema = z.object({
  playerId: z.string().uuid(),
  h3Index: z.string().regex(/^[0-9a-f]+$/i),
  buildingCode: z.string().min(1).max(48),
});

type BuildingTypeRow = {
  id: number;
  code: string;
  name_ru: string;
  category: string;
  min_footprint_cells: number;
  build_time_seconds: number;
  base_cost: string;
};

type WalletRow = { soft_currency: string };
type ClaimRow = { player_id: string };
type ExistingBuildingRow = { building_id: string };
type CreatedBuildingRow = { id: string; completed_at: string };

export async function buildingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/catalog', async () => {
    const result = await db.query<BuildingTypeRow>(
      `
        SELECT id, code, name_ru, category, min_footprint_cells, build_time_seconds, base_cost::text
        FROM building_types
        WHERE active = true
        ORDER BY category, base_cost, code
      `,
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      code: row.code,
      name: row.name_ru,
      category: row.category,
      footprintCells: Number(row.min_footprint_cells),
      buildTimeSeconds: Number(row.build_time_seconds),
      baseCost: Number(row.base_cost),
    }));
  });

  app.post('/construct', async (request, reply) => {
    const parsed = constructBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_construction_request', details: parsed.error.flatten() });
    }

    const { playerId, h3Index, buildingCode } = parsed.data;
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const claimResult = await client.query<ClaimRow>(
        `
          SELECT player_id::text
          FROM territory_claims
          WHERE cell_h3 = $1::h3index AND lease_until > now()
          FOR UPDATE
        `,
        [h3Index],
      );

      const claim = claimResult.rows[0];
      if (!claim || claim.player_id !== playerId) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'territory_not_owned' });
      }

      const typeResult = await client.query<BuildingTypeRow>(
        `
          SELECT id, code, name_ru, category, min_footprint_cells, build_time_seconds, base_cost::text
          FROM building_types
          WHERE code = $1 AND active = true
        `,
        [buildingCode],
      );
      const buildingType = typeResult.rows[0];
      if (!buildingType) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'building_type_not_found' });
      }

      if (Number(buildingType.min_footprint_cells) !== 1) {
        await client.query('ROLLBACK');
        return reply.code(400).send({
          error: 'multi_cell_construction_not_supported_yet',
          requiredCells: Number(buildingType.min_footprint_cells),
        });
      }

      const occupiedResult = await client.query<ExistingBuildingRow>(
        `SELECT building_id::text FROM building_cells WHERE cell_h3 = $1::h3index FOR UPDATE`,
        [h3Index],
      );
      if (occupiedResult.rows[0]) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'cell_already_has_building' });
      }

      const walletResult = await client.query<WalletRow>(
        `SELECT soft_currency::text FROM wallets WHERE player_id = $1 FOR UPDATE`,
        [playerId],
      );
      const wallet = walletResult.rows[0];
      if (!wallet) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'wallet_not_found' });
      }

      const cost = Number(buildingType.base_cost);
      const balance = Number(wallet.soft_currency);
      if (balance < cost) {
        await client.query('ROLLBACK');
        return reply.code(402).send({ error: 'insufficient_funds', required: cost, balance });
      }

      const created = await client.query<CreatedBuildingRow>(
        `
          INSERT INTO buildings (
            owner_player_id,
            building_type_id,
            level,
            status,
            started_at,
            completed_at
          )
          VALUES (
            $1,
            $2,
            1,
            'constructing',
            now(),
            now() + ($3::text || ' seconds')::interval
          )
          RETURNING id::text, completed_at::text
        `,
        [playerId, buildingType.id, buildingType.build_time_seconds],
      );
      const building = created.rows[0];

      await client.query(
        `INSERT INTO building_cells (building_id, cell_h3) VALUES ($1, $2::h3index)`,
        [building.id, h3Index],
      );
      await client.query(
        `UPDATE wallets SET soft_currency = soft_currency - $2, updated_at = now() WHERE player_id = $1`,
        [playerId, cost],
      );
      await client.query(
        `
          INSERT INTO wallet_transactions (player_id, soft_delta, reason, reference_type, reference_id)
          VALUES ($1, $2, 'building_construction', 'building', $3)
        `,
        [playerId, -cost, building.id],
      );

      await client.query('COMMIT');
      return {
        status: 'constructing',
        building: {
          id: building.id,
          code: buildingType.code,
          name: buildingType.name_ru,
          h3Index,
          completesAt: building.completed_at,
        },
        charged: cost,
        balance: balance - cost,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'construction_failed' });
    } finally {
      client.release();
    }
  });
}
