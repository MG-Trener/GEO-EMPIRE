import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { ensureGeneratedWorldArea } from '../game/world-generation.js';

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
  building_started_at: string | null;
  building_completed_at: string | null;
  building_owner_id: string | null;
  building_owner_name: string | null;
  extraction_resource_code: string | null;
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

    // Materialise visited cells and deterministic geology before returning the
    // map. Geology generation is sparse, so nearby gameplay cells no longer
    // each create their own overlapping deposit.
    await ensureGeneratedWorldArea(lat, lng, resolution, ring);

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
          COALESCE(claim_owner.company_name, claim_owner.display_name) AS claim_owner_name,
          claims.lease_until::text AS lease_until,
          buildings.id::text AS building_id,
          building_types.code AS building_code,
          building_types.name_ru AS building_name,
          buildings.level AS building_level,
          buildings.status AS building_status,
          buildings.started_at::text AS building_started_at,
          buildings.completed_at::text AS building_completed_at,
          buildings.owner_player_id::text AS building_owner_id,
          COALESCE(building_owner.company_name, building_owner.display_name) AS building_owner_name,
          extraction_resource.code AS extraction_resource_code
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
        LEFT JOIN players AS building_owner
          ON building_owner.id = buildings.owner_player_id
        LEFT JOIN building_types
          ON building_types.id = buildings.building_type_id
        LEFT JOIN extraction_operations
          ON extraction_operations.building_id = buildings.id
        LEFT JOIN resource_deposits AS extraction_deposit
          ON extraction_deposit.id = extraction_operations.deposit_id
        LEFT JOIN resources AS extraction_resource
          ON extraction_resource.id = extraction_deposit.resource_id
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
            startedAt: row.building_started_at,
            completedAt: row.building_completed_at,
            ownerId: row.building_owner_id,
            ownerName: row.building_owner_name,
            resourceCode: row.extraction_resource_code,
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
