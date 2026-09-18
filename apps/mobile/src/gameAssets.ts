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
    uranium: require('../assets/images/sheet_ru_1/sheet_ru_1_element_024.png'),
    rareEarths: require('../assets/images/sheet_ru_1/sheet_ru_1_element_025.png'),
    strategic: require('../assets/images/sheet_ru_1/sheet_ru_1_element_026.png'),
  },
  splash: {
    start: require('../assets/images/splash/geo-empire-start.jpg'),
    promo: require('../assets/images/splash/geo-empire-promo.jpg'),
  },
} as const;

export function resourceIconForCode(code?: string | null): ImageSourcePropType {
  const normalized = String(code ?? '').toUpperCase();
  if (normalized.includes('OIL') || normalized.includes('НЕФТ')) return gameAssets.resources.oil;
  if (normalized.includes('GAS') || normalized.includes('ГАЗ')) return gameAssets.resources.gas;
  if (normalized.includes('GOLD') || normalized.includes('ЗОЛОТ')) return gameAssets.resources.gold;
  if (normalized.includes('COPPER') || normalized.includes('CU') || normalized.includes('МЕД')) return gameAssets.resources.copper;
  if (normalized.includes('IRON') || normalized.includes('FE') || normalized.includes('ЖЕЛЕЗ')) return gameAssets.resources.iron;
  if (normalized.includes('COAL') || normalized.includes('УГОЛ')) return gameAssets.resources.coal;
  if (normalized.includes('URAN') || normalized.includes('УРАН')) return gameAssets.resources.uranium;
  if (normalized.includes('RARE') || normalized.includes('REE') || normalized.includes('РЕДКОЗЕМ')) return gameAssets.resources.rareEarths;
  return gameAssets.resources.strategic;
}
