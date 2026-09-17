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
