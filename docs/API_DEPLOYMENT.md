# GEO EMPIRE API deployment: Render + Neon

The production architecture is:

```text
GitHub
  |
  +-- apps/mobile  -> React Native / Android
  |
  +-- apps/api     -> Render Web Service (Free)
                         |
                         v
                    Neon PostgreSQL (Free)
```

The mobile application never connects to PostgreSQL directly. It calls the public HTTPS backend on Render, and only the backend receives the Neon `DATABASE_URL` secret.

## Repository layout

- `apps/mobile` - React Native / Expo Android client
- `apps/api` - Fastify API
- `database/migrations` - PostgreSQL schema migrations
- `render.yaml` - Render Blueprint for the API

## 1. Prepare Neon

Use the existing GEO EMPIRE Neon PostgreSQL database. Do not create an additional Render database.

Before exposing the API, apply SQL files from `database/migrations` to the target Neon branch in numeric order. Development/demo seed data in `database/seeds` is optional and should not be applied to a production world unless explicitly desired.

The API expects the `postgis` and `h3` extensions plus the current application tables. `GET /ready` reports missing objects.

Copy the Neon PostgreSQL connection string for the target database. Keep it private.

## 2. Create the Render service

The repository contains `render.yaml`. In Render, create a new Blueprint from the `MG-Trener/GEO-EMPIRE` repository and deploy the `geo-empire-api` service.

When Render asks for environment values, set:

```env
DATABASE_URL=postgresql://...
```

`DATABASE_URL` is declared with `sync: false`, so the real value is entered in Render and is never stored in GitHub.

The Blueprint configures:

- runtime: Node.js
- plan: Free
- build: `npm ci --include=dev && npm run build:api`
- start: `npm --workspace @geo-empire/api run start`
- host: `0.0.0.0`
- health check: `/health`
- automatic deploys from `main`

Do not hard-code Render's `PORT`. Render supplies it at runtime and the API already reads `process.env.PORT`.

## 3. Verify backend and database

After deployment, open the generated HTTPS service URL and verify:

```text
GET https://<render-service>.onrender.com/health
GET https://<render-service>.onrender.com/ready
```

Expected results:

- `/health` -> `status: ok`, proving the API can connect to Neon.
- `/ready` -> `status: ready`, proving required tables and extensions are present.

If `/health` works but `/ready` returns HTTP 503, inspect `missingTables` and `missingExtensions` and finish the Neon migrations/extensions before using that database as the game backend.

## 4. Connect Android builds to Render

The mobile client reads its API address from `EXPO_PUBLIC_API_URL` at build time.

After Render gives the service its public HTTPS URL, create this GitHub repository variable:

```text
EXPO_PUBLIC_API_URL=https://<render-service>.onrender.com
```

Do not add a trailing slash.

Both Android workflows use this repository variable. The manual `Android APK` workflow can still temporarily override it with the `api_url` input. A build fails early if no public HTTPS backend URL is configured, preventing an APK from accidentally shipping with a localhost or obsolete Railway address.

## 5. Local development

For local API development:

```env
DATABASE_URL=postgresql://...
HOST=0.0.0.0
PORT=4000
```

Run:

```bash
npm run dev:api
```

For an Android emulator:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000
```

For a physical device on the same LAN, use the development computer's LAN address, for example:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:4000
```

## 6. Render Free limitation

Render Free is suitable for development and early testing. A free web service can spin down after a period without incoming requests, so the first API call after inactivity can be noticeably slower while the service starts again.

For production gameplay with many concurrent users or latency-sensitive actions, move the same service to an always-on Render plan or another always-on host without changing the Neon database or mobile API contract.
