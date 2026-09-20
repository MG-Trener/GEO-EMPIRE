import { cellToLatLng, cellToParent } from 'h3-js';
import type {
  CollectExtractionResponse,
  ExtractionStatus,
  GeologyScanResponse,
  GeologySkillKey,
  GeologyUpgradeCatalog,
  GeologyUpgradeResponse,
  IndustrialTechnologyKey,
  InventoryItem,
  KnownDepositsResponse,
  LocateResponse,
  MarketCatalog,
  MarketSaleResponse,
  PlayerSummary,
  StartExtractionResponse,
  StoreCatalog,
  StorePurchaseResponse,
  TechnologyCatalog,
  TechnologyUpgradeResponse,
} from './types';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000').replace(/\/$/, '');
const EARTH_RADIUS_METERS = 6_371_000;
export const PHYSICAL_BUILD_RADIUS_METERS = 75;

export let DEMO_PLAYER_ID =
  process.env.EXPO_PUBLIC_DEMO_PLAYER_ID ?? '11111111-1111-4111-8111-111111111111';

export function setActivePlayerId(playerId: string): void {
  DEMO_PLAYER_ID = playerId;
}

const GEOLOGY_ZONE_RESOLUTION = 10;

export function getDistanceToH3Center(lat: number, lng: number, h3Index: string): number | null {
  try {
    const [targetLat, targetLng] = cellToLatLng(h3Index);
    const lat1 = lat * Math.PI / 180;
    const lat2 = targetLat * Math.PI / 180;
    const deltaLat = (targetLat - lat) * Math.PI / 180;
    const deltaLng = (targetLng - lng) * Math.PI / 180;
    const haversine = Math.sin(deltaLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
  } catch {
    return null;
  }
}

function assertPhysicalRange(
  lat: number,
  lng: number,
  h3Index: string,
  action: 'аренды' | 'строительства',
): void {
  const distance = getDistanceToH3Center(lat, lng, h3Index);
  if (distance !== null && distance > PHYSICAL_BUILD_RADIUS_METERS) {
    throw new Error(
      `Для ${action} подойдите ближе: ${Math.round(distance)} м до точки, допустимо ${PHYSICAL_BUILD_RADIUS_METERS} м`,
    );
  }
}

export function compactGeologyDeposits<T extends { h3Index: string }>(
  deposits: T[],
  limit: number,
): T[] {
  const seenZones = new Set<string>();
  const compacted: T[] = [];

  for (const deposit of deposits) {
    let zone = deposit.h3Index;
    try {
      zone = cellToParent(deposit.h3Index, GEOLOGY_ZONE_RESOLUTION);
    } catch {
      // Keep malformed/legacy H3 identifiers isolated instead of crashing the UI.
    }

    if (seenZones.has(zone)) continue;
    seenZones.add(zone);
    compacted.push(deposit);
    if (compacted.length >= limit) break;
  }

  return compacted;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body
      ? String(body.message)
      : body && typeof body === 'object' && 'error' in body
        ? String(body.error)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

export async function bootstrapPlayer(input: {
  authSubject: string;
  displayName?: string;
  companyName?: string;
}): Promise<{
  status: 'existing' | 'created';
  starterGrant: { soft: number; premium: number } | null;
  player: PlayerSummary;
}> {
  return requestJson(`${API_URL}/api/v1/onboarding/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function resetPlayerForTesting(authSubject: string): Promise<{
  status: 'reset';
  testGrant: { soft: number; premium: number; everyResource: number };
  player: PlayerSummary;
}> {
  return requestJson(`${API_URL}/api/v1/onboarding/reset-for-testing`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authSubject }),
  });
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

export async function getTechnologyCatalog(playerId = DEMO_PLAYER_ID): Promise<TechnologyCatalog> {
  return requestJson<TechnologyCatalog>(
    `${API_URL}/api/v1/players/${encodeURIComponent(playerId)}/technologies`,
  );
}

export async function upgradeTechnology(input: {
  techKey: IndustrialTechnologyKey;
  playerId?: string;
}): Promise<TechnologyUpgradeResponse> {
  const playerId = input.playerId ?? DEMO_PLAYER_ID;
  return requestJson<TechnologyUpgradeResponse>(
    `${API_URL}/api/v1/players/${encodeURIComponent(playerId)}/technologies`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ techKey: input.techKey }),
    },
  );
}

export async function getKnownDeposits(playerId = DEMO_PLAYER_ID): Promise<KnownDepositsResponse> {
  const result = await requestJson<KnownDepositsResponse>(
    `${API_URL}/api/v1/geology/${encodeURIComponent(playerId)}/deposits`,
  );
  return { ...result, deposits: compactGeologyDeposits(result.deposits, 6) };
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

export async function getStore(playerId = DEMO_PLAYER_ID): Promise<StoreCatalog> {
  return requestJson<StoreCatalog>(`${API_URL}/api/v1/store/${encodeURIComponent(playerId)}`);
}

export async function purchaseStorePack(input: {
  packCode: string;
  playerId?: string;
}): Promise<StorePurchaseResponse> {
  return requestJson<StorePurchaseResponse>(`${API_URL}/api/v1/store/purchase`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      playerId: input.playerId ?? DEMO_PLAYER_ID,
      packCode: input.packCode,
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
  const result = await requestJson<GeologyScanResponse>(`${API_URL}/api/v1/geology/scan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { ...result, deposits: compactGeologyDeposits(result.deposits, 3) };
}

export async function claimTerritory(input: {
  playerId: string;
  playerLat: number;
  playerLng: number;
  h3Index: string;
}): Promise<{ status: string; h3Index: string; leaseUntil: string; charged: number; balance?: number }> {
  assertPhysicalRange(input.playerLat, input.playerLng, input.h3Index, 'аренды');
  return requestJson(`${API_URL}/api/v1/territories/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function constructBuilding(input: {
  playerId: string;
  playerLat: number;
  playerLng: number;
  h3Index: string;
  buildingCode: string;
}): Promise<{
  status: string;
  building: { id: string; code: string; name: string; h3Index: string; completesAt: string };
  charged: number;
  balance: number;
  interaction?: { distanceMeters: number; maxDistanceMeters: number };
}> {
  assertPhysicalRange(input.playerLat, input.playerLng, input.h3Index, 'строительства');
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
