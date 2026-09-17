import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { getStorePack, STORE_PACKS } from '../game/store-config.js';

const playerParamsSchema = z.object({ playerId: z.string().uuid() });
const purchaseBodySchema = z.object({
  playerId: z.string().uuid(),
  packCode: z.string().trim().min(1).max(64),
});

type WalletRow = {
  soft_currency: string;
  premium_currency: string;
};

type ResourceRow = {
  id: number;
  code: string;
  name_ru: string;
  unit: string;
};

export async function storeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:playerId', async (request, reply) => {
    const parsed = playerParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_player_id' });
    }

    const walletResult = await db.query<WalletRow>(
      'SELECT soft_currency::text, premium_currency::text FROM wallets WHERE player_id = $1',
      [parsed.data.playerId],
    );

    const wallet = walletResult.rows[0];
    if (!wallet) {
      return reply.code(404).send({ error: 'wallet_not_found' });
    }

    return {
      playerId: parsed.data.playerId,
      wallet: {
        soft: Number(wallet.soft_currency),
        premium: Number(wallet.premium_currency),
      },
      packs: STORE_PACKS,
    };
  });

  app.post('/purchase', async (request, reply) => {
    const parsed = purchaseBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_store_purchase', details: parsed.error.flatten() });
    }

    const { playerId, packCode } = parsed.data;
    const pack = getStorePack(packCode);
    if (!pack) {
      return reply.code(404).send({ error: 'store_pack_not_found' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const walletResult = await client.query<WalletRow>(
        `
          SELECT soft_currency::text, premium_currency::text
          FROM wallets
          WHERE player_id = $1
          FOR UPDATE
        `,
        [playerId],
      );
      const wallet = walletResult.rows[0];
      if (!wallet) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'wallet_not_found' });
      }

      const premiumBalance = Number(wallet.premium_currency);
      if (premiumBalance < pack.premiumPrice) {
        await client.query('ROLLBACK');
        return reply.code(402).send({
          error: 'insufficient_premium_currency',
          required: pack.premiumPrice,
          balance: premiumBalance,
        });
      }

      const resources = pack.resourceGrants.length
        ? await client.query<ResourceRow>(
          `
            SELECT id, code, name_ru, unit
            FROM resources
            WHERE code = ANY($1::text[]) AND active = true
          `,
          [pack.resourceGrants.map((grant) => grant.resourceCode)],
        )
        : { rows: [] as ResourceRow[] };

      if (resources.rows.length !== pack.resourceGrants.length) {
        throw new Error('store_pack_resource_configuration_invalid');
      }

      const updatedWalletResult = await client.query<WalletRow>(
        `
          UPDATE wallets
          SET
            soft_currency = soft_currency + $2,
            premium_currency = premium_currency - $3,
            updated_at = now()
          WHERE player_id = $1
          RETURNING soft_currency::text, premium_currency::text
        `,
        [playerId, pack.softGrant, pack.premiumPrice],
      );

      await client.query(
        `
          INSERT INTO wallet_transactions (
            player_id,
            soft_delta,
            premium_delta,
            reason,
            reference_type,
            reference_id
          )
          VALUES ($1, $2, $3, 'store_pack_purchase', 'store_pack', $4)
        `,
        [playerId, pack.softGrant, -pack.premiumPrice, pack.code],
      );

      const grantedResources: Array<{ code: string; name: string; unit: string; quantity: number }> = [];
      for (const grant of pack.resourceGrants) {
        const resource = resources.rows.find((row) => row.code === grant.resourceCode);
        if (!resource) throw new Error('store_pack_resource_configuration_invalid');

        await client.query(
          `
            INSERT INTO player_inventory (player_id, resource_id, quantity)
            VALUES ($1, $2, $3)
            ON CONFLICT (player_id, resource_id) DO UPDATE SET
              quantity = player_inventory.quantity + EXCLUDED.quantity,
              updated_at = now()
          `,
          [playerId, resource.id, grant.quantity],
        );

        await client.query(
          `
            INSERT INTO inventory_transactions (
              player_id,
              resource_id,
              quantity_delta,
              reason,
              reference_type,
              reference_id
            )
            VALUES ($1, $2, $3, 'store_pack_purchase', 'store_pack', $4)
          `,
          [playerId, resource.id, grant.quantity, pack.code],
        );

        grantedResources.push({
          code: resource.code,
          name: resource.name_ru,
          unit: resource.unit,
          quantity: grant.quantity,
        });
      }

      await client.query('COMMIT');
      const updatedWallet = updatedWalletResult.rows[0];
      return {
        status: 'purchased',
        pack: {
          code: pack.code,
          name: pack.name,
        },
        chargedPremium: pack.premiumPrice,
        grantedSoft: pack.softGrant,
        grantedResources,
        wallet: {
          soft: Number(updatedWallet?.soft_currency ?? 0),
          premium: Number(updatedWallet?.premium_currency ?? 0),
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'store_purchase_failed' });
    } finally {
      client.release();
    }
  });
}
