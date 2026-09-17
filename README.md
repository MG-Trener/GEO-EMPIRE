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
- `database` - SQL migrations and seed data
- `docs` - game design and architecture notes

## Environment

Copy `.env.example` to a local `.env` for development. Never commit real secrets.

Required server variable:

```env
DATABASE_URL=
```
