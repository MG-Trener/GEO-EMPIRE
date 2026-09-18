import { useMemo } from 'react';
import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native';
import type { FeatureCollection, Point } from 'geojson';
import { gameAssets } from './gameAssets';
import type { WorldCell } from './types';

type IndustrialIconKey =
  | 'industry-mine'
  | 'industry-pumpjack'
  | 'industry-construction'
  | 'industry-facility';

function isConstruction(status?: string | null): boolean {
  const normalized = String(status ?? '').toUpperCase();
  return normalized.includes('CONSTRUCT')
    || normalized.includes('BUILD')
    || normalized.includes('PLANNED')
    || normalized.includes('СТРО');
}

function iconKeyForBuilding(code?: string | null, status?: string | null): IndustrialIconKey {
  if (isConstruction(status)) return 'industry-construction';

  const normalized = String(code ?? '').toUpperCase();
  if (normalized.includes('MINE') || normalized.includes('PIT')) return 'industry-mine';
  if (normalized.includes('OIL') || normalized.includes('GAS') || normalized.includes('WELL')) {
    return 'industry-pumpjack';
  }
  return 'industry-facility';
}

function industrialData(
  cells: WorldCell[],
  playerId: string,
  selectedH3?: string,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: cells.flatMap((cell) => {
      if (!cell.building) return [];

      const owned = cell.claim?.ownerId === playerId;
      const underConstruction = isConstruction(cell.building.status);
      return [{
        type: 'Feature' as const,
        id: `industry-${cell.h3Index}`,
        properties: {
          h3Index: cell.h3Index,
          ownerKind: owned ? 'mine' : 'rival',
          selected: cell.h3Index === selectedH3 ? 1 : 0,
          iconKey: iconKeyForBuilding(cell.building.code, cell.building.status),
          level: Math.max(1, cell.building.level ?? 1),
          underConstruction: underConstruction ? 1 : 0,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [cell.center.lng, cell.center.lat],
        },
      }];
    }),
  };
}

export function IndustrialMapLayer({
  cells,
  playerId,
  selectedH3,
  onSelect,
}: {
  cells: WorldCell[];
  playerId: string;
  selectedH3?: string;
  onSelect?: (h3Index: string) => void;
}) {
  const data = useMemo(
    () => industrialData(cells, playerId, selectedH3),
    [cells, playerId, selectedH3],
  );

  return (
    <>
      <Images
        images={{
          'industry-mine': gameAssets.industry.mineTruck,
          'industry-pumpjack': gameAssets.industry.oilPumpjack,
          'industry-construction': gameAssets.industry.construction,
          'industry-facility': gameAssets.industry.facility,
        }}
      />

      <GeoJSONSource
        id="industrial-map-objects"
        data={data}
        onPress={(event) => {
          const h3Index = String(event.nativeEvent.features?.[0]?.properties?.h3Index ?? '');
          if (h3Index) onSelect?.(h3Index);
        }}
      >
        <Layer
          id="industrial-owner-halo"
          type="circle"
          paint={{
            'circle-radius': [
              'case',
              ['==', ['get', 'selected'], 1], 30,
              24,
            ],
            'circle-color': [
              'case',
              ['==', ['get', 'underConstruction'], 1], '#f4bd42',
              ['==', ['get', 'ownerKind'], 'mine'], '#35df9e',
              '#f05f65',
            ],
            'circle-opacity': [
              'case',
              ['==', ['get', 'selected'], 1], 0.26,
              0.15,
            ],
            'circle-blur': 0.35,
            'circle-stroke-color': [
              'case',
              ['==', ['get', 'selected'], 1], '#fff0a6',
              ['==', ['get', 'ownerKind'], 'mine'], '#35df9e',
              '#f05f65',
            ],
            'circle-stroke-width': [
              'case',
              ['==', ['get', 'selected'], 1], 2.5,
              1.2,
            ],
            'circle-stroke-opacity': 0.7,
          } as never}
        />

        <Layer
          id="industrial-object-artwork"
          type="symbol"
          layout={{
            'icon-image': ['get', 'iconKey'],
            'icon-size': [
              'match', ['get', 'iconKey'],
              'industry-mine', ['case', ['==', ['get', 'selected'], 1], 0.095, 0.078],
              'industry-pumpjack', ['case', ['==', ['get', 'selected'], 1], 0.095, 0.078],
              'industry-construction', ['case', ['==', ['get', 'selected'], 1], 0.72, 0.58],
              ['case', ['==', ['get', 'selected'], 1], 0.72, 0.58],
            ],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          } as never}
          paint={{
            'icon-opacity': [
              'case',
              ['==', ['get', 'ownerKind'], 'rival'], 0.82,
              1,
            ],
          } as never}
        />

        <Layer
          id="industrial-object-label"
          type="symbol"
          layout={{
            'text-field': [
              'case',
              ['==', ['get', 'underConstruction'], 1], 'СТРОИТСЯ',
              ['concat', 'LV ', ['to-string', ['get', 'level']]],
            ],
            'text-size': 9,
            'text-font': ['Noto Sans Bold'],
            'text-anchor': 'top',
            'text-offset': [0, 0.4],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          } as never}
          paint={{
            'text-color': '#f5fbfd',
            'text-halo-color': '#061018',
            'text-halo-width': 1.8,
            'text-opacity': 0.95,
          } as never}
        />
      </GeoJSONSource>
    </>
  );
}
