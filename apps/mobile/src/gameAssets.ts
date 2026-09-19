import type { ImageSourcePropType } from 'react-native';

export const gameAssets = {
  nav: {
    map: require('../assets/images/sheet_ru_2/sheet_ru_2_element_004.png'),
    exploration: require('../assets/images/sheet_ru_2/sheet_ru_2_element_005.png'),
    development: require('../assets/images/sheet_ru_2/sheet_ru_2_element_006.png'),
    construction: require('../assets/images/sheet_ru_2/sheet_ru_2_element_007.png'),
    trade: require('../assets/images/sheet_ru_2/sheet_ru_2_element_008.png'),
    technologies: require('../assets/images/sheet_ru_2/sheet_ru_2_element_009.png'),
    policy: require('../assets/images/sheet_ru_2/sheet_ru_2_element_010.png'),
    settings: require('../assets/images/sheet_ru_2/sheet_ru_2_element_011.png'),
  },
  utility: {
    back: require('../assets/images/sheet_ru_2/sheet_ru_2_element_012.png'),
    home: require('../assets/images/sheet_ru_2/sheet_ru_2_element_013.png'),
    search: require('../assets/images/sheet_ru_2/sheet_ru_2_element_014.png'),
    filter: require('../assets/images/sheet_ru_2/sheet_ru_2_element_015.png'),
    list: require('../assets/images/sheet_ru_2/sheet_ru_2_element_016.png'),
    layers: require('../assets/images/sheet_ru_2/sheet_ru_2_element_017.png'),
    stats: require('../assets/images/sheet_ru_2/sheet_ru_2_element_018.png'),
    build: require('../assets/images/sheet_ru_2/sheet_ru_2_element_019.png'),
    upgrade: require('../assets/images/sheet_ru_2/sheet_ru_2_element_020.png'),
    delete: require('../assets/images/sheet_ru_2/sheet_ru_2_element_021.png'),
    select: require('../assets/images/sheet_ru_2/sheet_ru_2_element_022.png'),
    marker: require('../assets/images/sheet_ru_2/sheet_ru_2_element_023.png'),
    favorite: require('../assets/images/sheet_ru_2/sheet_ru_2_element_024.png'),
    zoomIn: require('../assets/images/sheet_ru_2/sheet_ru_2_element_025.png'),
    zoomOut: require('../assets/images/sheet_ru_2/sheet_ru_2_element_026.png'),
    center: require('../assets/images/sheet_ru_2/sheet_ru_2_element_027.png'),
    globe: require('../assets/images/sheet_ru_2/sheet_ru_2_element_028.png'),
    territories: require('../assets/images/sheet_ru_2/sheet_ru_2_element_029.png'),
    measure: require('../assets/images/sheet_ru_2/sheet_ru_2_element_030.png'),
    fullscreen: require('../assets/images/sheet_ru_2/sheet_ru_2_element_031.png'),
    play: require('../assets/images/sheet_ru_2/sheet_ru_2_element_032.png'),
    pause: require('../assets/images/sheet_ru_2/sheet_ru_2_element_033.png'),
    speed: require('../assets/images/sheet_ru_2/sheet_ru_2_element_034.png'),
    time: require('../assets/images/sheet_ru_2/sheet_ru_2_element_035.png'),
  },
  actions: {
    research: require('../assets/images/sheet_ru_1/sheet_ru_1_element_006.png'),
    place: require('../assets/images/sheet_ru_1/sheet_ru_1_element_007.png'),
    improve: require('../assets/images/sheet_ru_1/sheet_ru_1_element_008.png'),
    sell: require('../assets/images/sheet_ru_1/sheet_ru_1_element_009.png'),
    remove: require('../assets/images/sheet_ru_1/sheet_ru_1_element_010.png'),
    researchSection: require('../assets/images/sheet_ru_1/sheet_ru_1_element_011.png'),
    profile: require('../assets/images/sheet_ru_1/sheet_ru_1_element_012.png'),
    settings: require('../assets/images/sheet_ru_1/sheet_ru_1_element_013.png'),
    info: require('../assets/images/sheet_ru_1/sheet_ru_1_element_014.png'),
    route: require('../assets/images/sheet_ru_1/sheet_ru_1_element_015.png'),
    favorite: require('../assets/images/sheet_ru_1/sheet_ru_1_element_016.png'),
    share: require('../assets/images/sheet_ru_1/sheet_ru_1_element_017.png'),
    extract: require('../assets/images/sheet_ru_2/sheet_ru_2_element_032.png'),
    collect: require('../assets/images/sheet_ru_1/sheet_ru_1_element_009.png'),
  },
  mapModes: {
    satellite: require('../assets/images/sheet_ru_1/sheet_ru_1_element_027.png'),
    terrain: require('../assets/images/sheet_ru_1/sheet_ru_1_element_028.png'),
    resources: require('../assets/images/sheet_ru_1/sheet_ru_1_element_029.png'),
    borders: require('../assets/images/sheet_ru_1/sheet_ru_1_element_030.png'),
    infrastructure: require('../assets/images/sheet_ru_1/sheet_ru_1_element_031.png'),
    threeD: require('../assets/images/sheet_ru_1/sheet_ru_1_element_032.png'),
  },
  resources: {
    oil: require('../assets/images/resources/oil.png'),
    gas: require('../assets/images/resources/natural-gas.png'),
    gold: require('../assets/images/resources/gold-ore.png'),
    copper: require('../assets/images/resources/copper-ore.png'),
    iron: require('../assets/images/resources/iron-ore.png'),
    coal: require('../assets/images/resources/coal.png'),
    silver: require('../assets/images/sheet_ru_1/sheet_ru_1_element_018.png'),
    limestone: require('../assets/images/sheet_ru_1/sheet_ru_1_element_019.png'),
    sand: require('../assets/images/sheet_ru_1/sheet_ru_1_element_020.png'),
    clay: require('../assets/images/sheet_ru_1/sheet_ru_1_element_021.png'),
    timber: require('../assets/images/sheet_ru_1/sheet_ru_1_element_022.png'),
    wheat: require('../assets/images/sheet_ru_1/sheet_ru_1_element_023.png'),
    uranium: require('../assets/images/sheet_ru_1/sheet_ru_1_element_024.png'),
    lithium: require('../assets/images/sheet_ru_1/sheet_ru_1_element_025.png'),
    rareEarths: require('../assets/images/sheet_ru_1/sheet_ru_1_element_026.png'),
    strategic: require('../assets/images/sheet_ru_1/sheet_ru_1_element_026.png'),
  },
  industry: {
    oilPumpjack: require('../assets/images/buildings/oil-pumpjack.png'),
    mineTruck: require('../assets/images/equipment/open-pit-mining-truck.png'),
    construction: require('../assets/images/sheet_ru_2/sheet_ru_2_element_019.png'),
    facility: require('../assets/images/sheet_ru_2/sheet_ru_2_element_007.png'),
  },
  splash: {
    start: require('../assets/images/splash/geo-empire-start.jpg'),
    promo: require('../assets/images/splash/geo-empire-promo.jpg'),
  },
} as const;

