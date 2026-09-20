import { useEffect, useMemo, useState } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { cellToBoundary } from 'h3-js';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import type { GeologyScanResponse } from './types';

const EARTH_RADIUS_METERS = 6_371_000;
const HOTSPOT_TRIGGER_METERS = 70;
const HOTSPOT_MIN_INTENSITY = 0.62;
export const BUILD_RADIUS_METERS = 75;

type LatLng = { lat: number; lng: number };

type HeatCell = {
  intensity: number;
  distanceMeters: number;
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

function circleGeoJson(
  id: string,
  center: LatLng | null,
  radiusMeters: number,
): FeatureCollection<Polygon> {
  if (!center || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    return { type: 'FeatureCollection', features: [] };
  }

  const points: [number, number][] = [];
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
  const latRad = center.lat * Math.PI / 180;
  const lngRad = center.lng * Math.PI / 180;

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
      id,
      properties: {},
      geometry: { type: 'Polygon', coordinates: [points] },
    }],
  };
}

export function GeologyHeatmapLayer({
  scan,
  resourceCode,
  visible,
}: {
  scan: GeologyScanResponse | null;
  resourceCode: string | null;
  visible: boolean;
}) {
  const [livePlayerPosition, setLivePlayerPosition] = useState<LatLng | null>(null);

  useEffect(() => {
    if (scan?.playerPosition) setLivePlayerPosition(scan.playerPosition);
  }, [scan?.scanId, scan?.playerPosition]);

  // The construction radius follows the actual device position even after the
  // player has moved away from the point where reconnaissance was started.
  useEffect(() => {
    if (!visible) return undefined;

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    const start = async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (cancelled || permission.status !== 'granted') return;

        const recent = await Location.getLastKnownPositionAsync({ maxAge: 15_000 });
        if (recent && !cancelled) {
          setLivePlayerPosition({
            lat: recent.coords.latitude,
            lng: recent.coords.longitude,
          });
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 2_000,
            distanceInterval: 5,
          },
          (location) => {
            if (!cancelled) {
              setLivePlayerPosition({
                lat: location.coords.latitude,
                lng: location.coords.longitude,
              });
            }
          },
        );
      } catch {
        // Main map already owns location UX. Keep the last known scan position
        // rather than showing a second permission/error prompt here.
      }
    };

    void start();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [visible]);

  const activeResource = resourceCode ?? scan?.resourceProspects?.[0]?.code ?? null;

  const cellsByH3 = useMemo(() => {
    const result = new Map<string, HeatCell>();
    if (!visible || !scan || !activeResource) return result;

    for (const cell of scan.heatmap.cells) {
      const value = cell.values.find((item) => item.resourceCode === activeResource);
      if (!value) continue;
      result.set(cell.h3Index, {
        intensity: Math.max(0, Math.min(1, Number(value.intensity ?? 0))),
        distanceMeters: Number(cell.distanceMeters ?? 0),
      });
    }

    return result;
  }, [activeResource, scan, visible]);

  const thermalData = useMemo<FeatureCollection<Point>>(() => ({
    type: 'FeatureCollection',
    features: !scan ? [] : scan.heatmap.cells.flatMap((cell) => {
      const sample = cellsByH3.get(cell.h3Index);
      if (!sample) return [];
      return [{
        type: 'Feature' as const,
        id: `thermal-${cell.h3Index}`,
        properties: {
          intensity: sample.intensity,
          distanceMeters: sample.distanceMeters,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [cell.lng, cell.lat],
        },
      }];
    }),
  }), [cellsByH3, scan]);

  const exactHexData = useMemo<FeatureCollection<Polygon>>(() => ({
    type: 'FeatureCollection',
    features: [...cellsByH3.entries()].flatMap(([h3Index, sample]) => {
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
  }), [cellsByH3]);

  const hotspotSignalData = useMemo<FeatureCollection<Point>>(() => {
    if (!scan || !activeResource || !livePlayerPosition) {
      return { type: 'FeatureCollection', features: [] };
    }

    let best: { intensity: number; distance: number } | null = null;

    for (const cell of scan.heatmap.cells) {
      const value = cell.values.find((item) => item.resourceCode === activeResource);
      const intensity = Math.max(0, Math.min(1, Number(value?.intensity ?? 0)));
      if (intensity < HOTSPOT_MIN_INTENSITY) continue;

      const distance = distanceMeters(livePlayerPosition, { lat: cell.lat, lng: cell.lng });
      if (distance > HOTSPOT_TRIGGER_METERS) continue;

      if (!best || intensity > best.intensity || (intensity === best.intensity && distance < best.distance)) {
        best = { intensity, distance };
      }
    }

    if (!best) return { type: 'FeatureCollection', features: [] };

    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: 'strong-geology-signal',
        properties: {
          intensity: best.intensity,
          label: `СИЛЬНЫЙ ГЕОЛОГИЧЕСКИЙ СИГНАЛ\nПРОВЕДИТЕ РАЗВЕДКУ`,
        },
        geometry: {
          type: 'Point',
          coordinates: [livePlayerPosition.lng, livePlayerPosition.lat],
        },
      }],
    };
  }, [activeResource, livePlayerPosition, scan]);

  const scanRadiusData = useMemo(
    () => circleGeoJson(
      'geology-scan-radius',
      scan?.heatmap.center ?? null,
      scan?.heatmap.radiusMeters ?? 0,
    ),
    [scan],
  );

  const constructionRadiusData = useMemo(
    () => circleGeoJson('construction-radius', livePlayerPosition, BUILD_RADIUS_METERS),
    [livePlayerPosition],
  );

  const scanCenterData = useMemo<FeatureCollection<Point>>(() => ({
    type: 'FeatureCollection',
    features: scan ? [{
      type: 'Feature',
      id: 'scan-center',
      properties: {},
      geometry: {
        type: 'Point',
        coordinates: [scan.heatmap.center.lng, scan.heatmap.center.lat],
      },
    }] : [],
  }), [scan]);

  if (!visible) return null;

  return (
    <>
      {/* The small build zone is separate from reconnaissance and follows GPS. */}
      <GeoJSONSource id="construction-radius-source" data={constructionRadiusData}>
        <Layer
          id="construction-radius-fill"
          type="fill"
          paint={{ 'fill-color': '#46e38b', 'fill-opacity': 0.045 } as never}
        />
        <Layer
          id="construction-radius-outline"
          type="line"
          paint={{ 'line-color': '#62f39c', 'line-width': 2.2, 'line-opacity': 0.9 } as never}
        />
      </GeoJSONSource>

      {scan ? (
        <>
          {/* Reconnaissance reveal boundary. Nothing geological is rendered outside it. */}
          <GeoJSONSource id="geology-scan-radius-source" data={scanRadiusData}>
            <Layer
              id="geology-scan-radius-fill"
              type="fill"
              paint={{ 'fill-color': '#3bdfff', 'fill-opacity': 0.025 } as never}
            />
            <Layer
              id="geology-scan-radius-outline"
              type="line"
              paint={{ 'line-color': '#57e8ff', 'line-width': 2.6, 'line-opacity': 0.9 } as never}
            />
          </GeoJSONSource>

          {cellsByH3.size > 0 ? (
            <>
              <GeoJSONSource id="shared-geology-thermal-points" data={thermalData}>
                <Layer
                  id="shared-geology-thermal-glow"
                  type="heatmap"
                  paint={{
                    'heatmap-weight': ['get', 'intensity'],
                    'heatmap-intensity': [
                      'interpolate', ['linear'], ['zoom'],
                      10, 0.95,
                      14, 1.45,
                      18, 2.2,
                    ],
                    'heatmap-radius': [
                      'interpolate', ['linear'], ['zoom'],
                      10, 15,
                      12, 22,
                      14, 32,
                      16, 46,
                      18, 66,
                      20, 84,
                    ],
                    'heatmap-opacity': 0.9,
                    'heatmap-color': [
                      'interpolate', ['linear'], ['heatmap-density'],
                      0, 'rgba(0,0,0,0)',
                      0.08, 'rgba(20,104,255,0.12)',
                      0.2, 'rgba(31,205,255,0.42)',
                      0.38, 'rgba(52,213,143,0.58)',
                      0.56, 'rgba(244,222,65,0.74)',
                      0.74, 'rgba(248,137,43,0.86)',
                      0.9, 'rgba(238,55,45,0.95)',
                      1, 'rgba(255,244,174,1)',
                    ],
                  } as never}
                />
              </GeoJSONSource>

              <GeoJSONSource id="shared-geology-hexes" data={exactHexData}>
                <Layer
                  id="shared-geology-hex-fill"
                  type="fill"
                  paint={{
                    'fill-color': [
                      'interpolate', ['linear'], ['get', 'intensity'],
                      0, '#166ee8',
                      0.2, '#20c9ee',
                      0.4, '#37cf91',
                      0.6, '#e2d848',
                      0.8, '#ef7e31',
                      1, '#ed4035',
                    ],
                    'fill-opacity': [
                      'interpolate', ['linear'], ['get', 'intensity'],
                      0, 0.08,
                      0.35, 0.18,
                      0.7, 0.34,
                      1, 0.52,
                    ],
                  } as never}
                />
                <Layer
                  id="shared-geology-hex-outline"
                  type="line"
                  paint={{
                    'line-color': [
                      'interpolate', ['linear'], ['get', 'intensity'],
                      0, '#57b6ff',
                      0.5, '#ffe36c',
                      1, '#fff1b0',
                    ],
                    'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.35, 14, 0.8, 18, 1.7],
                    'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.12, 14, 0.32, 17, 0.62],
                  } as never}
                />
              </GeoJSONSource>
            </>
          ) : null}

          <GeoJSONSource id="geology-hotspot-signal-source" data={hotspotSignalData}>
            <Layer
              id="geology-hotspot-signal-halo"
              type="circle"
              paint={{
                'circle-radius': 16,
                'circle-color': '#ffb12e',
                'circle-opacity': 0.2,
                'circle-blur': 0.35,
              } as never}
            />
            <Layer
              id="geology-hotspot-signal-core"
              type="circle"
              paint={{
                'circle-radius': 6,
                'circle-color': '#ffcf4d',
                'circle-stroke-color': '#fff3bf',
                'circle-stroke-width': 2,
              } as never}
            />
            <Layer
              id="geology-hotspot-signal-label"
              type="symbol"
              layout={{
                'text-field': ['get', 'label'],
                'text-size': 12,
                'text-anchor': 'bottom',
                'text-offset': [0, -1.8],
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              } as never}
              paint={{
                'text-color': '#fff2c7',
                'text-halo-color': '#091018',
                'text-halo-width': 2,
                'text-halo-blur': 0.5,
              } as never}
            />
          </GeoJSONSource>

          <GeoJSONSource id="geology-scan-center-source" data={scanCenterData}>
            <Layer
              id="geology-scan-center-halo"
              type="circle"
              paint={{ 'circle-radius': 10, 'circle-color': '#45e5ff', 'circle-opacity': 0.14 } as never}
            />
            <Layer
              id="geology-scan-center-core"
              type="circle"
              paint={{
                'circle-radius': 3.5,
                'circle-color': '#d9fbff',
                'circle-stroke-color': '#45e5ff',
                'circle-stroke-width': 2,
              } as never}
            />
          </GeoJSONSource>
        </>
      ) : null}
    </>
  );
}
