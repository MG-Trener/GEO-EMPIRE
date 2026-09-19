import { db } from '../db.js';

/**
 * Materialises visited H3 cells and deterministic geology lazily.
 *
 * Every generated point has a deterministic target of 1-3 DISTINCT resource
 * types. Existing worlds are upgraded in place: old cells keep their current
 * deposits and receive extra resource types until they reach their target.
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

  // Guarantee one starter-visible commodity in every new cell. This keeps the
  // first hours playable even when the additional resources are deeper/rarer.
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
        SELECT seeded.cell, seeded.seed, resource_pool.id AS resource_id
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

  // Fill each cell to its deterministic target of 1-3 distinct commodities.
  // The candidate order is deterministic per H3 cell, so revisiting the same
  // place never rerolls geology.
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
      seeded AS (
        SELECT
          cell,
          (hashtextextended(cell::text, 303) & 9223372036854775807::bigint) AS seed,
          1 + ((hashtextextended(cell::text, 404) & 9223372036854775807::bigint) % 3)::int AS target_count
        FROM cells
      ),
      existing_counts AS (
        SELECT
          seeded.cell,
          seeded.seed,
          seeded.target_count,
          count(DISTINCT d.resource_id)::int AS existing_count
        FROM seeded
        LEFT JOIN resource_deposits d ON d.cell_h3 = seeded.cell
        GROUP BY seeded.cell, seeded.seed, seeded.target_count
      ),
      candidates AS (
        SELECT
          ec.cell,
          ec.seed,
          ec.target_count,
          ec.existing_count,
          r.id AS resource_id,
          r.rarity,
          (hashtextextended(ec.cell::text || ':' || r.code, 505) & 9223372036854775807::bigint) AS resource_seed,
          row_number() OVER (
            PARTITION BY ec.cell
            ORDER BY hashtextextended(ec.cell::text || ':' || r.code, 606), r.id
          ) AS rn
        FROM existing_counts ec
        CROSS JOIN resources r
        WHERE r.active = true
          AND r.category IN ('ore', 'fuel', 'construction', 'rare')
          AND NOT EXISTS (
            SELECT 1
            FROM resource_deposits d
            WHERE d.cell_h3 = ec.cell AND d.resource_id = r.id
          )
      ),
      chosen AS (
        SELECT *
        FROM candidates
        WHERE rn <= GREATEST(0, target_count - existing_count)
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
        (12 + (chosen.resource_seed % 420))::numeric,
        (55 + (chosen.resource_seed % 420) + ((chosen.resource_seed / 113) % 520))::numeric,
        (40000 + (chosen.resource_seed % 3200000))::numeric,
        (40000 + (chosen.resource_seed % 3200000))::numeric,
        (0.08 + ((chosen.resource_seed % 900)::numeric / 1000)),
        (35 + ((chosen.resource_seed % 6300)::numeric / 100)),
        chosen.resource_seed
      FROM chosen
      ON CONFLICT (cell_h3, resource_id, depth_from_m, depth_to_m) DO NOTHING
    `,
    [lat, lng, resolution, ring],
  );
}
