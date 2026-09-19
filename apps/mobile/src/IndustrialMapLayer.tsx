import { useEffect, useMemo, useState } from 'react';
import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native';
import type { FeatureCollection, Point } from 'geojson';
import {
  gameAssets,
  resourceIconKeyForCode,
  resourceMapScaleForCode,
  type ResourceIconKey,
} from './gameAssets';
import type { WorldCell } from './types';

type IndustrialIconKey =
  | 'industry-mine'
  | 'industry-pumpjack'
  | 'industry-construction'
  | 'industry-facility'
  | ResourceIconKey;

function constructionStatus(status?: string | null): boolean {
  const normalized = String(status ?? '').toUpperCase();
  return normalized.includes('CONSTRUCT')
    || normalized.includes('BUILD')
    || normalized.includes('PLANNED')
    || normalized.includes('СТРО');
}

function isUnderConstruction(cell: WorldCell, now: number): boolean {
  if (!cell.building || !constructionStatus(cell.building.status)) return false;
  const completedAt = cell.building.completedAt ? new Date(cell.building.completedAt).getTime() : Number.POSITIVE_INFINITY;
  return completedAt > now;
}

function buildingResourceCode(cell: WorldCell): string | null {
  if (!cell.building) return null;
  return (cell.building as { resourceCode?: string | null }).resourceCode ?? null;
}

function iconKeyForBuilding(
  code?: string | null,
  resourceCode?: string | null,
  underConstruction = false,
): IndustrialIconKey {
  if (underConstruction) return 'industry-construction';
  if (resourceCode) return resourceIconKeyForCode(resourceCode);

  const normalized = String(code ?? '').toUpperCase();
  if (normalized.includes('MINE') || normalized.includes('PIT')) return 'industry-mine';
  if (normalized.includes('OIL') || normalized.includes('GAS') || normalized.includes('WELL')) {
    return 'industry-pumpjack';
  }
  return 'industry-facility';
}

