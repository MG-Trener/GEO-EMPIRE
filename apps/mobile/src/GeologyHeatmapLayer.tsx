import { useEffect, useMemo, useState } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { cellToBoundary, cellToLatLng, gridDisk } from 'h3-js';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import { getKnownDeposits } from './api';
import type { GeologyScanResponse, KnownDeposit } from './types';

type DepositCell = {
  density: number;
  rarity: number;
  confidence: number;
  weight: number;
};

type ThermalPoint = DepositCell & {
  influence: number;
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
      const weight = Math.max(0.08, Math.min(1, density * (0.42 + confidence * 0.58)));
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

  const exactHexData = useMemo<FeatureCollection<Polygon>>(() => ({
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

  // A deposit can currently be represented by only one confirmed H3 cell.
  // Expand that confirmed sample into a visual influence field for MapLibre's
  // heatmap renderer. The centre keeps the measured density while surrounding
  // cells decay smoothly; exact H3 outlines below still mark only confirmed cells.
  const thermalData = useMemo<FeatureCollection<Point>>(() => {
    const points = new Map<string, ThermalPoint>();

    for (const [h3Index, sample] of depositsByCell.entries()) {
      try {
        const near = new Set(gridDisk(h3Index, 1));
        const field = gridDisk(h3Index, 2);
        for (const cell of field) {
          const influence = cell === h3Index ? 1 : near.has(cell) ? 0.64 : 0.3;
          const density = Math.max(0.01, Math.min(1, sample.density * influence));
          const weight = Math.max(0.025, Math.min(1, sample.weight * influence));
          const current = points.get(cell);
          if (!current || weight > current.weight) {
            points.set(cell, {
              density,
              confidence: sample.confidence,
              rarity: sample.rarity,
              weight,
              influence,
            });
          }
        }
      } catch {
        // Invalid H3 data is ignored without breaking the whole map.
      }
    }

    return {
      type: 'FeatureCollection',
      features: [...points.entries()].flatMap(([h3Index, sample]) => {
        try {
          const [lat, lng] = cellToLatLng(h3Index);
          return [{
            type: 'Feature' as const,
            id: `thermal-${h3Index}`,
            properties: sample,
            geometry: { type: 'Point' as const, coordinates: [lng, lat] },
          }];
        } catch {
          return [];
        }
      }),
    };
  }, [depositsByCell]);

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
      <GeoJSONSource id="resource-thermal-points" data={thermalData}>
        <Layer
          id="resource-thermal-glow"
          type="heatmap"
          paint={{
            'heatmap-weight': ['get', 'weight'],
            'heatmap-intensity': [
              'interpolate', ['linear'], ['zoom'],
              10, 1.2,
              14, 1.75,
              18, 2.5,
            ],
            'heatmap-radius': [
              'interpolate', ['linear'], ['zoom'],
              10, 18,
              12, 26,
              14, 38,
              16, 54,
              18, 76,
              20, 96,
            ],
            'heatmap-opacity': 0.94,
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,0,0,0)',
              0.08, 'rgba(20,104,255,0.18)',
              0.2, 'rgba(31,205,255,0.46)',
              0.38, 'rgba(52,213,143,0.62)',
              0.56, 'rgba(244,222,65,0.76)',
              0.74, 'rgba(248,137,43,0.88)',
              0.9, 'rgba(238,55,45,0.96)',
              1, 'rgba(255,244,174,1)',
            ],
          } as never}
        />
      </GeoJSONSource>

      <GeoJSONSource id="resource-density-hexes" data={exactHexData}>
        <Layer
          id="resource-density-fill"
          type="fill"
          paint={{
            'fill-color': [
              'interpolate', ['linear'], ['get', 'density'],
              0, '#166ee8',
              0.2, '#20c9ee',
              0.4, '#37cf91',
              0.6, '#e2d848',
              0.8, '#ef7e31',
              1, '#ed4035',
            ],
            'fill-opacity': [
              'interpolate', ['linear'], ['get', 'confidence'],
              0, 0.28,
              0.5, 0.48,
              1, 0.7,
            ],
          } as never}
        />
        <Layer
          id="resource-density-outline"
          type="line"
          paint={{
            'line-color': [
              'interpolate', ['linear'], ['get', 'density'],
              0, '#78c8ff',
              0.5, '#ffe36c',
              1, '#fff1b0',
            ],
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 0.5,
              14, 1.2,
              18, 3,
            ],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.25, 14, 0.58, 17, 0.95],
          } as never}
        />
      </GeoJSONSource>

      <GeoJSONSource id="resource-deposit-markers" data={markerData}>
        <Layer
          id="resource-deposit-halo"
          type="circle"
          paint={{
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              10, 3,
              14, 7,
              18, 15,
            ],
            'circle-color': [
              'case',
              ['>=', ['get', 'rarity'], 5], '#b96cff',
              ['>=', ['get', 'rarity'], 3], '#f4bd42',
              '#38d8ff',
            ],
            'circle-opacity': 0.2,
            'circle-blur': 0.4,
          } as never}
        />
        <Layer
          id="resource-deposit-core"
          type="circle"
          paint={{
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 3.5, 18, 7],
            'circle-color': [
              'case',
              ['>=', ['get', 'rarity'], 5], '#b96cff',
              ['>=', ['get', 'rarity'], 3], '#f4bd42',
              '#38d8ff',
            ],
            'circle-opacity': [
              'interpolate', ['linear'], ['get', 'confidence'],
              0, 0.65,
              1, 1,
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
          } as never}
        />
        <Layer
          id="resource-deposit-center"
          type="circle"
          paint={{ 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 18, 2.2], 'circle-color': '#ffffff', 'circle-opacity': 0.95 } as never}
        />
      </GeoJSONSource>
    </>
  );
}
