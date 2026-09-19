import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { getGeologyCapabilities } from '../game/geology-config.js';
import { finalizeMatureGeologyResearch } from '../game/geology-research-service.js';

const bodySchema = z.object({
  playerId: z.string().uuid(),
  playerLat: z.coerce.number().min(-90).max(90),
  playerLng: z.coerce.number().min(-180).max(180),
  targetLat: z.coerce.number().min(-90).max(90),
  targetLng: z.coerce.number().min(-180).max(180),
});

type SkillRow = {
  range_level: number;
  coverage_level: number;
  depth_level: number;
  accuracy_level: number;
  sensitivity_level: number;
};

type DistanceRow = { distance_m: number };
type ScanRow = { id: string };
type KnowledgeRow = {
  deposit_id: string;
  h3_index: string;
  resource_code: string;
  resource_name: string;
  rarity: number;
  unit: string;
  estimated_quantity_min: string;
  estimated_quantity_max: string;
  estimated_depth_from_m: string;
  estimated_depth_to_m: string;
  estimated_quality: string;
  estimated_density_min: string | null;
  estimated_density_max: string | null;
  confidence: string;
};

function midpoint(minValue: string | null, maxValue: string | null): number {
  const min = Number(minValue ?? 0);
  const max = Number(maxValue ?? min);
  return Math.round(((min + max) / 2) * 10_000) / 10_000;
}

