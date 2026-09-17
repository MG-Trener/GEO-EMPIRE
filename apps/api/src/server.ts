import Fastify from 'fastify';
import { closeDatabase, db } from './db.js';
import { buildingRoutes } from './routes/buildings.js';
import { geologyRoutes } from './routes/geology.js';
import { geologyScanRoutes } from './routes/geology-scan.js';
import { playerRoutes } from './routes/players.js';
import { territoryRoutes } from './routes/territories.js';
import { worldRoutes } from './routes/world.js';

const app = Fastify({ logger: true });

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
await app.register(territoryRoutes, { prefix: '/api/v1/territories' });
await app.register(buildingRoutes, { prefix: '/api/v1/buildings' });
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
