# GEO EMPIRE image assets

Runtime artwork for the mobile application is grouped by purpose.

- `resources/` - collectible and geological resources. Target: transparent PNG, normally 512x512.
- `equipment/` - mining machinery and large movable industrial objects. Target: transparent PNG, normally up to 768x768.
- `buildings/` - stationary industrial facilities. Target: transparent PNG, normally up to 768x768.
- `splash/` - portrait launch, promo and onboarding artwork. Target: approximately 900x1600, optimized JPEG unless transparency is required.
- `references/` - design boards and visual references. These are not intended to be bundled as runtime game assets.
- `ui/` - reusable interface artwork.
- `icons/` - small interface/game icons.
- `map/` - map-specific visual assets.
- `backgrounds/` - reusable scene/background images.

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

Prefer descriptive lowercase kebab-case filenames. Do not add new UUID-named artwork directly to runtime code; rename and optimize it first.
