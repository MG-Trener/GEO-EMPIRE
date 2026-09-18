import { db } from '../db.js';

/**
 * Materialises the visited H3 area and deterministic geology for it.
 *
 * Every generated cell gets at least one shallow, low-rarity deposit that a
 * starter geologist can discover. A second deterministic layer is generated
 * deeper underground so geology upgrades continue to reveal new value.
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

  // A starter-visible layer. Restrict the pool to actual underground/mineral
  // resources and rarity <= 2 so a level-1 scan can always find something.
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
        (0.25 + ((chosen.seed % 650)::numeric / 1000)),
        (45 + ((chosen.seed % 5000)::numeric / 100)),
        chosen.seed
      FROM chosen
      WHERE NOT EXISTS (
        SELECT 1
        FROM resource_deposits existing
        JOIN resources resource ON resource.id = existing.resource_id
        WHERE existing.cell_h3 = chosen.cell
          AND existing.depth_from_m <= 50
          AND resource.rarity <= 2
      )
      ON CONFLICT (cell_h3, resource_id, depth_from_m, depth_to_m) DO NOTHING
    `,
    [lat, lng, resolution, ring],
  );

  // A deeper layer in every cell. It can be common or rare and becomes visible
  // as depth/sensitivity skills grow. All values remain deterministic per H3.
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
          AND category IN ('ore', 'fuel', 'construction', 'rare')
      ),
      seeded AS (
        SELECT
          cell,
          (hashtextextended(cell::text, 202) & 9223372036854775807::bigint) AS seed
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
        (80 + (chosen.seed % 700))::numeric,
        (180 + (chosen.seed % 700) + ((chosen.seed / 131) % 850))::numeric,
        (50000 + (chosen.seed % 4950000))::numeric,
        (50000 + (chosen.seed % 4950000))::numeric,
        (0.08 + ((chosen.seed % 880)::numeric / 1000)),
        (38 + ((chosen.seed % 5900)::numeric / 100)),
        chosen.seed
      FROM chosen
      ON CONFLICT (cell_h3, resource_id, depth_from_m, depth_to_m) DO NOTHING
    `,
    [lat, lng, resolution, ring],
  );
}
