import { db } from '../db.js';

/**
 * Materialises the visited H3 area and deterministic geology for it.
 *
 * Each generated cell is assigned one primary resource type. The same resource
 * may have a shallow and a deeper horizon, so technology reveals more of the
 * deposit without turning one map cell into a stack of unrelated commodities.
 *
 * Generation is lazy: only cells requested through /world/locate are stored.
 */
export async function ensureGeneratedWorldArea(
  lat: number,
  lng: number,
  resolution: number,
  ring: number,
): Promise<void> {
  await db.query(
    `
      WITH origin AS (
        SELECT h3_lat_lng_to_cell(point($1, $2), $3) AS h3
      ),
      cells AS (
        SELECT grid.index AS cell
        FROM origin
        CROSS JOIN LATERAL h3_grid_disk_distances(origin.h3, $4) AS grid
      )
      INSERT INTO world_cells (h3_index, resolution, center, terrain_type)
      SELECT
        cell,
        h3_get_resolution(cell),
        ST_SetSRID(
          ST_MakePoint(
            (h3_cell_to_lat_lng(cell))[1],
            (h3_cell_to_lat_lng(cell))[0]
          ),
          4326
        )::geography,
        'generated'
      FROM cells
      ON CONFLICT (h3_index) DO NOTHING
    `,
    [lat, lng, resolution, ring],
  );

  // Starter-visible horizon. The pool is deliberately broad enough to make
  // nearby exploration interesting, but remains rarity <= 2 so a new player
  // always gets a usable first project.
  await db.query(
    `
      WITH origin AS (
        SELECT h3_lat_lng_to_cell(point($1, $2), $3) AS h3
      ),
      cells AS (
        SELECT grid.index AS cell
        FROM origin
        CROSS JOIN LATERAL h3_grid_disk_distances(origin.h3, $4) AS grid
      ),
      resource_pool AS (
        SELECT
          id,
          row_number() OVER (ORDER BY id) AS rn,
          count(*) OVER () AS pool_size
        FROM resources
        WHERE active = true
          AND rarity <= 2
          AND category IN ('ore', 'fuel', 'construction')
      ),
      seeded AS (
        SELECT
          cell,
          (hashtextextended(cell::text, 101) & 9223372036854775807::bigint) AS seed
        FROM cells
      ),
      chosen AS (
        SELECT
          seeded.cell,
          seeded.seed,
          resource_pool.id AS resource_id
        FROM seeded
        JOIN resource_pool
          ON resource_pool.rn = 1 + (seeded.seed % resource_pool.pool_size::bigint)
      )
      INSERT INTO resource_deposits (
        cell_h3,
        resource_id,
        depth_from_m,
        depth_to_m,
        quantity_initial,
        quantity_remaining,
        density,
        quality,
        generation_seed
      )
      SELECT
        chosen.cell,
        chosen.resource_id,
        (chosen.seed % 18)::numeric,
        ((chosen.seed % 18) + 24 + ((chosen.seed / 97) % 28))::numeric,
        (75000 + (chosen.seed % 1925000))::numeric,
        (75000 + (chosen.seed % 1925000))::numeric,
        (0.20 + ((chosen.seed % 760)::numeric / 1000)),
        (45 + ((chosen.seed % 5000)::numeric / 100)),
        chosen.seed
      FROM chosen
      WHERE NOT EXISTS (
        SELECT 1 FROM resource_deposits existing WHERE existing.cell_h3 = chosen.cell
      )
      ON CONFLICT (cell_h3, resource_id, depth_from_m, depth_to_m) DO NOTHING
    `,
    [lat, lng, resolution, ring],
  );

  // A second horizon uses the SAME resource already assigned to the cell.
  // Density varies independently, which later feeds the heatmap and gives the
  // player a reason to compare neighbouring cells of the same commodity.
  await db.query(
    `
      WITH origin AS (
        SELECT h3_lat_lng_to_cell(point($1, $2), $3) AS h3
      ),
      cells AS (
        SELECT grid.index AS cell
        FROM origin
        CROSS JOIN LATERAL h3_grid_disk_distances(origin.h3, $4) AS grid
      ),
      primary_deposit AS (
        SELECT DISTINCT ON (d.cell_h3)
          d.cell_h3 AS cell,
          d.resource_id,
          d.generation_seed
        FROM resource_deposits d
        JOIN cells c ON c.cell = d.cell_h3
        ORDER BY d.cell_h3, d.depth_from_m, d.id
      ),
      seeded AS (
        SELECT
          cell,
          resource_id,
          (hashtextextended(cell::text, 202) & 9223372036854775807::bigint) AS seed
        FROM primary_deposit
      )
      INSERT INTO resource_deposits (
        cell_h3,
        resource_id,
        depth_from_m,
        depth_to_m,
        quantity_initial,
        quantity_remaining,
        density,
        quality,
        generation_seed
      )
      SELECT
        seeded.cell,
        seeded.resource_id,
        (80 + (seeded.seed % 700))::numeric,
        (180 + (seeded.seed % 700) + ((seeded.seed / 131) % 850))::numeric,
        (50000 + (seeded.seed % 4950000))::numeric,
        (50000 + (seeded.seed % 4950000))::numeric,
        (0.08 + ((seeded.seed % 880)::numeric / 1000)),
        (38 + ((seeded.seed % 5900)::numeric / 100)),
        seeded.seed
      FROM seeded
      WHERE NOT EXISTS (
        SELECT 1
        FROM resource_deposits existing
        WHERE existing.cell_h3 = seeded.cell
          AND existing.depth_from_m >= 80
      )
      ON CONFLICT (cell_h3, resource_id, depth_from_m, depth_to_m) DO NOTHING
    `,
    [lat, lng, resolution, ring],
  );
}
