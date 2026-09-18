import { useMemo } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { cellToBoundary, cellToLatLng } from 'h3-js';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import type { GeologyScanResponse } from './types';

type DepositCell = {
  density: number;
  rarity: number;
  confidence: number;
};

export function GeologyHeatmapLayer({
  scan,
  resourceCode,
  visible,
}: {
  scan: GeologyScanResponse | null;
  resourceCode: string | null;
  visible: boolean;
}) {
  const depositsByCell = useMemo(() => {
    const byCell = new Map<string, DepositCell>();
    if (!visible || !scan || !resourceCode) return byCell;

    for (const deposit of scan.deposits) {
      if (deposit.resource.code !== resourceCode || !deposit.h3Index) continue;

      const density = Math.max(0, Math.min(1, Number(deposit.estimates.density?.value ?? 0)));
      const confidence = Math.max(0, Math.min(1, Number(deposit.estimates.confidence ?? 0)));
      const rarity = Math.max(1, Number(deposit.resource.rarity ?? 1));
      const current = byCell.get(deposit.h3Index);

      byCell.set(deposit.h3Index, {
        density: Math.max(density, current?.density ?? 0),
        confidence: Math.max(confidence, current?.confidence ?? 0),
        rarity: Math.max(rarity, current?.rarity ?? 1),
      });
    }

    return byCell;
  }, [resourceCode, scan, visible]);

  const heatData = useMemo<FeatureCollection<Polygon>>(() => ({
    type: 'FeatureCollection',
    features: [...depositsByCell.entries()].flatMap(([h3Index, sample]) => {
      const boundary = cellToBoundary(h3Index, true) as [number, number][];
      if (!boundary.length) return [];
      return [{
        type: 'Feature' as const,
        id: `heat-${h3Index}`,
        properties: sample,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[...boundary, boundary[0]]],
        },
      }];
    }),
  }), [depositsByCell]);

  const markerData = useMemo<FeatureCollection<Point>>(() => ({
    type: 'FeatureCollection',
    features: [...depositsByCell.entries()].flatMap(([h3Index, sample]) => {
      try {
        const [lat, lng] = cellToLatLng(h3Index);
        return [{
          type: 'Feature' as const,
          id: `deposit-marker-${h3Index}`,
          properties: sample,
          geometry: {
            type: 'Point' as const,
            coordinates: [lng, lat],
          },
        }];
      } catch {
        return [];
      }
    }),
  }), [depositsByCell]);

  return (
    <>
      <GeoJSONSource id="resource-density-heatmap" data={heatData}>
        <Layer
          id="resource-density-fill"
          type="fill"
          paint={{
            'fill-color': [
              'interpolate', ['linear'], ['get', 'density'],
              0, '#173641',
              0.25, '#2f8d92',
              0.5, '#d1b148',
              0.75, '#e77c34',
              1, '#e33d32',
            ],
            'fill-opacity': [
              'interpolate', ['linear'], ['get', 'confidence'],
              0, 0.28,
              1, 0.76,
            ],
          } as never}
        />
        <Layer
          id="resource-density-outline"
          type="line"
          paint={{
            'line-color': [
              'interpolate', ['linear'], ['get', 'density'],
              0, '#5f8792',
              0.5, '#f0cf61',
              1, '#fff1b0',
            ],
            'line-width': [
              'interpolate', ['linear'], ['get', 'density'],
              0, 1,
              1, 2.4,
            ],
            'line-opacity': 0.8,
          } as never}
        />
      </GeoJSONSource>

      <GeoJSONSource id="resource-deposit-markers" data={markerData}>
        <Layer
          id="resource-deposit-halo"
          type="circle"
          paint={{
            'circle-radius': [
              'interpolate', ['linear'], ['get', 'density'],
              0, 9,
              1, 17,
            ],
            'circle-color': [
              'case',
              ['>=', ['get', 'rarity'], 5], '#b96cff',
              ['>=', ['get', 'rarity'], 3], '#f4bd42',
              '#38d8ff',
            ],
            'circle-opacity': 0.16,
            'circle-blur': 0.35,
          } as never}
        />
        <Layer
          id="resource-deposit-core"
          type="circle"
          paint={{
            'circle-radius': [
              'interpolate', ['linear'], ['get', 'density'],
              0, 4.5,
              1, 8.5,
            ],
            'circle-color': [
              'case',
              ['>=', ['get', 'rarity'], 5], '#b96cff',
              ['>=', ['get', 'rarity'], 3], '#f4bd42',
              '#38d8ff',
            ],
            'circle-opacity': [
              'interpolate', ['linear'], ['get', 'confidence'],
              0, 0.55,
              1, 0.98,
            ],
            'circle-stroke-color': '#f5fbff',
            'circle-stroke-width': 1.4,
            'circle-stroke-opacity': 0.9,
          } as never}
        />
        <Layer
          id="resource-deposit-center"
          type="circle"
          paint={{
            'circle-radius': 2,
            'circle-color': '#ffffff',
            'circle-opacity': 0.92,
          } as never}
        />
      </GeoJSONSource>
    </>
  );
}
