import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { getGeologyCapabilities } from '../game/geology-config.js';

const scanBodySchema = z
  .object({
    playerId: z.string().uuid(),
    playerLat: z.coerce.number().min(-90).max(90),
    playerLng: z.coerce.number().min(-180).max(180),
    targetLat: z.coerce.number().min(-90).max(90).optional(),
    targetLng: z.coerce.number().min(-180).max(180).optional(),
  })
  .superRefine((value, context) => {
    const hasTargetLat = value.targetLat !== undefined;
    const hasTargetLng = value.targetLng !== undefined;

    if (hasTargetLat !== hasTargetLng) {
      context.addIssue({
        code: 'custom',
        path: hasTargetLat ? ['targetLng'] : ['targetLat'],
        message: 'targetLat and targetLng must be supplied together',
      });
    }
  });

type SkillRow = {
  range_level: number;
  coverage_level: number;
  depth_level: number;
  accuracy_level: number;
  sensitivity_level: number;
};

type DistanceRow = {
  distance_m: number;
};

type DepositRow = {
  deposit_id: string;
  h3_index: string;
  resource_code: string;
  resource_name: string;
  rarity: number;
  unit: string;
  depth_from_m: string;
  depth_to_m: string;
  quantity_remaining: string;
  density: string;
  quality: string;
};

function round(value: number, decimals = 2): number {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function estimateRange(value: number, error: number) {
  return {
    min: round(Math.max(0, value * (1 - error))),
    max: round(value * (1 + error)),
  };
}

export async function geologyRoutes(app: FastifyInstance): Promise<void> {
  app.post('/preview', async (request, reply) => {
    const parsed = scanBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_scan_request',
        details: parsed.error.flatten(),
      });
    }

    const { playerId, playerLat, playerLng } = parsed.data;
    const targetLat = parsed.data.targetLat ?? playerLat;
    const targetLng = parsed.data.targetLng ?? playerLng;

    const skillResult = await db.query<SkillRow>(
      `
        SELECT
          range_level,
          coverage_level,
          depth_level,
          accuracy_level,
          sensitivity_level
        FROM player_geology_skills
        WHERE player_id = $1
      `,
      [playerId],
    );

    const skill = skillResult.rows[0];
    if (!skill) {
      return reply.code(404).send({
        error: 'player_geology_not_found',
        message: 'The player does not have a geology profile yet.',
      });
    }

    const capabilities = getGeologyCapabilities({
      rangeLevel: Number(skill.range_level),
      coverageLevel: Number(skill.coverage_level),
      depthLevel: Number(skill.depth_level),
      accuracyLevel: Number(skill.accuracy_level),
      sensitivityLevel: Number(skill.sensitivity_level),
    });

    const distanceResult = await db.query<DistanceRow>(
      `
        SELECT ST_Distance(
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
        ) AS distance_m
      `,
      [playerLng, playerLat, targetLng, targetLat],
    );

    const distanceMeters = Number(distanceResult.rows[0]?.distance_m ?? 0);

    if (distanceMeters > capabilities.rangeMeters) {
      return reply.code(403).send({
        error: 'target_out_of_range',
        distanceMeters: round(distanceMeters),
        maxRangeMeters: capabilities.rangeMeters,
      });
    }

    const depositsResult = await db.query<DepositRow>(
      `
        WITH target AS (
          SELECT h3_lat_lng_to_cell(point($1, $2), 12) AS h3
        ),
        scanned_cells AS (
          SELECT h3_grid_disk(target.h3, $3) AS cell
          FROM target
        )
        SELECT
          deposits.id::text AS deposit_id,
          deposits.cell_h3::text AS h3_index,
          resources.code AS resource_code,
          resources.name_ru AS resource_name,
          resources.rarity,
          resources.unit,
          deposits.depth_from_m::text,
          deposits.depth_to_m::text,
          deposits.quantity_remaining::text,
          deposits.density::text,
          deposits.quality::text
        FROM scanned_cells
        JOIN resource_deposits AS deposits
          ON deposits.cell_h3 = scanned_cells.cell
        JOIN resources
          ON resources.id = deposits.resource_id
        WHERE deposits.depth_from_m <= $4
          AND deposits.quantity_remaining > 0
          AND resources.active = true
          AND resources.rarity <= $5
        ORDER BY resources.rarity, resources.code, deposits.depth_from_m
      `,
      [
        targetLat,
        targetLng,
        capabilities.coverageRing,
        capabilities.maxDepthMeters,
        capabilities.maxVisibleRarity,
      ],
    );

    const targetCellResult = await db.query<{ h3_index: string }>(
      `SELECT h3_lat_lng_to_cell(point($1, $2), 12)::text AS h3_index`,
      [targetLat, targetLng],
    );

    const confidence = round(1 - capabilities.accuracyError, 4);
    const deposits = depositsResult.rows.map((deposit) => {
      const quantity = Number(deposit.quantity_remaining);
      const depthFrom = Number(deposit.depth_from_m);
      const depthTo = Math.min(Number(deposit.depth_to_m), capabilities.maxDepthMeters);
      const quality = Number(deposit.quality);
      const density = Number(deposit.density);

      return {
        id: deposit.deposit_id,
        h3Index: deposit.h3_index,
        resource: {
          code: deposit.resource_code,
          name: deposit.resource_name,
          rarity: Number(deposit.rarity),
          unit: deposit.unit,
        },
        estimates: {
          quantity: estimateRange(quantity, capabilities.accuracyError),
          depthFromMeters: estimateRange(depthFrom, capabilities.accuracyError),
          depthToMeters: estimateRange(depthTo, capabilities.accuracyError),
          quality: estimateRange(quality, capabilities.accuracyError),
          density: estimateRange(density, capabilities.accuracyError),
          confidence,
        },
      };
    });

    const scannedCellCount = 1 + 3 * capabilities.coverageRing * (capabilities.coverageRing + 1);

    return {
      playerId,
      playerPosition: { lat: playerLat, lng: playerLng },
      target: {
        lat: targetLat,
        lng: targetLng,
        h3Index: targetCellResult.rows[0]?.h3_index ?? null,
        distanceMeters: round(distanceMeters),
      },
      capabilities: {
        ...capabilities,
        confidence,
        scannedCellCount,
      },
      deposits,
    };
  });
}
