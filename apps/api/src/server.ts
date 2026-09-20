import Fastify from 'fastify';
import { closeDatabase, db } from './db.js';
import { CONSTRUCTION_INTERACTION_DISTANCE_METERS } from './game/economy-config.js';
import { ensureGeologyResearchSchema } from './game/geology-research-service.js';
import { ensureTechnologySchema } from './game/technology-service.js';
import { buildingRoutes } from './routes/buildings.js';
import { developmentAssistRoutes } from './routes/development-assist.js';
import { developmentProjectRoutes } from './routes/development-projects.js';
import { extractionRoutesV2 } from './routes/extraction-v2.js';
import { geologyRoutes } from './routes/geology.js';
import { geologyScanRoutes } from './routes/geology-scan.js';
import { geologyInvestigationRoutes } from './routes/geology-investigations.js';
import { geologyKnownDepositRoutes } from './routes/geology-known-deposits.js';
import { geologyResearchRoutes } from './routes/geology-research.js';
import { marketRoutesV2 } from './routes/market-v2.js';
import { ensureMissionSchema, missionRoutes } from './routes/missions.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { playerRoutes } from './routes/players.js';
import { storeRoutes } from './routes/store.js';
import { technologyRoutes } from './routes/technologies.js';
import { territoryRoutesV2 } from './routes/territories-v2.js';
import { worldRoutes } from './routes/world.js';

const app = Fastify({ logger: true });

await ensureTechnologySchema();
await ensureGeologyResearchSchema();
await ensureMissionSchema();

const requiredTables = [
  'players',
  'wallets',
  'wallet_transactions',
  'player_geology_skills',
  'player_technologies',
  'technology_researches',
  'geology_researches',
  'player_mission_rewards',
  'world_cells',
  'resources',
  'resource_deposits',
  'territory_claims',
  'buildings',
  'player_inventory',
  'inventory_transactions',
  'extraction_operations',
  'geology_investigations',
  'development_projects',
] as const;

const requiredExtensions = ['postgis', 'h3'] as const;

// Project approval is the point where a physical industrial object is created.
// Enforce proximity on the server as well as in the mobile UI so a modified
// client cannot approve remote construction outside the local build radius.
app.addHook('preHandler', async (request, reply) => {
  const approvalRoute = request.method === 'POST'
    && /^\/api\/v1\/development\/projects\/[^/?]+\/approve(?:\?|$)/.test(request.url);
  if (!approvalRoute) return;

  const body = request.body as { playerLat?: unknown; playerLng?: unknown } | null;
  const playerLat = Number(body?.playerLat);
  const playerLng = Number(body?.playerLng);
  if (!Number.isFinite(playerLat) || playerLat < -90 || playerLat > 90
    || !Number.isFinite(playerLng) || playerLng < -180 || playerLng > 180) {
    return reply.code(400).send({
      error: 'location_required_for_construction',
      message: 'Для начала строительства требуется актуальная геопозиция игрока',
      maxDistanceMeters: CONSTRUCTION_INTERACTION_DISTANCE_METERS,
    });
  }

  const projectId = String((request.params as { projectId?: unknown } | null)?.projectId ?? '');
  if (!projectId) return;

  const distanceResult = await db.query<{ distance_m: number }>(
    `
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        ST_SetSRID(
          ST_MakePoint(
            (h3_cell_to_lat_lng(d.cell_h3))[1],
            (h3_cell_to_lat_lng(d.cell_h3))[0]
          ), 4326
        )::geography
      ) AS distance_m
      FROM development_projects dp
      JOIN resource_deposits d ON d.id = dp.deposit_id
      WHERE dp.id = $3
    `,
    [playerLng, playerLat, projectId],
  );

  // Let the route itself return its existing 404/ownership errors when the
  // project does not exist. The hook only owns physical-distance validation.
  const row = distanceResult.rows[0];
  if (!row) return;

  const distanceMeters = Number(row.distance_m ?? Number.POSITIVE_INFINITY);
  if (distanceMeters > CONSTRUCTION_INTERACTION_DISTANCE_METERS) {
    return reply.code(403).send({
      error: 'construction_out_of_range',
      message: `Для строительства нужно находиться не дальше ${CONSTRUCTION_INTERACTION_DISTANCE_METERS} м от участка`,
      distanceMeters: Math.round(distanceMeters * 100) / 100,
      maxDistanceMeters: CONSTRUCTION_INTERACTION_DISTANCE_METERS,
    });
  }
});

