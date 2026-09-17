# GEO EMPIRE

GEO EMPIRE is a location-based economic strategy game built around a shared persistent world on top of a real map.

## Initial architecture

- Mobile client: React Native + Expo
- Backend API: Node.js + TypeScript + Fastify
- Database: Neon PostgreSQL 18
- Geospatial layer: PostGIS + H3
- Repository: monorepo managed with npm workspaces

## Project structure

- `apps/mobile` - Android/iOS client
- `apps/api` - backend API
- `packages/shared` - shared types and domain constants
- `database/migrations` - production SQL migrations
- `database/seeds` - development/demo seed data
- `docs` - game design and architecture notes

## Neon environments

- `production` - main persistent world schema and production data
- `development` - child branch used for demo data, experiments and API testing

The current database is `neondb`. PostGIS and H3 are enabled.

## Environment

Copy `.env.example` to a local `.env` for development. Never commit real secrets.

Required server variable:

```env
DATABASE_URL=
```

## API

### Health

`GET /health`

Checks the API and database connection.

### World status

`GET /api/v1/world/status`

Returns counts of world cells, resources, deposits and buildings.

### Locate a player on the H3 world grid

`GET /api/v1/world/locate?lat=51.1694&lng=71.4491&resolution=12&ring=1`

Returns the current H3 cell and surrounding cells, including active claims and buildings.

### Geology scan preview

`POST /api/v1/geology/preview`

Example body:

```json
{
  "playerId": "11111111-1111-4111-8111-111111111111",
  "playerLat": 51.1694,
  "playerLng": 71.4491
}
```

The API applies the player's independent geology levels for range, coverage, depth, accuracy and sensitivity before returning deposits.

## Development demo world

`database/seeds/001_astana_demo.sql` creates a development-only sector around central Astana:

- 19 H3 resolution-12 cells
- 10 sample deposits at different depths and rarities
- one claimed cell with a mine
- one demo player with geology level 5 in all five branches

Demo player ID:

`11111111-1111-4111-8111-111111111111`

The demo intentionally contains deposits that level 5 cannot detect yet, so deeper and rarer resources become visible only after future skill upgrades.
