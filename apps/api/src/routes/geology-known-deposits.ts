import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { getResourceMarketPrice } from '../game/market-config.js';

const paramsSchema = z.object({ playerId: z.string().uuid() });

type KnownDepositRow = {
  deposit_id: string;
  h3_index: string;
  resource_code: string;
  resource_name: string;
  rarity: number;
  unit: string;
  confidence: string | null;
  estimated_quantity_min: string | null;
  estimated_quantity_max: string | null;
  updated_at: string;
  completed_studies: string;
  active_method: string | null;
  active_completes_at: string | null;
};

function buildInvestmentProfile(
  resourceCode: string,
  quantityMin: number,
  quantityMax: number,
  confidence: number,
) {
  const marketPrice = getResourceMarketPrice(resourceCode);
  const safeMin = Math.max(0, quantityMin);
  const safeMax = Math.max(safeMin, quantityMax);
  const midpoint = (safeMin + safeMax) / 2;
  const uncertainty = midpoint > 0 ? (safeMax - safeMin) / midpoint : 1;

  const risk = confidence >= 0.95
    ? 'low'
    : confidence >= 0.8
      ? 'moderate'
      : confidence >= 0.55
        ? 'elevated'
        : 'high';

  const recommendation = confidence >= 0.95
    ? 'Модель достаточно точна для инвестиционного решения.'
    : confidence >= 0.8
      ? 'Можно планировать разработку, но дополнительная разведка заметно снизит риск.'
      : confidence >= 0.55
        ? 'Рекомендуется продолжить геологоразведку перед крупными вложениями.'
        : 'Высокая неопределённость. Сначала уточните месторождение.';

  return {
    marketPricePerUnit: marketPrice,
    grossValue: marketPrice
      ? {
          min: Math.floor(safeMin * marketPrice),
          max: Math.floor(safeMax * marketPrice),
        }
      : null,
    uncertainty: Math.round(uncertainty * 10_000) / 10_000,
    risk,
    recommendation,
  };
}

export async function geologyKnownDepositRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:playerId/deposits', async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_player_id' });
    }

    const result = await db.query<KnownDepositRow>(
      `
        SELECT
          d.id::text AS deposit_id,
          d.cell_h3::text AS h3_index,
          r.code AS resource_code,
          r.name_ru AS resource_name,
          r.rarity,
          r.unit,
          k.confidence::text,
          k.estimated_quantity_min::text,
          k.estimated_quantity_max::text,
          k.updated_at::text,
          (
            SELECT count(*)::text
            FROM geology_investigations gi
            WHERE gi.player_id = k.player_id
              AND gi.deposit_id = k.deposit_id
              AND gi.status = 'completed'
          ) AS completed_studies,
          active.method AS active_method,
          active.completes_at::text AS active_completes_at
        FROM player_deposit_knowledge k
        JOIN resource_deposits d ON d.id = k.deposit_id
        JOIN resources r ON r.id = d.resource_id
        LEFT JOIN LATERAL (
          SELECT gi.method, gi.completes_at
          FROM geology_investigations gi
          WHERE gi.player_id = k.player_id
            AND gi.deposit_id = k.deposit_id
            AND gi.status = 'running'
          ORDER BY gi.started_at DESC
          LIMIT 1
        ) active ON true
        WHERE k.player_id = $1
          AND d.quantity_remaining > 0
        ORDER BY
          active.completes_at NULLS LAST,
          k.updated_at DESC,
          r.rarity DESC,
          r.name_ru
        LIMIT 100
      `,
      [parsed.data.playerId],
    );

    return {
      playerId: parsed.data.playerId,
      deposits: result.rows.map((row) => {
        const confidence = Number(row.confidence ?? 0);
        const quantityMin = Number(row.estimated_quantity_min ?? 0);
        const quantityMax = Number(row.estimated_quantity_max ?? 0);

        return {
          id: row.deposit_id,
          h3Index: row.h3_index,
          resource: {
            code: row.resource_code,
            name: row.resource_name,
            rarity: Number(row.rarity),
            unit: row.unit,
          },
          confidence,
          estimatedQuantity: {
            min: quantityMin,
            max: quantityMax,
          },
          investment: buildInvestmentProfile(
            row.resource_code,
            quantityMin,
            quantityMax,
            confidence,
          ),
          completedStudies: Number(row.completed_studies),
          activeStudy: row.active_method
            ? { method: row.active_method, completesAt: row.active_completes_at }
            : null,
          updatedAt: row.updated_at,
        };
      }),
    };
  });
}
