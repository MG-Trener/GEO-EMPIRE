import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import {
  GEOLOGY_SKILL_KEYS,
  getGeologyCapabilities,
  getGeologyUpgradePrice,
  type GeologySkillKey,
  type GeologySkills,
} from '../game/geology-config.js';

const paramsSchema = z.object({ playerId: z.string().uuid() });
const upgradeBodySchema = z.object({
  skill: z.enum(GEOLOGY_SKILL_KEYS),
  currency: z.enum(['soft', 'premium']).default('soft'),
});

type SummaryRow = {
  id: string;
  display_name: string;
  company_name: string | null;
  soft_currency: string;
  premium_currency: string;
  range_level: number;
  coverage_level: number;
  depth_level: number;
  accuracy_level: number;
  sensitivity_level: number;
  territories: string;
  buildings: string;
  known_deposits: string;
};

type GeologyWalletRow = {
  range_level: number;
  coverage_level: number;
  depth_level: number;
  accuracy_level: number;
  sensitivity_level: number;
  soft_currency: string;
  premium_currency: string;
};

type WalletRow = {
  soft_currency: string;
  premium_currency: string;
};

const geologySkillConfig: Record<GeologySkillKey, {
  column: 'range_level' | 'coverage_level' | 'depth_level' | 'accuracy_level' | 'sensitivity_level';
  field: keyof GeologySkills;
  capability: 'rangeMeters' | 'coverageRing' | 'maxDepthMeters' | 'accuracyError' | 'maxVisibleRarity';
  unit: string;
}> = {
  range: { column: 'range_level', field: 'rangeLevel', capability: 'rangeMeters', unit: 'm' },
  coverage: { column: 'coverage_level', field: 'coverageLevel', capability: 'coverageRing', unit: 'rings' },
  depth: { column: 'depth_level', field: 'depthLevel', capability: 'maxDepthMeters', unit: 'm' },
  accuracy: { column: 'accuracy_level', field: 'accuracyLevel', capability: 'accuracyError', unit: 'error' },
  sensitivity: { column: 'sensitivity_level', field: 'sensitivityLevel', capability: 'maxVisibleRarity', unit: 'rarity' },
};

function rowToSkills(row: Pick<GeologyWalletRow,
  'range_level' | 'coverage_level' | 'depth_level' | 'accuracy_level' | 'sensitivity_level'
>): GeologySkills {
  return {
    rangeLevel: Number(row.range_level),
    coverageLevel: Number(row.coverage_level),
    depthLevel: Number(row.depth_level),
    accuracyLevel: Number(row.accuracy_level),
    sensitivityLevel: Number(row.sensitivity_level),
  };
}

function geologyUpgradeState(skill: GeologySkillKey, skills: GeologySkills) {
  const config = geologySkillConfig[skill];
  const currentLevel = Number(skills[config.field]);
  const price = getGeologyUpgradePrice(currentLevel);
  const currentCapabilities = getGeologyCapabilities(skills);
  const nextSkills = { ...skills, [config.field]: Math.min(10, currentLevel + 1) } as GeologySkills;
  const nextCapabilities = getGeologyCapabilities(nextSkills);

  return {
    skill,
    currentLevel,
    nextLevel: currentLevel >= 10 ? null : currentLevel + 1,
    maxed: currentLevel >= 10,
    price,
    currentValue: currentCapabilities[config.capability],
    nextValue: currentLevel >= 10 ? null : nextCapabilities[config.capability],
    unit: config.unit,
  };
}

