export type TechnologyCategory = 'production' | 'economy' | 'logistics';

export const TECHNOLOGY_KEYS = [
  'extraction_automation',
  'mine_mechanization',
  'well_optimization',
  'predictive_maintenance',
  'commodity_trading',
  'land_management',
  'warehouse_network',
  'heavy_haul',
  'pipeline_network',
  'fuel_logistics',
] as const;

export type TechnologyKey = (typeof TECHNOLOGY_KEYS)[number];

export type TechnologyDefinition = {
  key: TechnologyKey;
  category: TechnologyCategory;
  title: string;
  description: string;
  effect: string;
  effectPerLevel: number;
  effectUnit: 'percent' | 'hours';
  costScale: number;
};

export const TECHNOLOGY_DEFINITIONS: readonly TechnologyDefinition[] = [
  {
    key: 'extraction_automation',
    category: 'production',
    title: 'Автоматизация добычи',
    description: 'Диспетчеризация техники и автоматические циклы повышают выпуск всех добывающих объектов.',
    effect: 'Общая производительность добычи',
    effectPerLevel: 0.025,
    effectUnit: 'percent',
    costScale: 1.0,
  },
  {
    key: 'mine_mechanization',
    category: 'production',
    title: 'Механизация шахт',
    description: 'Высокопроизводительные комплексы бурения, погрузки и выемки для рудных объектов.',
    effect: 'Производительность шахт и карьеров',
    effectPerLevel: 0.04,
    effectUnit: 'percent',
    costScale: 1.1,
  },
  {
    key: 'well_optimization',
    category: 'production',
    title: 'Оптимизация скважин',
    description: 'Интеллектуальное управление дебитом нефтяных и газовых скважин.',
    effect: 'Производительность нефтегазовых скважин',
    effectPerLevel: 0.04,
    effectUnit: 'percent',
    costScale: 1.15,
  },
  {
    key: 'predictive_maintenance',
    category: 'production',
    title: 'Предиктивное обслуживание',
    description: 'Диагностика оборудования до отказа снижает эксплуатационные расходы.',
    effect: 'Снижение OPEX добычи',
    effectPerLevel: 0.035,
    effectUnit: 'percent',
    costScale: 1.05,
  },
  {
    key: 'commodity_trading',
    category: 'economy',
    title: 'Сырьевой трейдинг',
    description: 'Лучшее исполнение сделок повышает фактическую цену реализации ресурсов.',
    effect: 'Премия к рыночной цене продажи',
    effectPerLevel: 0.025,
    effectUnit: 'percent',
    costScale: 1.05,
  },
  {
    key: 'land_management',
    category: 'economy',
    title: 'Управление территориями',
    description: 'Юридическая и кадастровая оптимизация снижает стоимость аренды новых участков.',
    effect: 'Снижение стоимости аренды участка',
    effectPerLevel: 0.04,
    effectUnit: 'percent',
    costScale: 0.9,
  },
  {
    key: 'warehouse_network',
    category: 'logistics',
    title: 'Складская сеть',
    description: 'Промежуточные склады увеличивают время автономной работы добывающих объектов без выгрузки.',
    effect: 'Буфер накопления продукции',
    effectPerLevel: 6,
    effectUnit: 'hours',
    costScale: 0.9,
  },
  {
    key: 'heavy_haul',
    category: 'logistics',
    title: 'Тяжёлая карьерная логистика',
    description: 'Оптимизация самосвалов и плеч доставки ускоряет поток руды от забоя.',
    effect: 'Дополнительная производительность шахт',
    effectPerLevel: 0.025,
    effectUnit: 'percent',
    costScale: 1.0,
  },
  {
    key: 'pipeline_network',
    category: 'logistics',
    title: 'Трубопроводная сеть',
    description: 'Сборные трубопроводы и узлы подготовки увеличивают пропускную способность скважин.',
    effect: 'Дополнительная производительность скважин',
    effectPerLevel: 0.025,
    effectUnit: 'percent',
    costScale: 1.1,
  },
  {
    key: 'fuel_logistics',
    category: 'logistics',
    title: 'Топливная логистика',
    description: 'Маршрутизация снабжения и энергоучёт уменьшают переменную себестоимость добычи.',
    effect: 'Дополнительное снижение OPEX',
    effectPerLevel: 0.02,
    effectUnit: 'percent',
    costScale: 0.95,
  },
] as const;

const BASE_UPGRADE_COSTS = [2_500, 4_500, 7_500, 12_000, 18_000, 27_000, 40_000, 60_000, 90_000, 135_000] as const;

export type TechnologyLevels = Record<TechnologyKey, number>;

export type TechnologyModifiers = {
  productionMultiplier: number;
  mineProductionMultiplier: number;
  wellProductionMultiplier: number;
  extractionOpexMultiplier: number;
  marketPriceMultiplier: number;
  claimCostMultiplier: number;
  bufferHoursBonus: number;
};

export function emptyTechnologyLevels(): TechnologyLevels {
  return Object.fromEntries(TECHNOLOGY_KEYS.map((key) => [key, 0])) as TechnologyLevels;
}

export function getTechnologyUpgradeCost(key: TechnologyKey, currentLevel: number): number | null {
  const normalized = Math.trunc(currentLevel);
  if (normalized < 0 || normalized >= 10) return null;
  const definition = TECHNOLOGY_DEFINITIONS.find((item) => item.key === key);
  if (!definition) return null;
  return Math.max(1, Math.round(BASE_UPGRADE_COSTS[normalized] * definition.costScale));
}

export function getTechnologyModifiers(levels: TechnologyLevels): TechnologyModifiers {
  return {
    productionMultiplier: 1 + levels.extraction_automation * 0.025,
    mineProductionMultiplier: 1 + levels.mine_mechanization * 0.04 + levels.heavy_haul * 0.025,
    wellProductionMultiplier: 1 + levels.well_optimization * 0.04 + levels.pipeline_network * 0.025,
    extractionOpexMultiplier: Math.max(0.45, 1 - levels.predictive_maintenance * 0.035 - levels.fuel_logistics * 0.02),
    marketPriceMultiplier: 1 + levels.commodity_trading * 0.025,
    claimCostMultiplier: Math.max(0.55, 1 - levels.land_management * 0.04),
    bufferHoursBonus: levels.warehouse_network * 6,
  };
}

export function getTechnologyEffectValue(definition: TechnologyDefinition, level: number): number {
  return Math.max(0, Math.min(10, Math.trunc(level))) * definition.effectPerLevel;
}
