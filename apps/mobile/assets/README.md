# GEO EMPIRE visual assets

This folder is the canonical home for the approved GEO EMPIRE game artwork.

Expected structure:

- `resources/` — transparent PNG resource artwork
  - `iron-ore.png`
  - `copper-ore.png`
  - `gold.png`
  - `silver.png`
  - `coal.png`
  - `crude-oil.png`
  - `natural-gas.png`
  - `limestone.png`
  - `sand.png`
  - `clay.png`
  - `timber.png`
  - `wheat.png`
  - `uranium.png`
  - `lithium.png`
  - `rare-earths.png`
- `buildings/` — transparent PNG buildings and industrial objects
  - `mine.png`
  - `oil-well.png`
  - `gas-well.png`
  - `sawmill.png`
  - `warehouse.png`
  - `power-plant.png`
  - `steel-mill.png`
  - `research-institute.png`
- `packs/` — premium pack/card artwork
  - `field-starter.png`
  - `construction-reserve.png`
  - `industrial-push.png`
- `banners/` — screen hero/banner artwork
  - `geology.png`
  - `development.png`
  - `market.png`
  - `store.png`
- `system/` — application icon and splash artwork

The mobile UI resolves these names through `src/visualAssets.ts`. During development the base URL may be overridden with `EXPO_PUBLIC_ART_BASE_URL`. Missing images use a safe in-app fallback and do not break the APK build.
