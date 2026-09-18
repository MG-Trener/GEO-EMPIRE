import { useMemo } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { cellToBoundary } from 'h3-js';
import type { FeatureCollection, Polygon } from 'geojson';
import type { GeologyScanResponse } from './types';

export function GeologyHeatmapLayer({
  scan,
  resourceCode,
  visible,
}: {
  scan: GeologyScanResponse | null;
  resourceCode: string | null;
  visible: boolean;
}) {
  const data = useMemo<FeatureCollection<Polygon>>(() => {
    if (!visible || !scan || !resourceCode) return { type: 'FeatureCollection', features: [] };

    const byCell = new Map<string, number>();
    for (const deposit of scan.deposits) {
      if (deposit.resource.code !== resourceCode || !deposit.h3Index) continue;
      const density = Math.max(0, Math.min(1, Number(deposit.estimates.density?.value ?? 0)));
      byCell.set(deposit.h3Index, Math.max(density, byCell.get(deposit.h3Index) ?? 0));
    }

    return {
      type: 'FeatureCollection',
      features: [...byCell.entries()].flatMap(([h3Index, density]) => {
        const boundary = cellToBoundary(h3Index, true) as [number, number][];
        if (!boundary.length) return [];
        return [{
          type: 'Feature' as const,
          id: `heat-${h3Index}`,
          properties: { density },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[...boundary, boundary[0]]],
          },
        }];
      }),
    };
  }, [resourceCode, scan, visible]);

  return (
    <GeoJSONSource id="resource-density-heatmap" data={data}>
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
          'fill-opacity': 0.7,
        } as never}
      />
      <Layer
        id="resource-density-outline"
        type="line"
        paint={{
          'line-color': '#eef9fb',
          'line-width': 1.5,
          'line-opacity': 0.55,
        } as never}
      />
    </GeoJSONSource>
  );
}