function iconScaleForBuilding(
  code?: string | null,
  resourceCode?: string | null,
  underConstruction = false,
): number {
  if (underConstruction) return 0.3;
  if (resourceCode) return resourceMapScaleForCode(resourceCode);

  const normalized = String(code ?? '').toUpperCase();
  if (normalized.includes('MINE') || normalized.includes('PIT')) return 0.038;
  if (normalized.includes('OIL') || normalized.includes('GAS') || normalized.includes('WELL')) return 0.045;
  return 0.3;
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function industrialData(
  cells: WorldCell[],
  playerId: string,
  selectedH3: string | undefined,
  now: number,
  showOwned: boolean,
  showRivals: boolean,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: cells.flatMap((cell) => {
      if (!cell.building) return [];

      const owned = cell.claim?.ownerId === playerId;
      if ((owned && !showOwned) || (!owned && !showRivals)) return [];

      const underConstruction = isUnderConstruction(cell, now);
      const completesAt = cell.building.completedAt ? new Date(cell.building.completedAt).getTime() : null;
      const remainingSeconds = underConstruction && completesAt
        ? Math.max(0, (completesAt - now) / 1000)
        : 0;
      const level = Math.max(1, cell.building.level ?? 1);
      const resourceCode = buildingResourceCode(cell);

      return [{
        type: 'Feature' as const,
        id: `industry-${cell.h3Index}`,
        properties: {
          h3Index: cell.h3Index,
          ownerKind: owned ? 'mine' : 'rival',
          selected: cell.h3Index === selectedH3 ? 1 : 0,
          iconKey: iconKeyForBuilding(cell.building.code, resourceCode, underConstruction),
          iconScale: iconScaleForBuilding(cell.building.code, resourceCode, underConstruction),
          resourceCode: resourceCode ?? '',
          level,
          underConstruction: underConstruction ? 1 : 0,
          label: underConstruction ? `СТРОИТСЯ ${formatCountdown(remainingSeconds)}` : `LV ${level}`,
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
  visible = true,
  showOwned = true,
  showRivals = true,
}: {
  cells: WorldCell[];
  playerId: string;
  selectedH3?: string;
  onSelect?: (h3Index: string) => void;
  visible?: boolean;
  showOwned?: boolean;
  showRivals?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const hasConstruction = cells.some((cell) => isUnderConstruction(cell, now));

  useEffect(() => {
    if (!hasConstruction) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasConstruction]);

  const data = useMemo(
    () => visible
      ? industrialData(cells, playerId, selectedH3, now, showOwned, showRivals)
      : ({ type: 'FeatureCollection', features: [] } as FeatureCollection<Point>),
    [cells, now, playerId, selectedH3, showOwned, showRivals, visible],
  );

  if (!visible) return null;

  return (
    <>
      <Images
        images={{
          'industry-mine': gameAssets.industry.mineTruck,
          'industry-pumpjack': gameAssets.industry.oilPumpjack,
          'industry-construction': gameAssets.industry.construction,
          'industry-facility': gameAssets.industry.facility,
          'resource-oil': gameAssets.resources.oil,
          'resource-gas': gameAssets.resources.gas,
          'resource-gold': gameAssets.resources.gold,
          'resource-copper': gameAssets.resources.copper,
          'resource-iron': gameAssets.resources.iron,
          'resource-coal': gameAssets.resources.coal,
          'resource-silver': gameAssets.resources.silver,
          'resource-limestone': gameAssets.resources.limestone,
          'resource-sand': gameAssets.resources.sand,
          'resource-clay': gameAssets.resources.clay,
          'resource-timber': gameAssets.resources.timber,
          'resource-wheat': gameAssets.resources.wheat,
          'resource-uranium': gameAssets.resources.uranium,
          'resource-lithium': gameAssets.resources.lithium,
          'resource-rare-earths': gameAssets.resources.rareEarths,
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
              ['==', ['get', 'selected'], 1],
              ['interpolate', ['linear'], ['zoom'], 10, 6, 12, 8, 14, 12, 16, 17, 18, 22, 20, 28],
              ['interpolate', ['linear'], ['zoom'], 10, 5, 12, 7, 14, 10, 16, 14, 18, 18, 20, 23],
            ],
            'circle-color': [
              'case',
              ['==', ['get', 'underConstruction'], 1], '#f4bd42',
              ['==', ['get', 'ownerKind'], 'mine'], '#35df9e',
              '#f05f65',
            ],
            'circle-opacity': [
              'interpolate', ['linear'], ['zoom'],
              10, 0.08,
              14, 0.13,
              18, ['case', ['==', ['get', 'selected'], 1], 0.28, 0.17],
            ],
            'circle-blur': 0.35,
            'circle-stroke-color': [
              'case',
              ['==', ['get', 'selected'], 1], '#fff0a6',
              ['==', ['get', 'ownerKind'], 'mine'], '#35df9e',
              '#f05f65',
            ],
            'circle-stroke-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 0.5,
              14, 1,
              18, ['case', ['==', ['get', 'selected'], 1], 2.5, 1.2],
            ],
            'circle-stroke-opacity': 0.72,
          } as never}
        />

        <Layer
          id="industrial-object-artwork"
          type="symbol"
          layout={{
            'icon-image': ['get', 'iconKey'],
            'icon-size': [
              'interpolate', ['linear'], ['zoom'],
              10, ['*', ['get', 'iconScale'], 0.3],
              12, ['*', ['get', 'iconScale'], 0.42],
              14, ['*', ['get', 'iconScale'], 0.58],
              16, ['*', ['get', 'iconScale'], 0.76],
              18, ['get', 'iconScale'],
              20, ['*', ['get', 'iconScale'], 1.35],
            ],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          } as never}
          paint={{
            'icon-opacity': [
              'case',
              ['==', ['get', 'ownerKind'], 'rival'], 0.78,
              1,
            ],
          } as never}
        />

        <Layer
          id="industrial-object-label"
          type="symbol"
          layout={{
            'text-field': ['get', 'label'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 12, 6, 14, 7.5, 16, 9, 18, 10.5],
            'text-font': ['Noto Sans Bold'],
            'text-anchor': 'top',
            'text-offset': [0, 0.35],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          } as never}
          paint={{
            'text-color': [
              'case',
              ['==', ['get', 'underConstruction'], 1], '#ffd66b',
              '#f5fbfd',
            ],
            'text-halo-color': '#061018',
            'text-halo-width': 1.8,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 13.5, 0.35, 15, 0.88, 16.5, 1],
          } as never}
        />
      </GeoJSONSource>
    </>
  );
}