export async function geologyScanRoutes(app: FastifyInstance): Promise<void> {
  app.post('/scan', async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_scan_request', details: parsed.error.flatten() });
    }

    const { playerId, playerLat, playerLng, targetLat, targetLng } = parsed.data;

    // Research that reached its server deadline must affect the very next scan.
    await finalizeMatureGeologyResearch(playerId);

    const skillResult = await db.query<SkillRow>(
      `SELECT range_level, coverage_level, depth_level, accuracy_level, sensitivity_level
       FROM player_geology_skills
       WHERE player_id = $1`,
      [playerId],
    );
    const skill = skillResult.rows[0];
    if (!skill) return reply.code(404).send({ error: 'player_geology_not_found' });

    const capabilities = getGeologyCapabilities({
      rangeLevel: Number(skill.range_level),
      coverageLevel: Number(skill.coverage_level),
      depthLevel: Number(skill.depth_level),
      accuracyLevel: Number(skill.accuracy_level),
      sensitivityLevel: Number(skill.sensitivity_level),
    });

    const distanceResult = await db.query<DistanceRow>(
      `SELECT ST_Distance(
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
       ) AS distance_m`,
      [playerLng, playerLat, targetLng, targetLat],
    );
    const distanceMeters = Number(distanceResult.rows[0]?.distance_m ?? Number.POSITIVE_INFINITY);
    if (distanceMeters > capabilities.rangeMeters) {
      return reply.code(403).send({
        error: 'target_out_of_range',
        distanceMeters: Math.round(distanceMeters * 100) / 100,
        maxRangeMeters: capabilities.rangeMeters,
      });
    }

    const confidence = 1 - capabilities.accuracyError;
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const scanResult = await client.query<ScanRow>(
        `INSERT INTO geology_scans (
           player_id, origin, radius_m, max_depth_m, accuracy_level, sensitivity_level
         )
         VALUES (
           $1,
           ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
           $4, $5, $6, $7
         )
         RETURNING id::text`,
        [
          playerId,
          targetLng,
          targetLat,
          capabilities.rangeMeters,
          capabilities.maxDepthMeters,
          skill.accuracy_level,
          skill.sensitivity_level,
        ],
      );
      const scanId = scanResult.rows[0].id;

      // A historical cell may contain several geological horizons for the same
      // commodity. A scan point represents RESOURCE TYPES, so keep the shallowest
      // visible horizon of each resource and expose at most one row per resource.
      await client.query(
        `
          WITH target AS (
            SELECT h3_lat_lng_to_cell(point($1, $2), 12) AS h3
          ),
          scanned_cells AS (
            SELECT h3_grid_disk(target.h3, $3) AS cell FROM target
          ),
          ranked_visible AS (
            SELECT
              d.*,
              row_number() OVER (
                PARTITION BY d.cell_h3, d.resource_id
                ORDER BY d.depth_from_m, d.id
              ) AS resource_rank
            FROM scanned_cells s
            JOIN resource_deposits d ON d.cell_h3 = s.cell
            JOIN resources r ON r.id = d.resource_id
            WHERE d.depth_from_m <= $4
              AND d.quantity_remaining > 0
              AND r.active = true
              AND r.rarity <= $5
          ),
          visible AS (
            SELECT * FROM ranked_visible WHERE resource_rank = 1
          )
          INSERT INTO player_deposit_knowledge (
            player_id,
            deposit_id,
            discovered_at,
            estimated_quantity_min,
            estimated_quantity_max,
            estimated_depth_from_m,
            estimated_depth_to_m,
            estimated_quality,
            estimated_quality_min,
            estimated_quality_max,
            estimated_density_min,
            estimated_density_max,
            confidence,
            updated_at
          )
          SELECT
            $6,
            id,
            now(),
            greatest(0, quantity_remaining * (1 - $7::numeric)),
            quantity_remaining * (1 + $7::numeric),
            greatest(0, depth_from_m * (1 - $7::numeric)),
            least(depth_to_m, $4) * (1 + $7::numeric),
            quality,
            greatest(0, quality * (1 - $7::numeric)),
            quality * (1 + $7::numeric),
            greatest(0, density * (1 - $7::numeric)),
            least(1, density * (1 + $7::numeric)),
            $8::numeric,
            now()
          FROM visible
          ON CONFLICT (player_id, deposit_id) DO UPDATE SET
            estimated_quantity_min = EXCLUDED.estimated_quantity_min,
            estimated_quantity_max = EXCLUDED.estimated_quantity_max,
            estimated_depth_from_m = EXCLUDED.estimated_depth_from_m,
            estimated_depth_to_m = EXCLUDED.estimated_depth_to_m,
            estimated_quality = EXCLUDED.estimated_quality,
            estimated_quality_min = EXCLUDED.estimated_quality_min,
            estimated_quality_max = EXCLUDED.estimated_quality_max,
            estimated_density_min = EXCLUDED.estimated_density_min,
            estimated_density_max = EXCLUDED.estimated_density_max,
            confidence = EXCLUDED.confidence,
            updated_at = now()
          WHERE player_deposit_knowledge.confidence IS NULL
             OR EXCLUDED.confidence >= player_deposit_knowledge.confidence
        `,
        [
          targetLat,
          targetLng,
          capabilities.coverageRing,
          capabilities.maxDepthMeters,
          capabilities.maxVisibleRarity,
          playerId,
          capabilities.accuracyError,
          confidence,
        ],
      );

      const knowledgeResult = await client.query<KnowledgeRow>(
        `
          WITH target AS (
            SELECT h3_lat_lng_to_cell(point($1, $2), 12) AS h3
          ),
          scanned_cells AS (
            SELECT h3_grid_disk(target.h3, $3) AS cell FROM target
          ),
          ranked AS (
            SELECT
              k.deposit_id::text,
              d.cell_h3::text AS h3_index,
              r.code AS resource_code,
              r.name_ru AS resource_name,
              r.rarity,
              r.unit,
              k.estimated_quantity_min::text,
              k.estimated_quantity_max::text,
              k.estimated_depth_from_m::text,
              k.estimated_depth_to_m::text,
              k.estimated_quality::text,
              k.estimated_density_min::text,
              k.estimated_density_max::text,
              k.confidence::text,
              row_number() OVER (
                PARTITION BY d.cell_h3, d.resource_id
                ORDER BY d.depth_from_m, d.id
              ) AS resource_rank
            FROM scanned_cells s
            JOIN resource_deposits d ON d.cell_h3 = s.cell
            JOIN player_deposit_knowledge k ON k.deposit_id = d.id AND k.player_id = $4
            JOIN resources r ON r.id = d.resource_id
            WHERE d.depth_from_m <= $5
              AND d.quantity_remaining > 0
              AND r.active = true
              AND r.rarity <= $6
          )
          SELECT
            deposit_id, h3_index, resource_code, resource_name, rarity, unit,
            estimated_quantity_min, estimated_quantity_max,
            estimated_depth_from_m, estimated_depth_to_m,
            estimated_quality, estimated_density_min, estimated_density_max,
            confidence
          FROM ranked
          WHERE resource_rank = 1
          ORDER BY h3_index, rarity, resource_code
        `,
        [
          targetLat,
          targetLng,
          capabilities.coverageRing,
          playerId,
          capabilities.maxDepthMeters,
          capabilities.maxVisibleRarity,
        ],
      );

      await client.query(`UPDATE geology_scans SET completed_at = now() WHERE id = $1`, [scanId]);
      await client.query('COMMIT');

      return {
        scanId,
        playerId,
        playerPosition: { lat: playerLat, lng: playerLng },
        target: {
          lat: targetLat,
          lng: targetLng,
          distanceMeters: Math.round(distanceMeters * 100) / 100,
        },
        capabilities: {
          ...capabilities,
          confidence: Math.round(confidence * 10_000) / 10_000,
          scannedCellCount: 1 + 3 * capabilities.coverageRing * (capabilities.coverageRing + 1),
        },
        deposits: knowledgeResult.rows.map((row) => ({
          id: row.deposit_id,
          h3Index: row.h3_index,
          resource: {
            code: row.resource_code,
            name: row.resource_name,
            rarity: Number(row.rarity),
            unit: row.unit,
          },
          estimates: {
            quantity: {
              min: Number(row.estimated_quantity_min),
              max: Number(row.estimated_quantity_max),
            },
            depthFromMeters: Number(row.estimated_depth_from_m),
            depthToMeters: Number(row.estimated_depth_to_m),
            quality: Number(row.estimated_quality),
            density: {
              min: Number(row.estimated_density_min ?? 0),
              max: Number(row.estimated_density_max ?? 0),
              value: midpoint(row.estimated_density_min, row.estimated_density_max),
            },
            confidence: Number(row.confidence),
          },
        })),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'scan_failed' });
    } finally {
      client.release();
    }
  });
}