app.get('/health', async () => {
  const result = await db.query<{ now: string; database_name: string }>(
    'select now()::text as now, current_database() as database_name',
  );
  return {
    status: 'ok',
    service: 'geo-empire-api',
    database: result.rows[0]?.database_name,
    databaseTime: result.rows[0]?.now,
  };
});

app.get('/ready', async (_request, reply) => {
  const [tableResult, extensionResult] = await Promise.all([
    db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [[...requiredTables]],
    ),
    db.query<{ extname: string }>(
      'SELECT extname FROM pg_extension WHERE extname = ANY($1::text[])',
      [[...requiredExtensions]],
    ),
  ]);

  const presentTables = new Set(tableResult.rows.map((row) => row.table_name));
  const presentExtensions = new Set(extensionResult.rows.map((row) => row.extname));
  const missingTables = requiredTables.filter((name) => !presentTables.has(name));
  const missingExtensions = requiredExtensions.filter((name) => !presentExtensions.has(name));

  if (missingTables.length || missingExtensions.length) {
    return reply.code(503).send({
      status: 'not_ready',
      service: 'geo-empire-api',
      missingTables,
      missingExtensions,
    });
  }

  return {
    status: 'ready',
    service: 'geo-empire-api',
    tables: requiredTables.length,
    extensions: [...requiredExtensions],
  };
});

app.get('/api/v1/world/status', async () => {
  const [cells, resources, deposits, buildings] = await Promise.all([
    db.query<{ count: string }>('select count(*)::text as count from world_cells'),
    db.query<{ count: string }>('select count(*)::text as count from resources'),
    db.query<{ count: string }>('select count(*)::text as count from resource_deposits'),
    db.query<{ count: string }>('select count(*)::text as count from buildings'),
  ]);
  return {
    cells: Number(cells.rows[0]?.count ?? 0),
    resources: Number(resources.rows[0]?.count ?? 0),
    deposits: Number(deposits.rows[0]?.count ?? 0),
    buildings: Number(buildings.rows[0]?.count ?? 0),
  };
});

await app.register(worldRoutes, { prefix: '/api/v1/world' });
await app.register(geologyRoutes, { prefix: '/api/v1/geology' });
await app.register(geologyScanRoutes, { prefix: '/api/v1/geology' });
await app.register(geologyInvestigationRoutes, { prefix: '/api/v1/geology' });
await app.register(geologyKnownDepositRoutes, { prefix: '/api/v1/geology' });
await app.register(geologyResearchRoutes, { prefix: '/api/v1/research' });
await app.register(developmentProjectRoutes, { prefix: '/api/v1/development' });
await app.register(developmentAssistRoutes, { prefix: '/api/v1/development-assist' });
await app.register(territoryRoutesV2, { prefix: '/api/v1/territories' });
await app.register(buildingRoutes, { prefix: '/api/v1/buildings' });
await app.register(extractionRoutesV2, { prefix: '/api/v1/extraction' });
await app.register(marketRoutesV2, { prefix: '/api/v1/market' });
await app.register(storeRoutes, { prefix: '/api/v1/store' });
await app.register(onboardingRoutes, { prefix: '/api/v1/onboarding' });
await app.register(technologyRoutes, { prefix: '/api/v1/players' });
await app.register(missionRoutes, { prefix: '/api/v1/players' });
await app.register(playerRoutes, { prefix: '/api/v1/players' });

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

const shutdown = async () => {
  await app.close();
  await closeDatabase();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port, host });
