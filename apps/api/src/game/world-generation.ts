import { db } from '../db.js';
import { GEOLOGY_WORLD_SEED } from './geology-config.js';

/**
 * Materialises visited H3 cells and deterministic geology lazily.
 *
 * A geological point is deliberately larger than a single resolution-12 game
 * cell. We keep at most one generated deposit per resolution-10 parent cell.
 * Resource selection is derived from the same fixed multi-scale world field as
 * the scan heatmap, so newly generated deposits are shared by every player and
 * correlate with the reconnaissance overlay.
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
          h3_cell_to_parent(cell, 10) AS geology_parent,
          row_number() OVER (
            PARTITION BY h3_cell_to_parent(cell, 10)
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
            WHERE h3_cell_to_parent(existing.cell_h3, 10) = ranked_cells.geology_parent
              AND existing.quantity_remaining > 0
          )
      ),
      resource_pool AS (
        SELECT id, code, rarity
        FROM resources
        WHERE active = true
          AND category IN ('ore', 'fuel', 'construction', 'rare')
      ),
      resource_scores AS (
        SELECT
          eligible_cells.cell,
          eligible_cells.geology_parent,
          resource_pool.id AS resource_id,
          resource_pool.code,
          resource_pool.rarity,
          (
            (
              0.34 * (
                ((hashtextextended(resource_pool.code || ':r7:' || h3_cell_to_parent(eligible_cells.geology_parent, 7)::text, $5)
                  & 9223372036854775807::bigint) % 1000000)::numeric / 999999
              )
              + 0.29 * (
                ((hashtextextended(resource_pool.code || ':r8:' || h3_cell_to_parent(eligible_cells.geology_parent, 8)::text, $5 + 11)
                  & 9223372036854775807::bigint) % 1000000)::numeric / 999999
              )
              + 0.22 * (
                ((hashtextextended(resource_pool.code || ':r9:' || h3_cell_to_parent(eligible_cells.geology_parent, 9)::text, $5 + 29)
                  & 9223372036854775807::bigint) % 1000000)::numeric / 999999
              )
              + 0.15 * (
                ((hashtextextended(resource_pool.code || ':r10:' || eligible_cells.geology_parent::text, $5 + 47)
                  & 9223372036854775807::bigint) % 1000000)::numeric / 999999
              )
            )
            * greatest(0.45::numeric, 1.0 - ((resource_pool.rarity - 1)::numeric * 0.055))
          ) AS geology_score
        FROM eligible_cells
        CROSS JOIN resource_pool
      ),
      ranked_resources AS (
        SELECT
          resource_scores.*,
          row_number() OVER (
            PARTITION BY geology_parent
            ORDER BY geology_score DESC, rarity ASC, code
          ) AS resource_rank
        FROM resource_scores
      ),
      chosen AS (
        SELECT
          cell,
          resource_id,
          rarity,
          (
            hashtextextended(
              geology_parent::text || ':' || code || ':deposit',
              $5 + 101
            ) & 9223372036854775807::bigint
          ) AS seed
        FROM ranked_resources
        WHERE resource_rank = 1
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
    [lat, lng, resolution, ring, GEOLOGY_WORLD_SEED],
  );
}
