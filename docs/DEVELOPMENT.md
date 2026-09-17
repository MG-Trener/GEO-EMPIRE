# GEO EMPIRE development

## Environments

Neon branches:

- `production` - production schema and reference dictionaries; no demo world data.
- `development` - isolated copy used for the Astana demo sector and development writes.

Both branches use the `neondb` database.

## Backend

Create a local `.env` from `.env.example` and set `DATABASE_URL` to the **development branch** connection string when developing locally.

```bash
npm install
npm run dev:api
```

API defaults to `http://0.0.0.0:4000`.

Useful endpoints:

- `GET /health`
- `GET /api/v1/world/status`
- `GET /api/v1/world/locate?lat=51.1694&lng=71.4491&resolution=12&ring=2`
- `POST /api/v1/geology/preview`

## Mobile

The mobile app uses Expo SDK 57 and MapLibre React Native v11. MapLibre contains native code and therefore requires a development/native build; it does not run inside Expo Go.

Set a backend address reachable from the emulator or physical phone:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000
```

For a physical phone, replace the address with the LAN address of the computer running the API.

Then:

```bash
npm install
npm --workspace @geo-empire/mobile run prebuild
npm --workspace @geo-empire/mobile run android
```

The first screen requests foreground location permission, displays the real map, draws H3 resolution-12 cells, shows occupied/free territory, and can run the demo geology scan against the development branch.

## Demo data

Development seed:

- player: `11111111-1111-4111-8111-111111111111`
- 19 H3 cells around the Astana development point
- 10 sample deposits at different depths and rarities
- one claimed center cell
- one active mine

Never seed these records into production.
