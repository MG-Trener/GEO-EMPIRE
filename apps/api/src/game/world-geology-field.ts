import { db } from '../db.js';
import {
  GEOLOGY_HEATMAP_CELL_SPACING_METERS,
  GEOLOGY_HEATMAP_RESOLUTION,
  GEOLOGY_WORLD_SEED,
} from './geology-config.js';

type HeatmapRow = {
  h3_index: string;
  lat: string;
  lng: string;
  distance_m: string;
  resource_code: string;
  resource_name: string;
  rarity: number;
  unit: string;
  intensity: string;
  average_intensity: string;
  peak_intensity: string;
  prospect_score: string;
  resource_rank: string;
};

export type WorldGeologyHeatmap = {
  worldVersion: 'geo-v1';
  resolution: number;
  radiusMeters: number;
  center: { lat: number; lng: number };
  resources: Array<{
    code: string;
    name: string;
    rarity: number;
    unit: string;
    rank: number;
    score: number;
    averageIntensity: number;
    peakIntensity: number;
  }>;
  cells: Array<{
    h3Index: string;
    lat: number;
    lng: number;
    distanceMeters: number;
    values: Array<{ resourceCode: string; intensity: number }>;
  }>;
};

function round(value: number, decimals = 4): number {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Builds a shared deterministic geology field.
 *
 * No player identifier participates in the field calculation. Two players with
 * the same scanner capabilities at the same coordinates therefore receive the
 * same geology. The field is multi-scale: coarse H3 parents create broad zones,
 * while finer parents add local variation suitable for a heatmap overlay.
 */
export async function getWorldGeologyHeatmap(input: {
  lat: number;
  lng: number;
  radiusMeters: number;
  maxVisibleRarity: number;
}): Promise<WorldGeologyHeatmap> {
  const radiusMeters = Math.max(25, Math.min(1200, Math.round(input.radiusMeters)));
  const diskRing = Math.max(
    1,
    Math.min(30, Math.ceil(radiusMeters / GEOLOGY_HEATMAP_CELL_SPACING_METERS) + 1),
  );

  const result = await db.query<HeatmapRow>(
    `
      WITH params AS (
        SELECT h3_lat_lng_to_cell(point($1, $2), $3) AS origin_h3
      ),
      cells AS (
        SELECT h3_grid_disk(params.origin_h3, $4) AS cell
        FROM params
      ),
      cell_points AS (
        SELECT
          cell,
          (h3_cell_to_lat_lng(cell))[0]::double precision AS lat,
          (h3_cell_to_lat_lng(cell))[1]::double precision AS lng
        FROM cells
      ),
      visible_cells AS (
        SELECT
          cell,
          lat,
          lng,
          ST_Distance(
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
            ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
          ) AS distance_m
        FROM cell_points
      ),
      resource_pool AS (
        SELECT id, code, name_ru, rarity, unit
        FROM resources
        WHERE active = true
          AND category IN ('ore', 'fuel', 'construction', 'rare')
          AND rarity <= $6
      ),
      scored AS (
        SELECT
          c.cell::text AS h3_index,
          c.lat,
          c.lng,
          c.distance_m,
          r.code AS resource_code,
          r.name_ru AS resource_name,
          r.rarity,
          r.unit,
          (
            (
              0.34 * (
                ((hashtextextended(r.code || ':r7:' || h3_cell_to_parent(c.cell, 7)::text, $7)
                  & 9223372036854775807::bigint) % 1000000)::numeric / 999999
              )
              + 0.29 * (
                ((hashtextextended(r.code || ':r8:' || h3_cell_to_parent(c.cell, 8)::text, $7 + 11)
                  & 9223372036854775807::bigint) % 1000000)::numeric / 999999
              )
              + 0.22 * (
                ((hashtextextended(r.code || ':r9:' || h3_cell_to_parent(c.cell, 9)::text, $7 + 29)
                  & 9223372036854775807::bigint) % 1000000)::numeric / 999999
              )
              + 0.15 * (
                ((hashtextextended(r.code || ':r10:' || h3_cell_to_parent(c.cell, 10)::text, $7 + 47)
                  & 9223372036854775807::bigint) % 1000000)::numeric / 999999
              )
            )
            * greatest(0.45::numeric, 1.0 - ((r.rarity - 1)::numeric * 0.055))
          ) AS intensity
        FROM visible_cells c
        CROSS JOIN resource_pool r
        WHERE c.distance_m <= $5
      ),
      resource_stats AS (
        SELECT
          resource_code,
          resource_name,
          rarity,
          unit,
          avg(intensity) AS average_intensity,
          max(intensity) AS peak_intensity,
          (avg(intensity) * 0.35 + max(intensity) * 0.65) AS prospect_score
        FROM scored
        GROUP BY resource_code, resource_name, rarity, unit
      ),
      ranked_resources AS (
        SELECT
          resource_stats.*,
          row_number() OVER (
            ORDER BY prospect_score DESC, peak_intensity DESC, rarity ASC, resource_code
          ) AS resource_rank
        FROM resource_stats
      ),
      top_resources AS (
        SELECT *
        FROM ranked_resources
        WHERE resource_rank <= 3
      )
      SELECT
        s.h3_index,
        s.lat::text,
        s.lng::text,
        s.distance_m::text,
        s.resource_code,
        s.resource_name,
        s.rarity,
        s.unit,
        round(s.intensity, 4)::text AS intensity,
        round(t.average_intensity, 4)::text AS average_intensity,
        round(t.peak_intensity, 4)::text AS peak_intensity,
        round(t.prospect_score, 4)::text AS prospect_score,
        t.resource_rank::text
      FROM scored s
      JOIN top_resources t USING (resource_code, resource_name, rarity, unit)
      ORDER BY t.resource_rank, s.distance_m, s.h3_index
    `,
    [
      input.lat,
      input.lng,
      GEOLOGY_HEATMAP_RESOLUTION,
      diskRing,
      radiusMeters,
      input.maxVisibleRarity,
      GEOLOGY_WORLD_SEED,
    ],
  );

  const resourceMap = new Map<string, WorldGeologyHeatmap['resources'][number]>();
  const cellMap = new Map<string, WorldGeologyHeatmap['cells'][number]>();

  for (const row of result.rows) {
    if (!resourceMap.has(row.resource_code)) {
      resourceMap.set(row.resource_code, {
        code: row.resource_code,
        name: row.resource_name,
        rarity: Number(row.rarity),
        unit: row.unit,
        rank: Number(row.resource_rank),
        score: Number(row.prospect_score),
        averageIntensity: Number(row.average_intensity),
        peakIntensity: Number(row.peak_intensity),
      });
    }

    let cell = cellMap.get(row.h3_index);
    if (!cell) {
      cell = {
        h3Index: row.h3_index,
        lat: Number(row.lat),
        lng: Number(row.lng),
        distanceMeters: round(Number(row.distance_m), 2),
        values: [],
      };
      cellMap.set(row.h3_index, cell);
    }

    cell.values.push({
      resourceCode: row.resource_code,
      intensity: Number(row.intensity),
    });
  }

  return {
    worldVersion: 'geo-v1',
    resolution: GEOLOGY_HEATMAP_RESOLUTION,
    radiusMeters,
    center: { lat: input.lat, lng: input.lng },
    resources: [...resourceMap.values()].sort((a, b) => a.rank - b.rank),
    cells: [...cellMap.values()],
  };
}
