import type { GeologyScanResponse, LocateResponse } from './types';

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

export function getApiUrl(): string {
  return API_URL;
}
