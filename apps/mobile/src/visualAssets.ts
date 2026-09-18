const DEFAULT_ASSET_BASE_URL = 'https://raw.githubusercontent.com/MG-Trener/GEO-EMPIRE/main/apps/mobile/assets';

const normalizeBaseUrl = (value?: string): string => (value?.trim().replace(/\/+$/, '') || DEFAULT_ASSET_BASE_URL);

export const visualAssetBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_ART_BASE_URL);

const resourceFiles: Record<string, string> = {
  IRON_ORE: 'resources/iron-ore.png',
  COPPER_ORE: 'resources/copper-ore.png',
  GOLD_ORE: 'resources/gold.png',
  SILVER_ORE: 'resources/silver.png',
  COAL: 'resources/coal.png',
  CRUDE_OIL: 'resources/crude-oil.png',
  NATURAL_GAS: 'resources/natural-gas.png',
  LIMESTONE: 'resources/limestone.png',
  SAND: 'resources/sand.png',
  CLAY: 'resources/clay.png',
  TIMBER: 'resources/timber.png',
  WHEAT: 'resources/wheat.png',
  URANIUM: 'resources/uranium.png',
  LITHIUM: 'resources/lithium.png',
  RARE_EARTHS: 'resources/rare-earths.png',
};

const buildingFiles: Record<string, string> = {
  MINE: 'buildings/mine.png',
  OIL_WELL: 'buildings/oil-well.png',
  GAS_WELL: 'buildings/gas-well.png',
  SAWMILL: 'buildings/sawmill.png',
  WAREHOUSE: 'buildings/warehouse.png',
  POWER_PLANT: 'buildings/power-plant.png',
  STEEL_MILL: 'buildings/steel-mill.png',
  RESEARCH_INSTITUTE: 'buildings/research-institute.png',
};

const packFiles: Record<string, string> = {
  FIELD_STARTER: 'packs/field-starter.png',
  CONSTRUCTION_RESERVE: 'packs/construction-reserve.png',
  INDUSTRIAL_PUSH: 'packs/industrial-push.png',
};

const bannerFiles: Record<string, string> = {
  geology: 'banners/geology.png',
  development: 'banners/development.png',
  market: 'banners/market.png',
  store: 'banners/store.png',
};

function uriFor(path?: string): string | undefined {
  return path ? `${visualAssetBaseUrl}/${path}` : undefined;
}

export function resourceArtworkUri(code?: string | null): string | undefined {
  return uriFor(code ? resourceFiles[code] : undefined);
}

export function buildingArtworkUri(code?: string | null): string | undefined {
  return uriFor(code ? buildingFiles[code] : undefined);
}

export function packArtworkUri(code?: string | null): string | undefined {
  return uriFor(code ? packFiles[code] : undefined);
}

export function bannerArtworkUri(code?: string | null): string | undefined {
  return uriFor(code ? bannerFiles[code] : undefined);
}
