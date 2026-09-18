import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { getResourceMarketPrice } from '../game/market-config.js';
import { getPlayerTechnologyModifiers } from '../game/technology-service.js';

const playerParamsSchema = z.object({ playerId: z.string().uuid() });
const sellSchema = z.object({
  playerId: z.string().uuid(),
  resourceId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive().max(1_000_000_000),
});

type InventoryMarketRow = {
  resource_id: number;
  resource_code: string;
  resource_name: string;
  unit: string;
  rarity: number;
  quantity: string;
};
type LockedInventoryRow = InventoryMarketRow & { player_id: string };
type WalletRow = { soft_currency: string; premium_currency: string };

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function effectivePrice(basePrice: number, multiplier: number): number {
  return Math.max(1, Math.round(basePrice * multiplier));
}

export async function marketRoutesV2(app: FastifyInstance): Promise<void> {
  app.get('/:playerId', async (request, reply) => {
    const parsed = playerParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_player_id' });
    const playerId = parsed.data.playerId;

    const [inventoryResult, walletResult, modifiers] = await Promise.all([
      db.query<InventoryMarketRow>(
        `
          SELECT i.resource_id, r.code AS resource_code, r.name_ru AS resource_name,
                 r.unit, r.rarity, i.quantity::text
          FROM player_inventory i
          JOIN resources r ON r.id = i.resource_id
          WHERE i.player_id = $1 AND i.quantity > 0 AND r.active = true
          ORDER BY r.category, r.rarity, r.code
        `,
        [playerId],
      ),
      db.query<WalletRow>(
        `SELECT soft_currency::text, premium_currency::text FROM wallets WHERE player_id = $1`,
        [playerId],
      ),
      getPlayerTechnologyModifiers(playerId),
    ]);

    const wallet = walletResult.rows[0];
    if (!wallet) return reply.code(404).send({ error: 'player_not_found' });

    return {
      playerId,
      wallet: { soft: Number(wallet.soft_currency), premium: Number(wallet.premium_currency) },
      technology: {
        marketPriceMultiplier: modifiers.marketPriceMultiplier,
        priceBonusPercent: Math.round((modifiers.marketPriceMultiplier - 1) * 10_000) / 100,
      },
      offers: inventoryResult.rows.flatMap((row) => {
        const basePricePerUnit = getResourceMarketPrice(row.resource_code);
        if (!basePricePerUnit) return [];
        const pricePerUnit = effectivePrice(basePricePerUnit, modifiers.marketPriceMultiplier);
        const quantity = Number(row.quantity);
        return [{
          resourceId: Number(row.resource_id),
          code: row.resource_code,
          name: row.resource_name,
          unit: row.unit,
          rarity: Number(row.rarity),
          quantity,
          basePricePerUnit,
          pricePerUnit,
          totalValue: Math.floor(quantity * pricePerUnit),
        }];
      }),
    };
  });

  app.post('/sell', async (request, reply) => {
    const parsed = sellSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_market_sale', details: parsed.error.flatten() });

    const { playerId, resourceId } = parsed.data;
    const quantity = round4(parsed.data.quantity);
    if (quantity <= 0) return reply.code(400).send({ error: 'invalid_market_sale' });
    const modifiers = await getPlayerTechnologyModifiers(playerId);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const inventoryResult = await client.query<LockedInventoryRow>(
        `
          SELECT i.player_id::text, i.resource_id, r.code AS resource_code,
                 r.name_ru AS resource_name, r.unit, r.rarity, i.quantity::text
          FROM player_inventory i
          JOIN resources r ON r.id = i.resource_id
          WHERE i.player_id = $1 AND i.resource_id = $2
          FOR UPDATE OF i
        `,
        [playerId, resourceId],
      );
      const inventory = inventoryResult.rows[0];
      if (!inventory) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'inventory_resource_not_found' }); }

      const available = Number(inventory.quantity);
      if (quantity > available) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'insufficient_inventory', available, requested: quantity });
      }

      const basePricePerUnit = getResourceMarketPrice(inventory.resource_code);
      if (!basePricePerUnit) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'resource_not_tradeable' }); }
      const pricePerUnit = effectivePrice(basePricePerUnit, modifiers.marketPriceMultiplier);
      const proceeds = Math.floor(quantity * pricePerUnit);
      if (proceeds <= 0) { await client.query('ROLLBACK'); return reply.code(400).send({ error: 'sale_value_too_small' }); }

      const walletResult = await client.query<WalletRow>(
        `SELECT soft_currency::text, premium_currency::text FROM wallets WHERE player_id = $1 FOR UPDATE`,
        [playerId],
      );
      if (!walletResult.rows[0]) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'wallet_not_found' }); }

      const inventoryAfter = round4(available - quantity);
      await client.query(
        `UPDATE player_inventory SET quantity = $3, updated_at = now() WHERE player_id = $1 AND resource_id = $2`,
        [playerId, resourceId, inventoryAfter],
      );
      await client.query(
        `INSERT INTO inventory_transactions (player_id, resource_id, quantity_delta, reason, reference_type, reference_id)
         VALUES ($1, $2, $3, 'resource_sale', 'market', $4)`,
        [playerId, resourceId, -quantity, inventory.resource_code],
      );
      const updatedWallet = await client.query<WalletRow>(
        `UPDATE wallets SET soft_currency = soft_currency + $2, updated_at = now()
         WHERE player_id = $1 RETURNING soft_currency::text, premium_currency::text`,
        [playerId, proceeds],
      );
      await client.query(
        `INSERT INTO wallet_transactions (player_id, soft_delta, premium_delta, reason, reference_type, reference_id)
         VALUES ($1, $2, 0, 'resource_sale', 'resource', $3)`,
        [playerId, proceeds, inventory.resource_code],
      );

      await client.query('COMMIT');
      const wallet = updatedWallet.rows[0];
      return {
        status: 'sold',
        resource: { id: resourceId, code: inventory.resource_code, name: inventory.resource_name, unit: inventory.unit },
        quantity,
        basePricePerUnit,
        pricePerUnit,
        proceeds,
        technologyBonusPercent: Math.round((modifiers.marketPriceMultiplier - 1) * 10_000) / 100,
        inventoryQuantity: inventoryAfter,
        wallet: { soft: Number(wallet?.soft_currency ?? 0), premium: Number(wallet?.premium_currency ?? 0) },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'market_sale_failed' });
    } finally {
      client.release();
    }
  });
}
