import { useEffect, useMemo, useState } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { cellToBoundary, cellToLatLng } from 'h3-js';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import { getKnownDeposits } from './api';
import type { GeologyScanResponse, KnownDeposit } from './types';

type DepositCell = {
  density: number;
  rarity: number;
  confidence: number;
  weight: number;
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
  const [knownDeposits, setKnownDeposits] = useState<KnownDeposit[]>([]);

  useEffect(() => {
    let cancelled = false;
    getKnownDeposits()
      .then((result) => { if (!cancelled) setKnownDeposits(result.deposits); })
      .catch(() => { if (!cancelled) setKnownDeposits([]); });
    return () => { cancelled = true; };
  }, [scan?.scanId]);

  const depositsByCell = useMemo(() => {
    const byCell = new Map<string, DepositCell>();
    if (!visible) return byCell;

    const add = (input: {
      h3Index: string;
      code: string;
      density: number;
      confidence: number;
      rarity: number;
    }) => {
      if (resourceCode && input.code !== resourceCode) return;
      const density = Math.max(0.03, Math.min(1, Number(input.density ?? 0)));
      const confidence = Math.max(0.08, Math.min(1, Number(input.confidence ?? 0)));
      const rarity = Math.max(1, Number(input.rarity ?? 1));
      const current = byCell.get(input.h3Index);
      const weight = Math.max(0.05, Math.min(1, density * (0.45 + confidence * 0.55)));
      byCell.set(input.h3Index, {
        density: Math.max(density, current?.density ?? 0),
        confidence: Math.max(confidence, current?.confidence ?? 0),
        rarity: Math.max(rarity, current?.rarity ?? 1),
        weight: Math.max(weight, current?.weight ?? 0),
      });
    };

    for (const deposit of knownDeposits) {
      add({
        h3Index: deposit.h3Index,
        code: deposit.resource.code,
        density: deposit.estimates.density.value,
        confidence: deposit.estimates.confidence,
        rarity: deposit.resource.rarity,
      });
    }

    for (const deposit of scan?.deposits ?? []) {
      add({
        h3Index: deposit.h3Index,
        code: deposit.resource.code,
        density: deposit.estimates.density?.value ?? 0,
        confidence: deposit.estimates.confidence ?? 0,
        rarity: deposit.resource.rarity ?? 1,
      });
    }

    return byCell;
  }, [knownDeposits, resourceCode, scan, visible]);

  const heatData = useMemo<FeatureCollection<Polygon>>(() => ({
    type: 'FeatureCollection',
    features: [...depositsByCell.entries()].flatMap(([h3Index, sample]) => {
      try {
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
      } catch {
        return [];
      }
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
          geometry: { type: 'Point' as const, coordinates: [lng, lat] },
        }];
      } catch {
        return [];
      }
    }),
  }), [depositsByCell]);

  if (!visible || depositsByCell.size === 0) return null;

  return (
    <>
      <GeoJSONSource id="resource-thermal-points" data={markerData}>
        <Layer
          id="resource-thermal-glow"
          type="heatmap"
          paint={{
            'heatmap-weight': ['get', 'weight'],
            'heatmap-intensity': 1.65,
            'heatmap-radius': [
              'interpolate', ['linear'], ['zoom'],
              12, 18,
              16, 34,
              19, 58,
            ],
            'heatmap-opacity': 0.88,
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,0,0,0)',
              0.12, 'rgba(35,215,255,0.25)',
              0.32, 'rgba(44,214,184,0.48)',
              0.52, 'rgba(244,218,75,0.68)',
              0.72, 'rgba(244,137,47,0.82)',
              0.9, 'rgba(231,62,51,0.94)',
              1, 'rgba(255,245,180,1)',
            ],
          } as never}
        />
      </GeoJSONSource>

      <GeoJSONSource id="resource-density-hexes" data={heatData}>
        <Layer
          id="resource-density-fill"
          type="fill"
          paint={{
            'fill-color': [
              'interpolate', ['linear'], ['get', 'density'],
              0, '#174655',
              0.25, '#20a9ad',
              0.5, '#d7bd42',
              0.75, '#ef7e31',
              1, '#ed4035',
            ],
            'fill-opacity': [
              'interpolate', ['linear'], ['get', 'confidence'],
              0, 0.16,
              0.5, 0.3,
              1, 0.5,
            ],
          } as never}
        />
        <Layer
          id="resource-density-outline"
          type="line"
          paint={{
            'line-color': [
              'interpolate', ['linear'], ['get', 'density'],
              0, '#5fb9c7',
              0.5, '#f5d758',
              1, '#fff0ad',
            ],
            'line-width': [
              'interpolate', ['linear'], ['get', 'confidence'],
              0, 0.8,
              1, 2.3,
            ],
            'line-opacity': 0.88,
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
              0, 8,
              1, 17,
            ],
            'circle-color': [
              'case',
              ['>=', ['get', 'rarity'], 5], '#b96cff',
              ['>=', ['get', 'rarity'], 3], '#f4bd42',
              '#38d8ff',
            ],
            'circle-opacity': 0.18,
            'circle-blur': 0.4,
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
              0, 0.6,
              1, 1,
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
          } as never}
        />
        <Layer
          id="resource-deposit-center"
          type="circle"
          paint={{ 'circle-radius': 2, 'circle-color': '#ffffff', 'circle-opacity': 0.95 } as never}
        />
      </GeoJSONSource>
    </>
  );
}
