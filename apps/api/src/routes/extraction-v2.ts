import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { getPlayerTechnologyModifiers } from '../game/technology-service.js';
import type { TechnologyModifiers } from '../game/technology-config.js';

const startSchema = z.object({
  playerId: z.string().uuid(),
  buildingId: z.string().uuid(),
  depositId: z.coerce.number().int().positive(),
});
const collectSchema = z.object({ playerId: z.string().uuid(), buildingId: z.string().uuid() });
const statusQuerySchema = z.object({ playerId: z.string().uuid() });

type BuildingRow = {
  id: string;
  owner_player_id: string;
  level: number;
  status: string;
  completed_at: string | null;
  building_code: string;
  h3_index: string;
};

type DepositRow = {
  id: string;
  cell_h3: string;
  resource_id: number;
  resource_code: string;
  resource_name: string;
  unit: string;
  quantity_remaining: string;
  density: string;
  quality: string;
};

type OperationRow = {
  building_id: string;
  deposit_id: string;
  rate_per_hour: string;
  max_buffer_hours: number;
  status: string;
  started_at: string;
  last_collected_at: string;
  quantity_remaining: string;
  resource_id: number;
  resource_code: string;
  resource_name: string;
  unit: string;
  owner_player_id: string;
  building_code: string;
  development_project_id: string | null;
  opex_per_unit: string | null;
};

type DevelopmentProjectRow = {
  id: string;
  status: string;
  planned_daily_output: string;
  opex_per_unit: string;
};

type InventoryRow = {
  resource_id: number;
  resource_code: string;
  resource_name: string;
  unit: string;
  quantity: string;
  updated_at: string;
};

type ProductionRow = {
  resource_id: number;
  building_code: string;
  rate_per_hour: string;
};

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function allowedResource(buildingCode: string, resourceCode: string): boolean {
  if (buildingCode === 'OIL_WELL') return resourceCode === 'CRUDE_OIL';
  if (buildingCode === 'GAS_WELL') return resourceCode === 'NATURAL_GAS';
  if (buildingCode === 'MINE') return !['CRUDE_OIL', 'NATURAL_GAS', 'TIMBER', 'WHEAT'].includes(resourceCode);
  return false;
}

function calculateLegacyRate(buildingCode: string, level: number, density: number, quality: number): number {
  const baseRate = buildingCode === 'OIL_WELL' ? 80 : buildingCode === 'GAS_WELL' ? 2_000 : 20;
  const levelMultiplier = 1 + Math.max(0, level - 1) * 0.25;
  return round4(Math.max(0.01, baseRate * density * (quality / 100) * levelMultiplier));
}

function technologyRateMultiplier(buildingCode: string, modifiers: TechnologyModifiers): number {
  const specialized = buildingCode === 'MINE'
    ? modifiers.mineProductionMultiplier
    : ['OIL_WELL', 'GAS_WELL'].includes(buildingCode)
      ? modifiers.wellProductionMultiplier
      : 1;
  return modifiers.productionMultiplier * specialized;
}

function effectiveRate(operation: Pick<OperationRow, 'rate_per_hour' | 'building_code'>, modifiers: TechnologyModifiers): number {
  return round4(Number(operation.rate_per_hour) * technologyRateMultiplier(operation.building_code, modifiers));
}

function effectiveBufferHours(operation: Pick<OperationRow, 'max_buffer_hours'>, modifiers: TechnologyModifiers): number {
  return Number(operation.max_buffer_hours) + modifiers.bufferHoursBonus;
}

function accruedAmount(operation: OperationRow, modifiers: TechnologyModifiers, now = new Date()): number {
  if (operation.status !== 'running') return 0;
  const elapsedMs = Math.max(0, now.getTime() - new Date(operation.last_collected_at).getTime());
  const elapsedHours = Math.min(elapsedMs / 3_600_000, effectiveBufferHours(operation, modifiers));
  return round4(Math.min(Number(operation.quantity_remaining), effectiveRate(operation, modifiers) * elapsedHours));
}