export async function playerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:playerId/summary', async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_player_id' });
    }

    const result = await db.query<SummaryRow>(
      `
        SELECT
          p.id::text,
          p.display_name,
          p.company_name,
          w.soft_currency::text,
          w.premium_currency::text,
          g.range_level,
          g.coverage_level,
          g.depth_level,
          g.accuracy_level,
          g.sensitivity_level,
          (SELECT count(*)::text FROM territory_claims t WHERE t.player_id = p.id AND t.lease_until > now()) AS territories,
          (SELECT count(*)::text FROM buildings b WHERE b.owner_player_id = p.id) AS buildings,
          (SELECT count(*)::text FROM player_deposit_knowledge k WHERE k.player_id = p.id) AS known_deposits
        FROM players p
        JOIN wallets w ON w.player_id = p.id
        JOIN player_geology_skills g ON g.player_id = p.id
        WHERE p.id = $1
      `,
      [parsed.data.playerId],
    );

    const row = result.rows[0];
    if (!row) {
      return reply.code(404).send({ error: 'player_not_found' });
    }

    return {
      id: row.id,
      displayName: row.display_name,
      companyName: row.company_name,
      wallet: {
        soft: Number(row.soft_currency),
        premium: Number(row.premium_currency),
      },
      geology: {
        range: Number(row.range_level),
        coverage: Number(row.coverage_level),
        depth: Number(row.depth_level),
        accuracy: Number(row.accuracy_level),
        sensitivity: Number(row.sensitivity_level),
      },
      stats: {
        territories: Number(row.territories),
        buildings: Number(row.buildings),
        knownDeposits: Number(row.known_deposits),
      },
    };
  });

  app.get('/:playerId/geology-upgrades', async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_player_id' });
    }

    const result = await db.query<GeologyWalletRow>(
      `
        SELECT
          g.range_level,
          g.coverage_level,
          g.depth_level,
          g.accuracy_level,
          g.sensitivity_level,
          w.soft_currency::text,
          w.premium_currency::text
        FROM player_geology_skills g
        JOIN wallets w ON w.player_id = g.player_id
        WHERE g.player_id = $1
      `,
      [parsed.data.playerId],
    );

    const row = result.rows[0];
    if (!row) {
      return reply.code(404).send({ error: 'player_not_found' });
    }

    const skills = rowToSkills(row);
    return {
      playerId: parsed.data.playerId,
      wallet: {
        soft: Number(row.soft_currency),
        premium: Number(row.premium_currency),
      },
      capabilities: getGeologyCapabilities(skills),
      upgrades: GEOLOGY_SKILL_KEYS.map((skill) => geologyUpgradeState(skill, skills)),
    };
  });

  app.post('/:playerId/geology-upgrades', async (request, reply) => {
    const parsedParams = paramsSchema.safeParse(request.params);
    const parsedBody = upgradeBodySchema.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: 'invalid_geology_upgrade_request' });
    }

    const { playerId } = parsedParams.data;
    const { skill, currency } = parsedBody.data;
    const config = geologySkillConfig[skill];
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const currentResult = await client.query<GeologyWalletRow>(
        `
          SELECT
            g.range_level,
            g.coverage_level,
            g.depth_level,
            g.accuracy_level,
            g.sensitivity_level,
            w.soft_currency::text,
            w.premium_currency::text
          FROM player_geology_skills g
          JOIN wallets w ON w.player_id = g.player_id
          WHERE g.player_id = $1
          FOR UPDATE OF g, w
        `,
        [playerId],
      );

      const current = currentResult.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'player_not_found' });
      }

      const skills = rowToSkills(current);
      const currentLevel = Number(skills[config.field]);
      const price = getGeologyUpgradePrice(currentLevel);
      if (!price) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'geology_skill_maxed', skill, level: currentLevel });
      }

      const cost = price[currency];
      const currentBalance = currency === 'soft'
        ? Number(current.soft_currency)
        : Number(current.premium_currency);

      if (currentBalance < cost) {
        await client.query('ROLLBACK');
        return reply.code(402).send({
          error: 'insufficient_funds',
          currency,
          required: cost,
          balance: currentBalance,
        });
      }

      const upgraded = await client.query<GeologyWalletRow>(
        `
          UPDATE player_geology_skills
          SET ${config.column} = ${config.column} + 1, updated_at = now()
          WHERE player_id = $1 AND ${config.column} < 10
          RETURNING
            range_level,
            coverage_level,
            depth_level,
            accuracy_level,
            sensitivity_level,
            '0'::text AS soft_currency,
            '0'::text AS premium_currency
        `,
        [playerId],
      );

      const upgradedRow = upgraded.rows[0];
      if (!upgradedRow) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'geology_skill_maxed', skill, level: currentLevel });
      }

      const walletResult = currency === 'soft'
        ? await client.query<WalletRow>(
          `
            UPDATE wallets
            SET soft_currency = soft_currency - $2, updated_at = now()
            WHERE player_id = $1
            RETURNING soft_currency::text, premium_currency::text
          `,
          [playerId, cost],
        )
        : await client.query<WalletRow>(
          `
            UPDATE wallets
            SET premium_currency = premium_currency - $2, updated_at = now()
            WHERE player_id = $1
            RETURNING soft_currency::text, premium_currency::text
          `,
          [playerId, cost],
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
          VALUES ($1, $2, $3, 'geology_upgrade', 'geology_skill', $4)
        `,
        [
          playerId,
          currency === 'soft' ? -cost : 0,
          currency === 'premium' ? -cost : 0,
          `${skill}:${currentLevel + 1}`,
        ],
      );

      await client.query('COMMIT');

      const updatedSkills = rowToSkills(upgradedRow);
      const wallet = walletResult.rows[0];
      return {
        status: 'upgraded',
        playerId,
        skill,
        level: currentLevel + 1,
        currency,
        charged: cost,
        wallet: {
          soft: Number(wallet?.soft_currency ?? 0),
          premium: Number(wallet?.premium_currency ?? 0),
        },
        capabilities: getGeologyCapabilities(updatedSkills),
        nextUpgrade: geologyUpgradeState(skill, updatedSkills),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'geology_upgrade_failed' });
    } finally {
      client.release();
    }
  });
}
