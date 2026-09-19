import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import {
  GEOLOGY_SKILL_KEYS,
  getGeologyUpgradePrice,
  type GeologySkillKey,
} from '../game/geology-config.js';
import {
  finalizeMatureGeologyResearch,
  geologyResearchDurationSeconds,
  getActiveGeologyResearch,
} from '../game/geology-research-service.js';
import {
  finalizeMatureTechnologyResearch,
  getActiveTechnologyResearch,
} from '../game/technology-service.js';

const paramsSchema = z.object({ playerId: z.string().uuid() });
const startSchema = z.object({
  skill: z.enum(GEOLOGY_SKILL_KEYS),
  currency: z.enum(['soft', 'premium']).default('soft'),
});

const skillColumn: Record<GeologySkillKey, string> = {
  range: 'range_level',
  coverage: 'coverage_level',
  depth: 'depth_level',
  accuracy: 'accuracy_level',
  sensitivity: 'sensitivity_level',
};

type WalletRow = { soft_currency: string; premium_currency: string };

export async function geologyResearchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:playerId/status', async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_player_id' });
    const playerId = parsed.data.playerId;

    await Promise.all([
      finalizeMatureGeologyResearch(playerId),
      finalizeMatureTechnologyResearch(playerId),
    ]);

    const [geology, technology] = await Promise.all([
      getActiveGeologyResearch(playerId),
      getActiveTechnologyResearch(playerId),
    ]);

    const activeResearch = geology
      ? {
          kind: 'geology' as const,
          key: geology.skill,
          targetLevel: geology.targetLevel,
          cost: geology.cost,
          currency: geology.currency,
          startedAt: geology.startedAt,
          completesAt: geology.completesAt,
        }
      : technology
        ? {
            kind: 'industrial' as const,
            key: technology.techKey,
            targetLevel: technology.targetLevel,
            cost: technology.softCost,
            currency: 'soft' as const,
            startedAt: technology.startedAt,
            completesAt: technology.completesAt,
          }
        : null;

    return { playerId, activeResearch };
  });

  app.post('/:playerId/geology', async (request, reply) => {
    const parsedParams = paramsSchema.safeParse(request.params);
    const parsedBody = startSchema.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: 'invalid_geology_research' });
    }

    const { playerId } = parsedParams.data;
    const { skill, currency } = parsedBody.data;
    await Promise.all([
      finalizeMatureGeologyResearch(playerId),
      finalizeMatureTechnologyResearch(playerId),
    ]);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const activeGeo = await client.query<{ completes_at: string }>(
        `SELECT completes_at::text FROM geology_researches
         WHERE player_id = $1 AND status = 'running' LIMIT 1 FOR UPDATE`,
        [playerId],
      );
      const activeTech = await client.query<{ completes_at: string }>(
        `SELECT completes_at::text FROM technology_researches
         WHERE player_id = $1 AND status = 'running' LIMIT 1 FOR UPDATE`,
        [playerId],
      );
      const active = activeGeo.rows[0] ?? activeTech.rows[0];
      if (active) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'research_center_busy', completesAt: active.completes_at });
      }

      const column = skillColumn[skill];
      const stateResult = await client.query<WalletRow & { level: number }>(
        `SELECT g.${column} AS level, w.soft_currency::text, w.premium_currency::text
         FROM player_geology_skills g
         JOIN wallets w ON w.player_id = g.player_id
         WHERE g.player_id = $1
         FOR UPDATE OF g, w`,
        [playerId],
      );
      const state = stateResult.rows[0];
      if (!state) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'player_not_found' });
      }

      const currentLevel = Number(state.level);
      const price = getGeologyUpgradePrice(currentLevel);
      if (!price) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'geology_skill_maxed', skill, level: currentLevel });
      }

      const cost = price[currency];
      const balance = currency === 'soft' ? Number(state.soft_currency) : Number(state.premium_currency);
      if (balance < cost) {
        await client.query('ROLLBACK');
        return reply.code(402).send({ error: 'insufficient_funds', currency, required: cost, balance });
      }

      const targetLevel = currentLevel + 1;
      const durationSeconds = geologyResearchDurationSeconds(skill, currentLevel);
      const researchResult = await client.query<{
        id: string;
        started_at: string;
        completes_at: string;
      }>(
        `INSERT INTO geology_researches (
           player_id, skill, target_level, currency, cost, status, started_at, completes_at
         )
         VALUES ($1, $2, $3, $4, $5, 'running', now(), now() + ($6 * interval '1 second'))
         RETURNING id::text, started_at::text, completes_at::text`,
        [playerId, skill, targetLevel, currency, cost, durationSeconds],
      );

      if (currency === 'soft') {
        await client.query(
          `UPDATE wallets SET soft_currency = soft_currency - $2, updated_at = now() WHERE player_id = $1`,
          [playerId, cost],
        );
      } else {
        await client.query(
          `UPDATE wallets SET premium_currency = premium_currency - $2, updated_at = now() WHERE player_id = $1`,
          [playerId, cost],
        );
      }

      await client.query(
        `INSERT INTO wallet_transactions (
           player_id, soft_delta, premium_delta, reason, reference_type, reference_id
         ) VALUES ($1, $2, $3, 'geology_research', 'geology_skill', $4)`,
        [
          playerId,
          currency === 'soft' ? -cost : 0,
          currency === 'premium' ? -cost : 0,
          `${skill}:${targetLevel}`,
        ],
      );

      await client.query('COMMIT');
      const research = researchResult.rows[0];
      return {
        status: 'researching',
        playerId,
        skill,
        targetLevel,
        charged: cost,
        currency,
        wallet: {
          soft: Number(state.soft_currency) - (currency === 'soft' ? cost : 0),
          premium: Number(state.premium_currency) - (currency === 'premium' ? cost : 0),
        },
        research: {
          id: research.id,
          startedAt: research.started_at,
          completesAt: research.completes_at,
          durationSeconds,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'geology_research_start_failed' });
    } finally {
      client.release();
    }
  });
}
