import { useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { FeatureCollection, Polygon } from 'geojson';

export const BUILD_RADIUS_METERS = 75;
const EARTH_RADIUS_METERS = 6_371_000;

type LatLng = { lat: number; lng: number };

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

export function BuildRadiusLayer() {
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

  const data = useMemo(
    () => position ? buildCircle(position, BUILD_RADIUS_METERS) : null,
    [position],
  );

  if (!data) return null;

  return (
    <GeoJSONSource id="physical-build-radius" data={data}>
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
  );
}
