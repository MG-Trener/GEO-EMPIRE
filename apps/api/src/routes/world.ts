import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';

const locateQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  resolution: z.coerce.number().int().min(0).max(15).default(12),
  ring: z.coerce.number().int().min(0).max(6).default(1),
});

type WorldCellRow = {
  h3_index: string;
  distance: number;
  lat: number;
  lng: number;
  claim_owner_id: string | null;
  claim_owner_name: string | null;
  lease_until: string | null;
  building_id: string | null;
  building_code: string | null;
  building_name: string | null;
  building_level: number | null;
  building_status: string | null;
};

export async function worldRoutes(app: FastifyInstance): Promise<void> {
  app.get('/locate', async (request, reply) => {
    const parsed = locateQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_location',
        details: parsed.error.flatten(),
      });
    }

    const { lat, lng, resolution, ring } = parsed.data;

    const result = await db.query<WorldCellRow>(
      `
        WITH origin AS (
          SELECT h3_lat_lng_to_cell(point($1, $2), $3) AS h3
        ),
        cells AS (
          SELECT grid.index AS cell, grid.distance
          FROM origin
          CROSS JOIN LATERAL h3_grid_disk_distances(origin.h3, $4) AS grid
        )
        SELECT
          cells.cell::text AS h3_index,
          cells.distance,
          (h3_cell_to_lat_lng(cells.cell))[0] AS lat,
          (h3_cell_to_lat_lng(cells.cell))[1] AS lng,
          claims.player_id::text AS claim_owner_id,
          claim_owner.display_name AS claim_owner_name,
          claims.lease_until::text AS lease_until,
          buildings.id::text AS building_id,
          building_types.code AS building_code,
          building_types.name_ru AS building_name,
          buildings.level AS building_level,
          buildings.status AS building_status
        FROM cells
        LEFT JOIN territory_claims AS claims
          ON claims.cell_h3 = cells.cell
         AND claims.lease_until > now()
        LEFT JOIN players AS claim_owner
          ON claim_owner.id = claims.player_id
        LEFT JOIN building_cells
          ON building_cells.cell_h3 = cells.cell
        LEFT JOIN buildings
          ON buildings.id = building_cells.building_id
        LEFT JOIN building_types
          ON building_types.id = buildings.building_type_id
        ORDER BY cells.distance, cells.cell::text
      `,
      [lat, lng, resolution, ring],
    );

    const cells = result.rows.map((row) => ({
      h3Index: row.h3_index,
      distance: Number(row.distance),
      center: {
        lat: Number(row.lat),
        lng: Number(row.lng),
      },
      occupied: Boolean(row.claim_owner_id || row.building_id),
      claim: row.claim_owner_id
        ? {
            ownerId: row.claim_owner_id,
            ownerName: row.claim_owner_name,
            leaseUntil: row.lease_until,
          }
        : null,
      building: row.building_id
        ? {
            id: row.building_id,
            code: row.building_code,
            name: row.building_name,
            level: row.building_level,
            status: row.building_status,
          }
        : null,
    }));

    return {
      position: { lat, lng },
      resolution,
      ring,
      currentCell: cells.find((cell) => cell.distance === 0) ?? null,
      cells,
    };
  });
}
