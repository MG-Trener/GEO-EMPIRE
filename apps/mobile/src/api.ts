import type {
  CollectExtractionResponse,
  ExtractionStatus,
  GeologyScanResponse,
  GeologySkillKey,
  GeologyUpgradeCatalog,
  GeologyUpgradeResponse,
  InventoryItem,
  LocateResponse,
  MarketCatalog,
  MarketSaleResponse,
  PlayerSummary,
  StartExtractionResponse,
} from './types';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000').replace(/\/$/, '');

export const DEMO_PLAYER_ID =
  process.env.EXPO_PUBLIC_DEMO_PLAYER_ID ?? '11111111-1111-4111-8111-111111111111';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

export async function locateWorld(lat: number, lng: number, ring = 2): Promise<LocateResponse> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    resolution: '12',
    ring: String(ring),
  });

  return requestJson<LocateResponse>(`${API_URL}/api/v1/world/locate?${params.toString()}`);
}

export async function getPlayerSummary(playerId = DEMO_PLAYER_ID): Promise<PlayerSummary> {
  return requestJson<PlayerSummary>(`${API_URL}/api/v1/players/${encodeURIComponent(playerId)}/summary`);
}

export async function getGeologyUpgrades(playerId = DEMO_PLAYER_ID): Promise<GeologyUpgradeCatalog> {
  return requestJson<GeologyUpgradeCatalog>(
    `${API_URL}/api/v1/players/${encodeURIComponent(playerId)}/geology-upgrades`,
  );
}

export async function upgradeGeology(input: {
  skill: GeologySkillKey;
  currency?: 'soft' | 'premium';
  playerId?: string;
}): Promise<GeologyUpgradeResponse> {
  const playerId = input.playerId ?? DEMO_PLAYER_ID;
  return requestJson<GeologyUpgradeResponse>(
    `${API_URL}/api/v1/players/${encodeURIComponent(playerId)}/geology-upgrades`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skill: input.skill, currency: input.currency ?? 'soft' }),
    },
  );
}

export async function getMarket(playerId = DEMO_PLAYER_ID): Promise<MarketCatalog> {
  return requestJson<MarketCatalog>(`${API_URL}/api/v1/market/${encodeURIComponent(playerId)}`);
}

export async function sellResource(input: {
  resourceId: number;
  quantity: number;
  playerId?: string;
}): Promise<MarketSaleResponse> {
  return requestJson<MarketSaleResponse>(`${API_URL}/api/v1/market/sell`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      playerId: input.playerId ?? DEMO_PLAYER_ID,
      resourceId: input.resourceId,
      quantity: input.quantity,
    }),
  });
}

export async function runGeologyScan(input: {
  playerId: string;
  playerLat: number;
  playerLng: number;
  targetLat: number;
  targetLng: number;
}): Promise<GeologyScanResponse> {
  return requestJson<GeologyScanResponse>(`${API_URL}/api/v1/geology/scan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function claimTerritory(input: {
  playerId: string;
  playerLat: number;
  playerLng: number;
  h3Index: string;
}): Promise<{ status: string; h3Index: string; leaseUntil: string; charged: number; balance?: number }> {
  return requestJson(`${API_URL}/api/v1/territories/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function constructBuilding(input: {
  playerId: string;
  h3Index: string;
  buildingCode: string;
}): Promise<{
  status: string;
  building: { id: string; code: string; name: string; h3Index: string; completesAt: string };
  charged: number;
  balance: number;
}> {
  return requestJson(`${API_URL}/api/v1/buildings/construct`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function startExtraction(input: {
  playerId: string;
  buildingId: string;
  depositId: string | number;
}): Promise<StartExtractionResponse> {
  return requestJson<StartExtractionResponse>(`${API_URL}/api/v1/extraction/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function getExtractionStatus(
  buildingId: string,
  playerId = DEMO_PLAYER_ID,
): Promise<ExtractionStatus> {
  const params = new URLSearchParams({ playerId });
  return requestJson<ExtractionStatus>(
    `${API_URL}/api/v1/extraction/${encodeURIComponent(buildingId)}?${params.toString()}`,
  );
}

export async function collectExtraction(input: {
  playerId: string;
  buildingId: string;
}): Promise<CollectExtractionResponse> {
  return requestJson<CollectExtractionResponse>(`${API_URL}/api/v1/extraction/collect`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function getInventory(playerId = DEMO_PLAYER_ID): Promise<InventoryItem[]> {
  return requestJson<InventoryItem[]>(
    `${API_URL}/api/v1/extraction/inventory/${encodeURIComponent(playerId)}`,
  );
}

export function getApiUrl(): string {
  return API_URL;
}