export type ResourceIconKey =
  | 'resource-oil'
  | 'resource-gas'
  | 'resource-gold'
  | 'resource-copper'
  | 'resource-iron'
  | 'resource-coal'
  | 'resource-silver'
  | 'resource-limestone'
  | 'resource-sand'
  | 'resource-clay'
  | 'resource-timber'
  | 'resource-wheat'
  | 'resource-uranium'
  | 'resource-lithium'
  | 'resource-rare-earths';

function resourcePresentation(code?: string | null): {
  key: ResourceIconKey;
  source: ImageSourcePropType;
  mapScale: number;
} {
  const normalized = String(code ?? '').toUpperCase();
  if (normalized.includes('CRUDE_OIL') || normalized === 'OIL' || normalized.includes('НЕФТ')) {
    return { key: 'resource-oil', source: gameAssets.resources.oil, mapScale: 0.065 };
  }
  if (normalized.includes('NATURAL_GAS') || normalized === 'GAS' || normalized.includes('ГАЗ')) {
    return { key: 'resource-gas', source: gameAssets.resources.gas, mapScale: 0.12 };
  }
  if (normalized.includes('GOLD') || normalized.includes('ЗОЛОТ')) {
    return { key: 'resource-gold', source: gameAssets.resources.gold, mapScale: 0.065 };
  }
  if (normalized.includes('COPPER') || normalized === 'CU' || normalized.includes('МЕД')) {
    return { key: 'resource-copper', source: gameAssets.resources.copper, mapScale: 0.065 };
  }
  if (normalized.includes('IRON') || normalized === 'FE' || normalized.includes('ЖЕЛЕЗ')) {
    return { key: 'resource-iron', source: gameAssets.resources.iron, mapScale: 0.065 };
  }
  if (normalized.includes('COAL') || normalized.includes('УГОЛ')) {
    return { key: 'resource-coal', source: gameAssets.resources.coal, mapScale: 0.065 };
  }
  if (normalized.includes('SILVER') || normalized.includes('СЕРЕБ')) {
    return { key: 'resource-silver', source: gameAssets.resources.silver, mapScale: 0.3 };
  }
  if (normalized.includes('LIMESTONE') || normalized.includes('ИЗВЕСТ')) {
    return { key: 'resource-limestone', source: gameAssets.resources.limestone, mapScale: 0.3 };
  }
  if (normalized === 'SAND' || normalized.includes('ПЕС')) {
    return { key: 'resource-sand', source: gameAssets.resources.sand, mapScale: 0.3 };
  }
  if (normalized === 'CLAY' || normalized.includes('ГЛИН')) {
    return { key: 'resource-clay', source: gameAssets.resources.clay, mapScale: 0.3 };
  }
  if (normalized.includes('TIMBER') || normalized.includes('WOOD') || normalized.includes('ДРЕВЕС')) {
    return { key: 'resource-timber', source: gameAssets.resources.timber, mapScale: 0.3 };
  }
  if (normalized.includes('WHEAT') || normalized.includes('ПШЕН')) {
    return { key: 'resource-wheat', source: gameAssets.resources.wheat, mapScale: 0.3 };
  }
  if (normalized.includes('URAN') || normalized.includes('УРАН')) {
    return { key: 'resource-uranium', source: gameAssets.resources.uranium, mapScale: 0.3 };
  }
  if (normalized.includes('LITH') || normalized.includes('ЛИТ')) {
    return { key: 'resource-lithium', source: gameAssets.resources.lithium, mapScale: 0.3 };
  }
  if (normalized.includes('RARE') || normalized.includes('REE') || normalized.includes('РЕДКОЗЕМ')) {
    return { key: 'resource-rare-earths', source: gameAssets.resources.rareEarths, mapScale: 0.3 };
  }
  return { key: 'resource-rare-earths', source: gameAssets.resources.strategic, mapScale: 0.3 };
}

export function resourceIconForCode(code?: string | null): ImageSourcePropType {
  return resourcePresentation(code).source;
}

export function resourceIconKeyForCode(code?: string | null): ResourceIconKey {
  return resourcePresentation(code).key;
}

export function resourceMapScaleForCode(code?: string | null): number {
  return resourcePresentation(code).mapScale;
}

export function industrialIconForBuilding(code?: string | null, status?: string | null): ImageSourcePropType {
  const normalizedCode = String(code ?? '').toUpperCase();
  const normalizedStatus = String(status ?? '').toUpperCase();

  if (
    normalizedStatus.includes('CONSTRUCT')
    || normalizedStatus.includes('BUILD')
    || normalizedStatus.includes('PLANNED')
    || normalizedStatus.includes('СТРО')
  ) {
    return gameAssets.industry.construction;
  }

  if (normalizedCode.includes('MINE') || normalizedCode.includes('PIT')) {
    return gameAssets.industry.mineTruck;
  }

  if (normalizedCode.includes('OIL') || normalizedCode.includes('GAS') || normalizedCode.includes('WELL')) {
    return gameAssets.industry.oilPumpjack;
  }

  return gameAssets.industry.facility;
}
