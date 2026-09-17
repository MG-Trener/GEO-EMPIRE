export type DevelopmentMethod = 'open_pit' | 'underground_mine' | 'oil_well' | 'gas_well';

export type DevelopmentOption = {
  method: DevelopmentMethod;
  name: string;
  description: string;
  buildingCode: 'MINE' | 'OIL_WELL' | 'GAS_WELL';
  capex: number;
  marketPricePerUnit: number;
  opexPerUnit: number;
  recoveryRate: number;
  plannedDailyOutput: number;
  estimatedMineLifeDays: number;
  expectedDailyRevenue: number;
  expectedDailyOperatingMargin: number;
  paybackDays: number | null;
  projectValue: number;
  geologyConfidence: number;
  approvalReady: boolean;
  recommended: boolean;
};

type BuildInput = {
  resourceCode: string;
  unit: string;
  quantityMin: number;
  quantityMax: number;
  depthFromMeters: number;
  depthToMeters: number;
  qualityMin: number;
  qualityMax: number;
  confidence: number;
  marketPricePerUnit: number;
};

type MethodConfig = {
  method: DevelopmentMethod;
  name: string;
  description: string;
  buildingCode: DevelopmentOption['buildingCode'];
  baseCapex: number;
  capexPerMeter: number;
  baseOpexFraction: number;
  depthOpexPerMeter: number;
  maxDepthOpexFraction: number;
  recoveryRate: number;
  productionHorizonDays: number;
  maxDailyByUnit: Record<string, number>;
  constructionSeconds: number;
};

const METHOD_CONFIG: Record<DevelopmentMethod, MethodConfig> = {
  open_pit: {
    method: 'open_pit',
    name: 'Открытый карьер',
    description: 'Высокая производительность на относительно неглубоких твёрдых полезных ископаемых.',
    buildingCode: 'MINE',
    baseCapex: 180_000,
    capexPerMeter: 800,
    baseOpexFraction: 0.48,
    depthOpexPerMeter: 0.0004,
    maxDepthOpexFraction: 0.12,
    recoveryRate: 0.90,
    productionHorizonDays: 365,
    maxDailyByUnit: { t: 6000, kg: 1500, unit: 6000 },
    constructionSeconds: 120,
  },
  underground_mine: {
    method: 'underground_mine',
    name: 'Подземная шахта',
    description: 'Дороже, но позволяет разрабатывать глубокие рудные тела с меньшим поверхностным следом.',
    buildingCode: 'MINE',
    baseCapex: 500_000,
    capexPerMeter: 1500,
    baseOpexFraction: 0.62,
    depthOpexPerMeter: 0.00025,
    maxDepthOpexFraction: 0.12,
    recoveryRate: 0.82,
    productionHorizonDays: 540,
    maxDailyByUnit: { t: 2500, kg: 650, unit: 2500 },
    constructionSeconds: 180,
  },
  oil_well: {
    method: 'oil_well',
    name: 'Нефтяная скважина',
    description: 'Проект бурения и эксплуатации нефтяной залежи.',
    buildingCode: 'OIL_WELL',
    baseCapex: 650_000,
    capexPerMeter: 1000,
    baseOpexFraction: 0.40,
    depthOpexPerMeter: 0.00012,
    maxDepthOpexFraction: 0.12,
    recoveryRate: 0.55,
    productionHorizonDays: 600,
    maxDailyByUnit: { bbl: 4000, unit: 4000 },
    constructionSeconds: 150,
  },
  gas_well: {
    method: 'gas_well',
    name: 'Газовая скважина',
    description: 'Проект бурения и эксплуатации газовой залежи.',
    buildingCode: 'GAS_WELL',
    baseCapex: 600_000,
    capexPerMeter: 950,
    baseOpexFraction: 0.36,
    depthOpexPerMeter: 0.0001,
    maxDepthOpexFraction: 0.12,
    recoveryRate: 0.65,
    productionHorizonDays: 600,
    maxDailyByUnit: { m3: 100_000, unit: 100_000 },
    constructionSeconds: 150,
  },
};

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function viableMethods(resourceCode: string, depthFrom: number, depthTo: number): DevelopmentMethod[] {
  if (resourceCode === 'CRUDE_OIL') return ['oil_well'];
  if (resourceCode === 'NATURAL_GAS') return ['gas_well'];

  const methods: DevelopmentMethod[] = [];
  if (depthFrom <= 120 && depthTo <= 400) methods.push('open_pit');
  if (depthTo >= 80 || depthFrom > 60) methods.push('underground_mine');
  if (!methods.length) methods.push('open_pit');
  return methods;
}

