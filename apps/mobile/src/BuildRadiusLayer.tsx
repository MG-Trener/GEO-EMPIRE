import { useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { cellToLatLng } from 'h3-js';
import type { FeatureCollection, LineString, Point, Polygon } from 'geojson';
import type { NavigationTarget } from './navigationTarget';

export const BUILD_RADIUS_METERS = 75;
const EARTH_RADIUS_METERS = 6_371_000;

type LatLng = { lat: number; lng: number };

type Props = {
  selectedH3?: string;
  navigationTarget?: NavigationTarget | null;
  onTargetPress?: (h3Index: string) => void;
};

function distanceMeters(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * Math.PI / 180;
  const deltaLng = (b.lng - a.lng) * Math.PI / 180;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function buildCircle(position: LatLng, radiusMeters: number): FeatureCollection<Polygon> {
  const points: [number, number][] = [];
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
  const latRad = position.lat * Math.PI / 180;
  const lngRad = position.lng * Math.PI / 180;

  for (let step = 0; step <= 72; step += 1) {
    const bearing = (step / 72) * Math.PI * 2;
    const targetLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance)
      + Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const targetLng = lngRad + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(targetLat),
    );
    points.push([targetLng * 180 / Math.PI, targetLat * 180 / Math.PI]);
  }

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: 'physical-build-radius',
      properties: { radiusMeters },
      geometry: { type: 'Polygon', coordinates: [points] },
    }],
  };
}

function selectedTarget(h3Index: string | undefined, position: LatLng | null) {
  if (!h3Index || !position) return null;
  try {
    const [lat, lng] = cellToLatLng(h3Index);
    const target = { lat, lng };
    const distance = distanceMeters(position, target);
    return {
      target,
      distance,
      inRange: distance <= BUILD_RADIUS_METERS,
    };
  } catch {
    return null;
  }
}

export function BuildRadiusLayer({ selectedH3, navigationTarget, onTargetPress }: Props) {
  const [position, setPosition] = useState<LatLng | null>(null);

  useEffect(() => {
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    const start = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (cancelled || permission.status !== 'granted') return;

      const recent = await Location.getLastKnownPositionAsync({ maxAge: 30_000 }).catch(() => null);
      if (recent && !cancelled) {
        setPosition({ lat: recent.coords.latitude, lng: recent.coords.longitude });
      }

      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 1_500,
            distanceInterval: 3,
            mayShowUserSettingsDialog: true,
          },
          (location) => {
            if (!cancelled) {
              setPosition({ lat: location.coords.latitude, lng: location.coords.longitude });
            }
          },
        );
      } catch {
        // The main map already reports GPS problems. This overlay simply stays
        // hidden until a valid live position becomes available.
      }
    };

    void start();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  const radiusData = useMemo(
    () => position ? buildCircle(position, BUILD_RADIUS_METERS) : null,
    [position],
  );

  const activeH3 = navigationTarget?.h3Index ?? selectedH3;
  const target = useMemo(
    () => selectedTarget(activeH3, position),
    [activeH3, position],
  );

  const guideData = useMemo<FeatureCollection<LineString> | null>(() => {
    if (!position || !target) return null;
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: 'physical-build-guide',
        properties: {
          inRange: target.inRange ? 1 : 0,
          navigation: navigationTarget ? 1 : 0,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [position.lng, position.lat],
            [target.target.lng, target.target.lat],
          ],
        },
      }],
    };
  }, [navigationTarget, position, target]);

  const targetData = useMemo<FeatureCollection<Point> | null>(() => {
    if (!target) return null;
    const roundedDistance = Math.max(0, Math.round(target.distance));
    const label = navigationTarget
      ? target.inRange
        ? `ЦЕЛЬ ДОСТИГНУТА · ${navigationTarget.resourceName} · ${roundedDistance} м`
        : `ЦЕЛЬ: ${navigationTarget.resourceName} · ${roundedDistance} м`
      : target.inRange
        ? `МОЖНО СТРОИТЬ · ${roundedDistance} м`
        : `ПОДОЙДИТЕ БЛИЖЕ · ${roundedDistance} м`;

    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: 'physical-build-target',
        properties: {
          h3Index: activeH3 ?? '',
          inRange: target.inRange ? 1 : 0,
          navigation: navigationTarget ? 1 : 0,
          distanceMeters: roundedDistance,
          label,
        },
        geometry: {
          type: 'Point',
          coordinates: [target.target.lng, target.target.lat],
        },
      }],
    };
  }, [activeH3, navigationTarget, target]);

  if (!radiusData) return null;

  return (
    <>
      <GeoJSONSource id="physical-build-radius" data={radiusData}>
        <Layer
          id="physical-build-radius-fill"
          type="fill"
          paint={{
            'fill-color': '#47e39d',
            'fill-opacity': 0.045,
          } as never}
        />
        <Layer
          id="physical-build-radius-outline"
          type="line"
          paint={{
            'line-color': '#62f0ad',
            'line-width': 1.8,
            'line-opacity': 0.88,
            'line-dasharray': [3, 2],
          } as never}
        />
      </GeoJSONSource>

      {guideData ? (
        <GeoJSONSource id="physical-build-guide" data={guideData}>
          <Layer
            id="physical-build-guide-line"
            type="line"
            paint={{
              'line-color': [
                'case',
                ['==', ['get', 'inRange'], 1], '#62f0ad',
                ['==', ['get', 'navigation'], 1], '#ffd15c',
                '#f4bd42',
              ],
              'line-width': [
                'case',
                ['==', ['get', 'navigation'], 1], 2.8,
                1.5,
              ],
              'line-opacity': 0.82,
              'line-dasharray': [2, 2],
            } as never}
          />
        </GeoJSONSource>
      ) : null}

      {targetData ? (
        <GeoJSONSource
          id="physical-build-target"
          data={targetData}
          onPress={(event) => {
            if (!navigationTarget) return;
            const h3Index = String(event.nativeEvent.features?.[0]?.properties?.h3Index ?? navigationTarget.h3Index);
            if (h3Index) onTargetPress?.(h3Index);
          }}
        >
          <Layer
            id="physical-build-target-halo"
            type="circle"
            paint={{
              'circle-radius': [
                'case',
                ['==', ['get', 'navigation'], 1], 12,
                9,
              ],
              'circle-color': [
                'case',
                ['==', ['get', 'inRange'], 1], '#62f0ad',
                '#f4bd42',
              ],
              'circle-opacity': 0.18,
              'circle-blur': 0.2,
            } as never}
          />
          <Layer
            id="physical-build-target-dot"
            type="circle"
            paint={{
              'circle-radius': [
                'case',
                ['==', ['get', 'navigation'], 1], 7.5,
                6,
              ],
              'circle-color': [
                'case',
                ['==', ['get', 'inRange'], 1], '#62f0ad',
                '#f4bd42',
              ],
              'circle-stroke-color': '#071018',
              'circle-stroke-width': 2,
            } as never}
          />
          <Layer
            id="physical-build-target-label"
            type="symbol"
            layout={{
              'text-field': ['get', 'label'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 13, 7, 16, 9, 19, 11],
              'text-font': ['Noto Sans Bold'],
              'text-anchor': 'bottom',
              'text-offset': [0, -1.15],
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            } as never}
            paint={{
              'text-color': [
                'case',
                ['==', ['get', 'inRange'], 1], '#9affc8',
                '#ffd46a',
              ],
              'text-halo-color': '#071018',
              'text-halo-width': 2,
            } as never}
          />
        </GeoJSONSource>
      ) : null}
    </>
  );
}
