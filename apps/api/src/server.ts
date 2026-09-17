import Fastify from 'fastify';
import { closeDatabase, db } from './db.js';
import { buildingRoutes } from './routes/buildings.js';
import { developmentProjectRoutes } from './routes/development-projects.js';
import { extractionRoutes } from './routes/extraction.js';
import { geologyRoutes } from './routes/geology.js';
import { geologyScanRoutes } from './routes/geology-scan.js';
import { geologyInvestigationRoutes } from './routes/geology-investigations.js';
import { geologyKnownDepositRoutes } from './routes/geology-known-deposits.js';
import { marketRoutes } from './routes/market.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { playerRoutes } from './routes/players.js';
import { storeRoutes } from './routes/store.js';
import { territoryRoutes } from './routes/territories.js';
import { worldRoutes } from './routes/world.js';

const app = Fastify({ logger: true });

const requiredTables = [
  'players',
  'wallets',
  'wallet_transactions',
  'player_geology_skills',
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
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])
      `,
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
await app.register(developmentProjectRoutes, { prefix: '/api/v1/development' });
await app.register(territoryRoutes, { prefix: '/api/v1/territories' });
await app.register(buildingRoutes, { prefix: '/api/v1/buildings' });
await app.register(extractionRoutes, { prefix: '/api/v1/extraction' });
await app.register(marketRoutes, { prefix: '/api/v1/market' });
await app.register(storeRoutes, { prefix: '/api/v1/store' });
await app.register(onboardingRoutes, { prefix: '/api/v1/onboarding' });
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