function effectiveOpexPerUnit(operation: Pick<OperationRow, 'opex_per_unit'>, modifiers: TechnologyModifiers): number {
  return round4(Number(operation.opex_per_unit ?? 0) * modifiers.extractionOpexMultiplier);
}

function operatingCost(amount: number, opexPerUnit: number): number {
  if (amount <= 0 || opexPerUnit <= 0) return 0;
  return Math.max(1, Math.ceil(amount * opexPerUnit));
}

export async function extractionRoutesV2(app: FastifyInstance): Promise<void> {
  app.post('/start', async (request, reply) => {
    const parsed = startSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_extraction_request', details: parsed.error.flatten() });

    const { playerId, buildingId, depositId } = parsed.data;
    const modifiers = await getPlayerTechnologyModifiers(playerId);
    const client = await db.connect();

    try {
      await client.query('BEGIN');
      const buildingResult = await client.query<BuildingRow>(
        `
          SELECT b.id::text, b.owner_player_id::text, b.level, b.status, b.completed_at::text,
                 bt.code AS building_code, bc.cell_h3::text AS h3_index
          FROM buildings b
          JOIN building_types bt ON bt.id = b.building_type_id
          JOIN building_cells bc ON bc.building_id = b.id
          WHERE b.id = $1
          FOR UPDATE OF b
        `,
        [buildingId],
      );
      const building = buildingResult.rows[0];
      if (!building) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'building_not_found' }); }
      if (building.owner_player_id !== playerId) { await client.query('ROLLBACK'); return reply.code(403).send({ error: 'building_not_owned' }); }
      if (!['MINE', 'OIL_WELL', 'GAS_WELL'].includes(building.building_code)) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'building_cannot_extract_resources' });
      }
      if (!building.completed_at || new Date(building.completed_at).getTime() > Date.now()) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'building_under_construction', completesAt: building.completed_at });
      }
      if (building.status === 'constructing') await client.query(`UPDATE buildings SET status = 'active' WHERE id = $1`, [buildingId]);

      const existing = await client.query<{ building_id: string }>(`SELECT building_id::text FROM extraction_operations WHERE building_id = $1`, [buildingId]);
      if (existing.rows[0]) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'extraction_already_configured' }); }

      const depositResult = await client.query<DepositRow>(
        `
          SELECT d.id::text, d.cell_h3::text, d.resource_id, r.code AS resource_code,
                 r.name_ru AS resource_name, r.unit, d.quantity_remaining::text,
                 d.density::text, d.quality::text
          FROM resource_deposits d
          JOIN resources r ON r.id = d.resource_id
          WHERE d.id = $1
          FOR UPDATE OF d
        `,
        [depositId],
      );
      const deposit = depositResult.rows[0];
      if (!deposit) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'deposit_not_found' }); }
      if (deposit.cell_h3 !== building.h3_index) { await client.query('ROLLBACK'); return reply.code(400).send({ error: 'deposit_not_in_building_cell' }); }
      if (Number(deposit.quantity_remaining) <= 0) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'deposit_depleted' }); }
      if (!allowedResource(building.building_code, deposit.resource_code)) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'resource_not_supported_by_building', buildingCode: building.building_code, resourceCode: deposit.resource_code });
      }

      const knowledge = await client.query<{ deposit_id: string }>(
        `SELECT deposit_id::text FROM player_deposit_knowledge WHERE player_id = $1 AND deposit_id = $2`,
        [playerId, depositId],
      );
      if (!knowledge.rows[0]) { await client.query('ROLLBACK'); return reply.code(403).send({ error: 'deposit_not_discovered' }); }

      const projectResult = await client.query<DevelopmentProjectRow>(
        `SELECT id::text, status, planned_daily_output::text, opex_per_unit::text
         FROM development_projects WHERE player_id = $1 AND deposit_id = $2 AND building_id = $3 FOR UPDATE`,
        [playerId, depositId, buildingId],
      );
      const project = projectResult.rows[0] ?? null;
      if (project && !['constructing', 'operating'].includes(project.status)) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'development_project_not_ready_for_operation', status: project.status });
      }

      const baseRatePerHour = project
        ? round4(Math.max(0.01, Number(project.planned_daily_output) / 24))
        : calculateLegacyRate(building.building_code, Number(building.level), Number(deposit.density), Number(deposit.quality));

      await client.query(
        `INSERT INTO extraction_operations (building_id, deposit_id, rate_per_hour, max_buffer_hours) VALUES ($1, $2, $3, 48)`,
        [buildingId, depositId, baseRatePerHour],
      );
      if (project) await client.query(`UPDATE development_projects SET status = 'operating', updated_at = now() WHERE id = $1`, [project.id]);

      await client.query('COMMIT');
      const ratePerHour = round4(baseRatePerHour * technologyRateMultiplier(building.building_code, modifiers));
      return {
        status: 'running',
        buildingId,
        deposit: {
          id: deposit.id,
          resource: { code: deposit.resource_code, name: deposit.resource_name, unit: deposit.unit },
          quantityRemaining: Number(deposit.quantity_remaining),
        },
        ratePerHour,
        plannedDailyOutput: round4(ratePerHour * 24),
        maxBufferHours: 48 + modifiers.bufferHoursBonus,
        technologyModifiers: modifiers,
        economics: project
          ? { source: 'development_project', projectId: project.id, opexPerUnit: round4(Number(project.opex_per_unit) * modifiers.extractionOpexMultiplier) }
          : { source: 'legacy', projectId: null, opexPerUnit: 0 },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'extraction_start_failed' });
    } finally {
      client.release();
    }
  });

  app.get('/:buildingId', async (request, reply) => {
    const params = z.object({ buildingId: z.string().uuid() }).safeParse(request.params);
    const query = statusQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_extraction_status_request' });

    const result = await db.query<OperationRow>(
      `
        SELECT o.building_id::text, o.deposit_id::text, o.rate_per_hour::text, o.max_buffer_hours,
               o.status, o.started_at::text, o.last_collected_at::text, d.quantity_remaining::text,
               d.resource_id, r.code AS resource_code, r.name_ru AS resource_name, r.unit,
               b.owner_player_id::text, bt.code AS building_code,
               dp.id::text AS development_project_id, dp.opex_per_unit::text
        FROM extraction_operations o
        JOIN buildings b ON b.id = o.building_id
        JOIN building_types bt ON bt.id = b.building_type_id
        JOIN resource_deposits d ON d.id = o.deposit_id
        JOIN resources r ON r.id = d.resource_id
        LEFT JOIN development_projects dp ON dp.building_id = o.building_id
        WHERE o.building_id = $1
      `,
      [params.data.buildingId],
    );
    const operation = result.rows[0];
    if (!operation) return reply.code(404).send({ error: 'extraction_not_found' });
    if (operation.owner_player_id !== query.data.playerId) return reply.code(403).send({ error: 'building_not_owned' });

    const modifiers = await getPlayerTechnologyModifiers(query.data.playerId);
    const ratePerHour = effectiveRate(operation, modifiers);
    const available = accruedAmount(operation, modifiers);
    const opexPerUnit = effectiveOpexPerUnit(operation, modifiers);
    return {
      buildingId: operation.building_id,
      status: operation.status,
      ratePerHour,
      plannedDailyOutput: round4(ratePerHour * 24),
      maxBufferHours: effectiveBufferHours(operation, modifiers),
      availableToCollect: available,
      lastCollectedAt: operation.last_collected_at,
      technologyModifiers: modifiers,
      economics: {
        source: operation.development_project_id ? 'development_project' : 'legacy',
        projectId: operation.development_project_id ?? null,
        opexPerUnit,
        operatingCostDue: operatingCost(available, opexPerUnit),
      },
      deposit: {
        id: operation.deposit_id,
        resource: { code: operation.resource_code, name: operation.resource_name, unit: operation.unit },
        quantityRemaining: Number(operation.quantity_remaining),
      },
    };
  });

  app.post('/collect', async (request, reply) => {
    const parsed = collectSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_collection_request', details: parsed.error.flatten() });
    const { playerId, buildingId } = parsed.data;
    const modifiers = await getPlayerTechnologyModifiers(playerId);
    const client = await db.connect();

    try {
      await client.query('BEGIN');
      const operationResult = await client.query<OperationRow>(
        `
          SELECT o.building_id::text, o.deposit_id::text, o.rate_per_hour::text, o.max_buffer_hours,
                 o.status, o.started_at::text, o.last_collected_at::text, b.owner_player_id::text,
                 bt.code AS building_code, d.quantity_remaining::text, d.resource_id,
                 r.code AS resource_code, r.name_ru AS resource_name, r.unit,
                 dp.id::text AS development_project_id, dp.opex_per_unit::text
          FROM extraction_operations o
          JOIN buildings b ON b.id = o.building_id
          JOIN building_types bt ON bt.id = b.building_type_id
          JOIN resource_deposits d ON d.id = o.deposit_id
          JOIN resources r ON r.id = d.resource_id
          LEFT JOIN development_projects dp ON dp.building_id = o.building_id
          WHERE o.building_id = $1
          FOR UPDATE OF o, d
        `,
        [buildingId],
      );
      const operation = operationResult.rows[0];
      if (!operation) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'extraction_not_found' }); }
      if (operation.owner_player_id !== playerId) { await client.query('ROLLBACK'); return reply.code(403).send({ error: 'building_not_owned' }); }

      const amount = accruedAmount(operation, modifiers);
      if (amount <= 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: operation.status === 'depleted' ? 'deposit_depleted' : 'nothing_to_collect' });
      }

      const opexPerUnit = effectiveOpexPerUnit(operation, modifiers);
      const cost = operatingCost(amount, opexPerUnit);
      let walletAfter: number | null = null;
      if (cost > 0) {
        const walletResult = await client.query<{ soft_currency: string }>(`SELECT soft_currency::text FROM wallets WHERE player_id = $1 FOR UPDATE`, [playerId]);
        const wallet = walletResult.rows[0];
        if (!wallet) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'wallet_not_found' }); }
        const balance = Number(wallet.soft_currency);
        if (balance < cost) {
          await client.query('ROLLBACK');
          return reply.code(402).send({ error: 'insufficient_operating_funds', required: cost, balance, availableToCollect: amount, opexPerUnit });
        }
        walletAfter = balance - cost;
      }

      const remainingAfter = round4(Math.max(0, Number(operation.quantity_remaining) - amount));
      const nextStatus = remainingAfter <= 0 ? 'depleted' : operation.status;
      await client.query(`UPDATE resource_deposits SET quantity_remaining = $2 WHERE id = $1`, [operation.deposit_id, remainingAfter]);
      await client.query(
        `INSERT INTO player_inventory (player_id, resource_id, quantity, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (player_id, resource_id)
         DO UPDATE SET quantity = player_inventory.quantity + EXCLUDED.quantity, updated_at = now()`,
        [playerId, operation.resource_id, amount],
      );
      await client.query(
        `INSERT INTO inventory_transactions (player_id, resource_id, quantity_delta, reason, reference_type, reference_id)
         VALUES ($1, $2, $3, 'resource_extraction', 'building', $4)`,
        [playerId, operation.resource_id, amount, buildingId],
      );
      if (cost > 0) {
        await client.query(`UPDATE wallets SET soft_currency = soft_currency - $2, updated_at = now() WHERE player_id = $1`, [playerId, cost]);
        await client.query(
          `INSERT INTO wallet_transactions (player_id, soft_delta, premium_delta, reason, reference_type, reference_id)
           VALUES ($1, $2, 0, 'extraction_opex', 'building', $3)`,
          [playerId, -cost, buildingId],
        );
      }
      await client.query(
        `UPDATE extraction_operations SET last_collected_at = now(), status = $2, updated_at = now() WHERE building_id = $1`,
        [buildingId, nextStatus],
      );
      const inventoryResult = await client.query<{ quantity: string }>(
        `SELECT quantity::text FROM player_inventory WHERE player_id = $1 AND resource_id = $2`,
        [playerId, operation.resource_id],
      );

      await client.query('COMMIT');
      return {
        status: nextStatus,
        buildingId,
        collected: amount,
        resource: { code: operation.resource_code, name: operation.resource_name, unit: operation.unit },
        inventoryQuantity: Number(inventoryResult.rows[0]?.quantity ?? 0),
        depositQuantityRemaining: remainingAfter,
        technologyModifiers: modifiers,
        economics: { projectId: operation.development_project_id ?? null, opexPerUnit, operatingCost: cost, walletSoft: walletAfter },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error(error);
      return reply.code(500).send({ error: 'collection_failed' });
    } finally {
      client.release();
    }
  });

  app.get('/inventory/:playerId', async (request, reply) => {
    const params = z.object({ playerId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_player_id' });
    const playerId = params.data.playerId;
    const modifiers = await getPlayerTechnologyModifiers(playerId);

    const [inventoryResult, productionResult] = await Promise.all([
      db.query<InventoryRow>(
        `
          SELECT r.id AS resource_id, r.code AS resource_code, r.name_ru AS resource_name, r.unit,
                 coalesce(i.quantity, 0)::text AS quantity, coalesce(i.updated_at, now())::text AS updated_at
          FROM resources r
          LEFT JOIN player_inventory i ON i.resource_id = r.id AND i.player_id = $1
          WHERE coalesce(i.quantity, 0) > 0
        `,
        [playerId],
      ),
      db.query<ProductionRow>(
        `
          SELECT d.resource_id, bt.code AS building_code, sum(o.rate_per_hour)::text AS rate_per_hour
          FROM extraction_operations o
          JOIN buildings b ON b.id = o.building_id
          JOIN building_types bt ON bt.id = b.building_type_id
          JOIN resource_deposits d ON d.id = o.deposit_id
          WHERE b.owner_player_id = $1 AND o.status = 'running'
          GROUP BY d.resource_id, bt.code
        `,
        [playerId],
      ),
    ]);

    const inventoryById = new Map(inventoryResult.rows.map((row) => [Number(row.resource_id), row]));
    const productionById = new Map<number, number>();
    for (const row of productionResult.rows) {
      const resourceId = Number(row.resource_id);
      const effective = Number(row.rate_per_hour) * technologyRateMultiplier(row.building_code, modifiers);
      productionById.set(resourceId, (productionById.get(resourceId) ?? 0) + effective);
    }
    const resourceIds = new Set([...inventoryById.keys(), ...productionById.keys()]);
    if (!resourceIds.size) return [];

    const metadata = await db.query<{ id: number; code: string; name_ru: string; unit: string }>(
      `SELECT id, code, name_ru, unit FROM resources WHERE id = ANY($1::int[])`,
      [[...resourceIds]],
    );
    return metadata.rows.map((resource) => {
      const inventory = inventoryById.get(Number(resource.id));
      return {
        resourceId: Number(resource.id),
        code: resource.code,
        name: resource.name_ru,
        unit: resource.unit,
        quantity: Number(inventory?.quantity ?? 0),
        ratePerHour: round4(productionById.get(Number(resource.id)) ?? 0),
        updatedAt: inventory?.updated_at ?? new Date().toISOString(),
      };
    }).sort((a, b) => b.ratePerHour - a.ratePerHour || a.name.localeCompare(b.name, 'ru'));
  });
}
