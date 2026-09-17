import type { GeologyPreviewResponse, LocateResponse } from './types';

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

export async function previewGeology(input: {
  playerId: string;
  playerLat: number;
  playerLng: number;
  targetLat: number;
  targetLng: number;
}): Promise<GeologyPreviewResponse> {
  return requestJson<GeologyPreviewResponse>(`${API_URL}/api/v1/geology/preview`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export function getApiUrl(): string {
  return API_URL;
}
