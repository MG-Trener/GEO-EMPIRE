# GEO EMPIRE image assets

Runtime artwork for the mobile application is grouped by purpose.

- `resources/` - collectible and geological resources. Target: transparent PNG, normally 512x512.
- `equipment/` - mining machinery and large movable industrial objects. Target: transparent PNG, normally up to 768x768.
- `buildings/` - stationary industrial facilities. Target: transparent PNG, normally up to 768x768.
- `splash/` - portrait launch, promo and onboarding artwork. Target: approximately 900x1600, optimized JPEG unless transparency is required.
- `references/` - design boards and visual references. These are not intended to be bundled as runtime game assets.
- `sheet_ru_1/` - first Russian UI sheet split into individual runtime controls, resource icons and map-mode artwork.
- `sheet_ru_2/` - second Russian UI sheet split into individual navigation, action, status and utility controls.
- `ui/` - reusable interface artwork.
- `icons/` - small interface/game icons.
- `map/` - map-specific visual assets.
- `backgrounds/` - reusable scene/background images.

## Runtime registry

Use `apps/mobile/src/gameAssets.ts` instead of referencing numbered sheet files directly. It exposes semantic names such as `gameAssets.nav.map`, `gameAssets.nav.trade`, `gameAssets.utility.layers`, `gameAssets.actions.research`, and `resourceIconForCode()`.

The current mobile HUD, onboarding, geology, known deposits, development projects, commodity market, store and first mission guide are already wired to these assets.

## Current assets

### Resources
- `resources/copper-ore.png`
- `resources/iron-ore.png`
- `resources/gold-ore.png`
- `resources/coal.png`
- `resources/oil.png`
- `resources/natural-gas.png`

### Industry
- `equipment/open-pit-mining-truck.png`
- `buildings/oil-pumpjack.png`

### Portrait artwork
- `splash/geo-empire-start.jpg`
- `splash/geo-empire-promo.jpg`

### Design references
- `references/ui-system-board.jpg`
- `references/gameplay-ui-board.jpg`

Prefer descriptive lowercase kebab-case filenames for new standalone artwork. Do not add new UUID-named artwork directly to runtime code; rename and optimize it first.
