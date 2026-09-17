export type WorldCell = {
  h3Index: string;
  distance: number;
  center: { lat: number; lng: number };
  occupied: boolean;
  claim: null | {
    ownerId: string;
    ownerName: string | null;
    leaseUntil: string | null;
  };
  building: null | {
    id: string;
    code: string | null;
    name: string | null;
    level: number | null;
    status: string | null;
  };
};

export type LocateResponse = {
  position: { lat: number; lng: number };
  resolution: number;
  ring: number;
  currentCell: WorldCell | null;
  cells: WorldCell[];
};

export type PlayerSummary = {
  id: string;
  displayName: string;
  companyName: string | null;
  wallet: { soft: number; premium: number };
  geology: {
    range: number;
    coverage: number;
    depth: number;
    accuracy: number;
    sensitivity: number;
  };
  stats: { territories: number; buildings: number; knownDeposits: number };
};

export type GeologySkillKey = 'range' | 'coverage' | 'depth' | 'accuracy' | 'sensitivity';

export type GeologyCapabilities = {
  rangeMeters: number;
  coverageRing: number;
  maxDepthMeters: number;
  accuracyError: number;
  maxVisibleRarity: number;
};

export type GeologyUpgradeOption = {
  skill: GeologySkillKey;
  currentLevel: number;
  nextLevel: number | null;
  maxed: boolean;
  price: { soft: number; premium: number } | null;
  currentValue: number;
  nextValue: number | null;
  unit: string;
};

export type GeologyUpgradeCatalog = {
  playerId: string;
  wallet: { soft: number; premium: number };
  capabilities: GeologyCapabilities;
  upgrades: GeologyUpgradeOption[];
};

export type GeologyUpgradeResponse = {
  status: 'upgraded';
  playerId: string;
  skill: GeologySkillKey;
  level: number;
  currency: 'soft' | 'premium';
  charged: number;
  wallet: { soft: number; premium: number };
  capabilities: GeologyCapabilities;
  nextUpgrade: GeologyUpgradeOption;
};

export type GeologyDeposit = {
  id: string;
  h3Index: string;
  resource: {
    code: string;
    name: string;
    rarity: number;
    unit: string;
  };
  estimates: {
    quantity: { min: number; max: number };
    depthFromMeters: { min: number; max: number };
    depthToMeters: { min: number; max: number };
    quality: { min: number; max: number };
    density: { min: number; max: number };
    confidence: number;
  };
};

export type GeologyPreviewResponse = {
  playerId: string;
  playerPosition: { lat: number; lng: number };
  target: {
    lat: number;
    lng: number;
    h3Index: string | null;
    distanceMeters: number;
  };
  capabilities: {
    rangeMeters: number;
    coverageRing: number;
    maxDepthMeters: number;
    accuracyError: number;
    maxVisibleRarity: number;
    confidence: number;
    scannedCellCount: number;
  };
  deposits: GeologyDeposit[];
};

export type GeologyScanResponse = {
  scanId: string;
  playerId: string;
  playerPosition: { lat: number; lng: number };
  target: { lat: number; lng: number; distanceMeters: number };
  capabilities: GeologyPreviewResponse['capabilities'];
  deposits: Array<{
    id: string;
    h3Index: string;
    resource: GeologyDeposit['resource'];
    estimates: {
      quantity: { min: number; max: number };
      depthFromMeters: number;
      depthToMeters: number;
      quality: number;
      confidence: number;
    };
  }>;
};

export type ExtractionResource = {
  code: string;
  name: string;
  unit: string;
};

export type ExtractionStatus = {
  buildingId: string;
  status: 'running' | 'paused' | 'depleted';
  ratePerHour: number;
  maxBufferHours: number;
  availableToCollect: number;
  lastCollectedAt: string;
  deposit: {
    id: string;
    resource: ExtractionResource;
    quantityRemaining: number;
  };
};

export type StartExtractionResponse = {
  status: 'running';
  buildingId: string;
  deposit: {
    id: string;
    resource: ExtractionResource;
    quantityRemaining: number;
  };
  ratePerHour: number;
  maxBufferHours: number;
};

export type CollectExtractionResponse = {
  status: 'running' | 'paused' | 'depleted';
  buildingId: string;
  collected: number;
  resource: ExtractionResource;
  inventoryQuantity: number;
  depositQuantityRemaining: number;
};

export type InventoryItem = {
  resourceId: number;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  updatedAt: string;
};

export type MarketOffer = {
  resourceId: number;
  code: string;
  name: string;
  unit: string;
  rarity: number;
  quantity: number;
  pricePerUnit: number;
  totalValue: number;
};

export type MarketCatalog = {
  playerId: string;
  wallet: { soft: number; premium: number };
  offers: MarketOffer[];
};

export type MarketSaleResponse = {
  status: 'sold';
  resource: { id: number; code: string; name: string; unit: string };
  quantity: number;
  pricePerUnit: number;
  proceeds: number;
  inventoryQuantity: number;
  wallet: { soft: number; premium: number };
};

export type StorePack = {
  code: string;
  name: string;
  description: string;
  premiumPrice: number;
  softGrant: number;
  resourceGrants: Array<{ resourceCode: string; quantity: number }>;
  badge?: string;
};

export type StoreCatalog = {
  playerId: string;
  wallet: { soft: number; premium: number };
  packs: StorePack[];
};

export type StorePurchaseResponse = {
  status: 'purchased';
  pack: { code: string; name: string };
  chargedPremium: number;
  grantedSoft: number;
  grantedResources: Array<{ code: string; name: string; unit: string; quantity: number }>;
  wallet: { soft: number; premium: number };
};
