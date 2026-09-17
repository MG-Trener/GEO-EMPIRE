import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { cellToBoundary } from 'h3-js';
import type { FeatureCollection, Polygon } from 'geojson';
import { DEMO_PLAYER_ID, getApiUrl, locateWorld, previewGeology } from './src/api';
import type { GeologyPreviewResponse, LocateResponse, WorldCell } from './src/types';

const ASTANA_DEMO = { lat: 51.1694, lng: 71.4491 };
const MAP_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

function cellsToGeoJson(cells: WorldCell[]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: cells.map((cell) => {
      const boundary = cellToBoundary(cell.h3Index, true) as [number, number][];
      const ring = boundary.length ? [...boundary, boundary[0]] : boundary;

      return {
        type: 'Feature',
        id: cell.h3Index,
        properties: {
          h3Index: cell.h3Index,
          occupied: cell.occupied ? 1 : 0,
          current: cell.distance === 0 ? 1 : 0,
        },
        geometry: { type: 'Polygon', coordinates: [ring] },
      };
    }),
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

export default function App() {
  const [position, setPosition] = useState(ASTANA_DEMO);
  const [usingDemoPosition, setUsingDemoPosition] = useState(true);
  const [world, setWorld] = useState<LocateResponse | null>(null);
  const [selectedCell, setSelectedCell] = useState<WorldCell | null>(null);
  const [scan, setScan] = useState<GeologyPreviewResponse | null>(null);
  const [loadingWorld, setLoadingWorld] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState('Подготовка карты…');

  const refreshWorld = useCallback(async (next: { lat: number; lng: number }) => {
    setLoadingWorld(true);
    try {
      const response = await locateWorld(next.lat, next.lng, 2);
      setWorld(response);
      setSelectedCell(response.currentCell);
      setScan(null);
      setMessage(`H3 r12 · ${response.cells.length} ячеек загружено`);
    } catch (error) {
      setMessage(`API недоступен: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoadingWorld(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status === 'granted') {
        try {
          const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!cancelled) {
            const next = { lat: current.coords.latitude, lng: current.coords.longitude };
            setPosition(next);
            setUsingDemoPosition(false);
            await refreshWorld(next);
            return;
          }
        } catch {
          // Use the deterministic development sector below.
        }
      }

      if (!cancelled) {
        setUsingDemoPosition(true);
        await refreshWorld(ASTANA_DEMO);
        setMessage('Геолокация недоступна · используется тестовый сектор Астаны');
      }
    };

    void start();
    return () => { cancelled = true; };
  }, [refreshWorld]);

  const cellsGeoJson = useMemo(() => cellsToGeoJson(world?.cells ?? []), [world]);
  const playerGeoJson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: [position.lng, position.lat] },
    }],
  }), [position]);

  const runScan = useCallback(async () => {
    const target = selectedCell?.center ?? position;
    setScanning(true);
    setScan(null);
    try {
      const result = await previewGeology({
        playerId: DEMO_PLAYER_ID,
        playerLat: position.lat,
        playerLng: position.lng,
        targetLat: target.lat,
        targetLng: target.lng,
      });
      setScan(result);
      setMessage(result.deposits.length ? `Обнаружено залежей: ${result.deposits.length}` : 'Доступных залежей не обнаружено');
    } catch (error) {
      setMessage(`Разведка: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setScanning(false);
    }
  }, [position, selectedCell]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Map style={styles.map} mapStyle={MAP_STYLE_URL}>
        <Camera center={[position.lng, position.lat]} zoom={16.8} />

        <GeoJSONSource
          id="geo-empire-cells"
          data={cellsGeoJson}
          onPress={(event) => {
            const h3Index = String(event.nativeEvent.features?.[0]?.properties?.h3Index ?? '');
            const cell = world?.cells.find((item) => item.h3Index === h3Index) ?? null;
            if (cell) {
              setSelectedCell(cell);
              setScan(null);
            }
          }}
        >
          <Layer
            id="cell-fill"
            type="fill"
            paint={{
              'fill-color': ['case', ['==', ['get', 'current'], 1], '#f5a524', ['==', ['get', 'occupied'], 1], '#b83a3a', '#1c7b6e'],
              'fill-opacity': 0.28,
            } as never}
          />
          <Layer
            id="cell-outline"
            type="line"
            paint={{ 'line-color': '#f2d18b', 'line-width': 1.35, 'line-opacity': 0.78 } as never}
          />
        </GeoJSONSource>

        <GeoJSONSource id="player-position" data={playerGeoJson}>
          <Layer id="player-halo" type="circle" paint={{ 'circle-radius': 13, 'circle-color': '#0a0f16', 'circle-opacity': 0.34 } as never} />
          <Layer id="player-dot" type="circle" paint={{ 'circle-radius': 7, 'circle-color': '#f5c451', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } as never} />
        </GeoJSONSource>
      </Map>

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topCard}>
          <View style={styles.flex}>
            <Text style={styles.brand}>GEO EMPIRE</Text>
            <Text style={styles.status}>{message}</Text>
          </View>
          {loadingWorld ? <ActivityIndicator /> : null}
        </View>

        <View style={styles.legend}>
          <Legend dotStyle={styles.freeDot} label="Свободно" />
          <Legend dotStyle={styles.busyDot} label="Занято" />
          <Legend dotStyle={styles.currentDot} label="Вы здесь" />
        </View>

        <View style={styles.spacer} />

        <View style={styles.bottomCard}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text style={styles.eyebrow}>ТЕРРИТОРИЯ</Text>
                <Text style={styles.cellTitle} numberOfLines={1}>{selectedCell?.h3Index ?? 'Выберите ячейку'}</Text>
              </View>
              <View style={[styles.badge, selectedCell?.occupied ? styles.badgeBusy : styles.badgeFree]}>
                <Text style={styles.badgeText}>{selectedCell?.occupied ? 'ЗАНЯТО' : 'СВОБОДНО'}</Text>
              </View>
            </View>

            {selectedCell?.building ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>{selectedCell.building.name ?? selectedCell.building.code}</Text>
                <Text style={styles.infoText}>Уровень: {selectedCell.building.level ?? 1}</Text>
                <Text style={styles.infoText}>Владелец: {selectedCell.claim?.ownerName ?? 'неизвестно'}</Text>
              </View>
            ) : (
              <Text style={styles.infoText}>На участке нет зарегистрированного игрового объекта.</Text>
            )}

            <Pressable
              disabled={scanning || !selectedCell}
              onPress={() => void runScan()}
              style={({ pressed }) => [styles.scanButton, (scanning || !selectedCell) && styles.disabled, pressed && styles.pressed]}
            >
              {scanning ? <ActivityIndicator color="#11161d" /> : <Text style={styles.scanButtonText}>ПРОВЕСТИ ГЕОРАЗВЕДКУ</Text>}
            </Pressable>

            {scan ? (
              <View style={styles.scanResults}>
                <View style={styles.statsRow}>
                  <Stat value={`${scan.capabilities.maxDepthMeters} м`} label="глубина" />
                  <Stat value={`${scan.capabilities.rangeMeters} м`} label="дальность" />
                  <Stat value={`${Math.round(scan.capabilities.confidence * 100)}%`} label="точность" />
                </View>
                {scan.deposits.length ? scan.deposits.map((deposit) => (
                  <View key={deposit.id} style={styles.depositCard}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.depositName}>{deposit.resource.name}</Text>
                      <Text style={styles.rarity}>R{deposit.resource.rarity}</Text>
                    </View>
                    <Text style={styles.depositText}>Запасы: {formatNumber(deposit.estimates.quantity.min)}–{formatNumber(deposit.estimates.quantity.max)} {deposit.resource.unit}</Text>
                    <Text style={styles.depositText}>Глубина: {formatNumber(deposit.estimates.depthFromMeters.min)}–{formatNumber(deposit.estimates.depthToMeters.max)} м</Text>
                  </View>
                )) : <Text style={styles.emptyText}>Доступных вашему уровню геологии залежей не найдено.</Text>}
              </View>
            ) : null}

            <Text style={styles.devText}>{usingDemoPosition ? 'DEV: тестовая позиция Астана' : 'GPS: реальное положение'} · API {getApiUrl()}</Text>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Legend({ dotStyle, label }: { dotStyle: object; label: string }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, dotStyle]} /><Text style={styles.legendText}>{label}</Text></View>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const absolute = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0f16' },
  map: { ...absolute },
  overlay: { ...absolute, paddingHorizontal: 14, paddingTop: 8 },
  flex: { flex: 1 },
  topCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(10,15,22,0.92)', borderWidth: 1, borderColor: 'rgba(242,209,139,0.28)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  brand: { color: '#f5c451', fontWeight: '900', fontSize: 18, letterSpacing: 1.6 },
  status: { color: '#c7ced8', fontSize: 11, marginTop: 3, maxWidth: 280 },
  legend: { alignSelf: 'flex-start', flexDirection: 'row', gap: 10, marginTop: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(10,15,22,0.88)' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  freeDot: { backgroundColor: '#1c7b6e' },
  busyDot: { backgroundColor: '#b83a3a' },
  currentDot: { backgroundColor: '#f5a524' },
  legendText: { color: '#d7dce3', fontSize: 10 },
  spacer: { flex: 1 },
  bottomCard: { maxHeight: '46%', marginBottom: 8, overflow: 'hidden', backgroundColor: 'rgba(10,15,22,0.96)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(242,209,139,0.28)' },
  scroll: { flexGrow: 0 },
  scrollContent: { padding: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  eyebrow: { color: '#8d99a8', fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  cellTitle: { color: '#f6f7f9', fontSize: 14, fontWeight: '800', marginTop: 3 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  badgeBusy: { backgroundColor: 'rgba(184,58,58,0.28)' },
  badgeFree: { backgroundColor: 'rgba(28,123,110,0.28)' },
  badgeText: { color: '#f4e8c8', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  infoBox: { marginTop: 12, padding: 11, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.045)' },
  infoTitle: { color: '#f5c451', fontSize: 15, fontWeight: '800' },
  infoText: { color: '#b8c0cc', fontSize: 12, marginTop: 5 },
  scanButton: { marginTop: 14, minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#f5c451' },
  scanButtonText: { color: '#11161d', fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.82 },
  scanResults: { marginTop: 14 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  stat: { flex: 1, padding: 9, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.045)' },
  statValue: { color: '#f5c451', fontSize: 13, fontWeight: '800' },
  statLabel: { color: '#8792a2', fontSize: 9, marginTop: 2 },
  depositCard: { marginTop: 7, padding: 11, borderRadius: 11, backgroundColor: 'rgba(28,123,110,0.12)', borderWidth: 1, borderColor: 'rgba(28,123,110,0.28)' },
  depositName: { color: '#f3f4f6', fontSize: 13, fontWeight: '800' },
  rarity: { color: '#f5c451', fontSize: 10, fontWeight: '900' },
  depositText: { color: '#aeb7c3', fontSize: 11, marginTop: 4 },
  emptyText: { color: '#9ba5b2', fontSize: 12, marginTop: 4 },
  devText: { color: '#5f6a78', fontSize: 9, marginTop: 14 },
});
