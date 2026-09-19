import { db } from '../db.js';

/**
 * Materialises visited H3 cells and deterministic geology lazily.
 *
 * A geological point is deliberately larger than a single resolution-12 game
 * cell. We keep at most one generated deposit per resolution-11 parent cell
 * (roughly one deposit for seven neighbouring gameplay cells). This prevents
 * the map around the player from turning into a carpet of overlapping deposits
 * while keeping exploration useful at starter ranges.
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

  // Pick one representative gameplay cell inside every resolution-11 geology
  // zone touched by this request. If that zone already contains a deposit (for
  // example from an older world version), do not generate another one.
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
      ranked_cells AS (
        SELECT
          cell,
          h3_cell_to_parent(cell, 11) AS geology_parent,
          row_number() OVER (
            PARTITION BY h3_cell_to_parent(cell, 11)
            ORDER BY hashtextextended(cell::text, 77), cell::text
          ) AS cell_rank
        FROM cells
      ),
      eligible_cells AS (
        SELECT cell, geology_parent
        FROM ranked_cells
        WHERE cell_rank = 1
          AND NOT EXISTS (
            SELECT 1
            FROM resource_deposits existing
            WHERE h3_cell_to_parent(existing.cell_h3, 11) = ranked_cells.geology_parent
              AND existing.quantity_remaining > 0
          )
      ),
      resource_pool AS (
        SELECT
          id,
          code,
          rarity,
          row_number() OVER (ORDER BY id) AS rn,
          count(*) OVER () AS pool_size
        FROM resources
        WHERE active = true
          AND category IN ('ore', 'fuel', 'construction', 'rare')
      ),
      seeded AS (
        SELECT
          eligible_cells.cell,
          (hashtextextended(eligible_cells.geology_parent::text, 101) & 9223372036854775807::bigint) AS seed
        FROM eligible_cells
      ),
      chosen AS (
        SELECT seeded.cell, seeded.seed, resource_pool.id AS resource_id, resource_pool.rarity
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
        CASE
          WHEN chosen.rarity <= 2 THEN (chosen.seed % 24)::numeric
          ELSE (25 + (chosen.seed % 390))::numeric
        END,
        CASE
          WHEN chosen.rarity <= 2 THEN ((chosen.seed % 24) + 28 + ((chosen.seed / 97) % 42))::numeric
          ELSE (80 + (chosen.seed % 390) + ((chosen.seed / 113) % 520))::numeric
        END,
        CASE
          WHEN chosen.rarity <= 2 THEN (100000 + (chosen.seed % 1900000))::numeric
          ELSE (40000 + (chosen.seed % 3200000))::numeric
        END,
        CASE
          WHEN chosen.rarity <= 2 THEN (100000 + (chosen.seed % 1900000))::numeric
          ELSE (40000 + (chosen.seed % 3200000))::numeric
        END,
        (0.10 + ((chosen.seed % 820)::numeric / 1000)),
        (38 + ((chosen.seed % 5800)::numeric / 100)),
        chosen.seed
      FROM chosen
      ON CONFLICT (cell_h3, resource_id, depth_from_m, depth_to_m) DO NOTHING
    `,
    [lat, lng, resolution, ring],
  );
}
