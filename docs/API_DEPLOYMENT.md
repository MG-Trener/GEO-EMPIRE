# GEO EMPIRE API deployment

The backend is packaged as a standalone Docker image and can be deployed to any container host that can reach the Neon PostgreSQL database.

## Required environment

```env
DATABASE_URL=postgresql://...
PORT=4000
HOST=0.0.0.0
```

`DATABASE_URL` must be stored in the hosting provider's secret/environment settings. Never commit the real Neon connection string.

## Local container test

From the repository root:

```bash
docker build -f apps/api/Dockerfile -t geo-empire-api .
docker run --rm -p 4000:4000 -e DATABASE_URL="$DATABASE_URL" geo-empire-api
```

Then verify:

```text
GET http://localhost:4000/health
```

A healthy server returns `status: ok` together with the connected database name and database time.

## Production host

Create one web/container service with:

- build context: repository root
- Dockerfile: `apps/api/Dockerfile`
- public port: `4000` or the provider-assigned `PORT`
- health check path: `/health`
- secret: `DATABASE_URL`

The service should expose an HTTPS URL such as `https://api.example.com`.

## Connect Android APK

The mobile app reads its backend URL from `EXPO_PUBLIC_API_URL` at build time.

The GitHub Actions workflow `Android APK` can be started manually with the public API URL. Example input:

```text
api_url = https://api.example.com
```

The resulting APK will call that public server instead of the Android-emulator address `http://10.0.2.2:4000`.

## Database preparation

Before exposing the API, apply the SQL files in `database/migrations` to the target Neon branch in numeric order. Development/demo seed data in `database/seeds` is optional and should not be applied to a production world unless explicitly desired.