function riskPenalty(confidence: number): number {
  if (confidence >= 0.95) return 1;
  if (confidence >= 0.8) return 0.92;
  if (confidence >= 0.55) return 0.78;
  return 0.62;
}

export function getDevelopmentConstructionSeconds(method: DevelopmentMethod): number {
  return METHOD_CONFIG[method].constructionSeconds;
}

export function buildDevelopmentOptions(input: BuildInput): DevelopmentOption[] {
  const quantityMin = Math.max(0, input.quantityMin);
  const quantityMax = Math.max(quantityMin, input.quantityMax);
  const midpointQuantity = (quantityMin + quantityMax) / 2;
  const averageDepth = Math.max(0, (input.depthFromMeters + input.depthToMeters) / 2);
  const averageQuality = Math.max(0, (input.qualityMin + input.qualityMax) / 2);
  const qualityFactor = Math.min(1, Math.max(0.7, 0.7 + (averageQuality / 100) * 0.3));
  const confidence = Math.min(0.999, Math.max(0, input.confidence));

  const options: DevelopmentOption[] = viableMethods(input.resourceCode, input.depthFromMeters, input.depthToMeters).map((method): DevelopmentOption => {
    const config = METHOD_CONFIG[method];
    const capex = Math.round(config.baseCapex + averageDepth * config.capexPerMeter);
    const depthOpexFraction = Math.min(config.maxDepthOpexFraction, averageDepth * config.depthOpexPerMeter);
    const opexFraction = Math.min(0.95, config.baseOpexFraction + depthOpexFraction);
    const opexPerUnit = round(input.marketPricePerUnit * opexFraction, 4);
    const recoverableQuantity = midpointQuantity * config.recoveryRate;
    const uncappedDaily = recoverableQuantity / config.productionHorizonDays * qualityFactor;
    const maxDaily = config.maxDailyByUnit[input.unit] ?? config.maxDailyByUnit.unit ?? Number.POSITIVE_INFINITY;
    const plannedDailyOutput = round(Math.max(0, Math.min(uncappedDaily, maxDaily)), 4);
    const expectedDailyRevenue = Math.floor(plannedDailyOutput * input.marketPricePerUnit);
    const expectedDailyOperatingMargin = Math.max(0, Math.floor(plannedDailyOutput * (input.marketPricePerUnit - opexPerUnit)));
    const paybackDays = expectedDailyOperatingMargin > 0
      ? round(capex / expectedDailyOperatingMargin, 1)
      : null;
    const estimatedMineLifeDays = plannedDailyOutput > 0
      ? Math.max(1, Math.round(recoverableQuantity / plannedDailyOutput))
      : 0;
    const totalOperatingMargin = recoverableQuantity * Math.max(0, input.marketPricePerUnit - opexPerUnit);
    const projectValue = Math.floor((totalOperatingMargin - capex) * riskPenalty(confidence));

    return {
      method,
      name: config.name,
      description: config.description,
      buildingCode: config.buildingCode,
      capex,
      marketPricePerUnit: input.marketPricePerUnit,
      opexPerUnit,
      recoveryRate: config.recoveryRate,
      plannedDailyOutput,
      estimatedMineLifeDays,
      expectedDailyRevenue,
      expectedDailyOperatingMargin,
      paybackDays,
      projectValue,
      geologyConfidence: round(confidence, 4),
      approvalReady: confidence >= 0.85,
      recommended: false,
    };
  });

  const candidates = options.filter((option) => option.paybackDays !== null && option.projectValue > 0);
  const recommended = [...candidates].sort((a, b) => (a.paybackDays ?? Infinity) - (b.paybackDays ?? Infinity))[0];
  if (recommended) recommended.recommended = true;

  return options;
}
