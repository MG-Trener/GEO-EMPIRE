import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import {
  getTechnologyEffectValue,
  getTechnologyModifiers,
  getTechnologyUpgradeCost,
  TECHNOLOGY_DEFINITIONS,
  TECHNOLOGY_KEYS,
  type TechnologyKey,
} from '../game/technology-config.js';
import { getPlayerTechnologyLevels } from '../game/technology-service.js';

const paramsSchema = z.object({ playerId: z.string().uuid() });
const bodySchema = z.object({ techKey: z.enum(TECHNOLOGY_KEYS) });

type WalletRow = { soft_currency: string; premium_currency: string };
type LevelRow = { level: number };

function technologyOptions(levels: Awaited<ReturnType<typeof getPlayerTechnologyLevels>>) {
  return TECHNOLOGY_DEFINITIONS.map((definition) => {
    const currentLevel = levels[definition.key];
    const nextLevel = currentLevel >= 10 ? null : currentLevel + 1;
    return {
      key: definition.key,
      category: definition.category,
      title: definition.title,
      description: definition.description,
      effect: definition.effect,
      currentLevel,
      nextLevel,
      maxed: currentLevel >= 10,
      priceSoft: getTechnologyUpgradeCost(definition.key, currentLevel),
      effectUnit: definition.effectUnit,
      currentEffect: getTechnologyEffectValue(definition, currentLevel),
      nextEffect: nextLevel === null ? null : getTechnologyEffectValue(definition, nextLevel),
    };
  });
}

export async function technologyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:playerId/technologies', async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_player_id' });

    const [levels, walletResult] = await Promise.all([
      getPlayerTechnologyLevels(parsed.data.playerId),
      db.query<WalletRow>(
        `SELECT soft_currency::text, premium_currency::text FROM wallets WHERE player_id = $1`,
        [parsed.data.playerId],
      ),
    ]);
    const wallet = walletResult.rows[0];
    if (!wallet) return reply.code(404).send({ error: 'player_not_found' });

    return {
      playerId: parsed.data.playerId,
      wallet: {
        soft: Number(wallet.soft_currency),
        premium: Number(wallet.premium_currency),
      },
      modifiers: getTechnologyModifiers(levels),
      technologies: technologyOptions(levels),
    };
  });

  app.post('/:playerId/technologies', async (request, reply) => {
    const parsedParams = paramsSchema.safeParse(request.params);
    const parsedBody = bodySchema.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: 'invalid_technology_upgrade' });
    }

    const { playerId } = parsedParams.data;
    const techKey = parsedBody.data.techKey as TechnologyKey;
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const walletResult = await client.query<WalletRow>(
        `SELECT soft_currency::text, premium_currency::text FROM wallets WHERE player_id = $1 FOR UPDATE`,
        [playerId],
      );
      const wallet = walletResult.rows[0];
      if (!wallet) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'wallet_not_found' });
      }

      const levelResult = await client.query<LevelRow>(
        `SELECT level FROM player_technologies WHERE player_id = $1 AND tech_key = $2 FOR UPDATE`,
        [playerId, techKey],
      );
      const currentLevel = Number(levelResult.rows[0]?.level ?? 0);
      const cost = getTechnologyUpgradeCost(techKey, currentLevel);
      if (cost === null) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'technology_maxed', techKey, level: currentLevel });
      }

      const balance = Number(wallet.soft_currency);
      if (balance < cost) {
        await client.query('ROLLBACK');
        return reply.code(402).send({ error: 'insufficient_funds', required: cost, balance });
      }

      const nextLevel = currentLevel + 1;
      await client.query(
        `
          INSERT INTO player_technologies (player_id, tech_key, level, updated_at)
          VALUES ($1, $2, $3, now())
          ON CONFLICT (player_id, tech_key)
          DO UPDATE SET level = EXCLUDED.level, updated_at = now()
        `,
        [playerId, techKey, nextLevel],
      );
      await client.query(
        `UPDATE wallets SET soft_currency = soft_currency - $2, updated_at = now() WHERE player_id = $1`,
        [playerId, cost],
      );
      await client.query(
        `
          INSERT INTO wallet_transactions (
            player_id, soft_delta, premium_delta, reason, reference_type, reference_id
          )
          VALUES ($1, $2, 0, 'technology_upgrade', 'technology', $3)
        `,
        [playerId, -cost, techKey],
      );

      await client.query('COMMIT');
      const levels = await getPlayerTechnologyLevels(playerId);
      const definition = TECHNOLOGY_DEFINITIONS.find((item) => item.key === techKey)!;
      return {
        status: 'upgraded',
        playerId,
        techKey,
        level: nextLevel,
        charged: cost,
        wallet: { soft: balance - cost, premium: Number(wallet.premium_currency) },
        effect: {
          label: definition.effect,
          unit: definition.effectUnit,
          value: getTechnologyEffectValue(definition, nextLevel),
        },
        modifiers: getTechnologyModifiers(levels),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'technology_upgrade_failed' });
    } finally {
      client.release();
    }
  });
}
