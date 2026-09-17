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
import {
  claimTerritory,
  collectExtraction,
  constructBuilding,
  DEMO_PLAYER_ID,
  getApiUrl,
  getExtractionStatus,
  getInventory,
  locateWorld,
  runGeologyScan,
  startExtraction,
} from './src/api';
import { GeologyProgressPanel } from './src/GeologyProgressPanel';
import type {
  ExtractionStatus,
  GeologyScanResponse,
  InventoryItem,
  LocateResponse,
  WorldCell,
} from './src/types';

const ASTANA_DEMO = { lat: 51.1694, lng: 71.4491 };
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const WORLD_RING = 6;
const MAP_ZOOM = 18.15;

function cellsToGeoJson(cells: WorldCell[], selectedH3?: string): FeatureCollection<Polygon> {
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
          selected: cell.h3Index === selectedH3 ? 1 : 0,
        },
        geometry: { type: 'Polygon', coordinates: [ring] },
      };
    }),
  };
}

function formatNumber(value: number, maxDigits = 0): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: maxDigits }).format(value);
}

export default function App() {
  const [position, setPosition] = useState(ASTANA_DEMO);
  const [usingDemoPosition, setUsingDemoPosition] = useState(true);
  const [world, setWorld] = useState<LocateResponse | null>(null);
  const [selectedCell, setSelectedCell] = useState<WorldCell | null>(null);
  const [scan, setScan] = useState<GeologyScanResponse | null>(null);
  const [extraction, setExtraction] = useState<ExtractionStatus | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingWorld, setLoadingWorld] = useState(false);
  const [loadingExtraction, setLoadingExtraction] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showGeology, setShowGeology] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [action, setAction] = useState<'claim' | 'build' | 'extract' | 'collect' | null>(null);
  const [message, setMessage] = useState('Подготовка карты…');

  const refreshInventory = useCallback(async () => {
    try {
      setInventory(await getInventory());
    } catch {
      setInventory([]);
    }
  }, []);

  const refreshWorld = useCallback(async (
    next: { lat: number; lng: number },
    keepSelectedH3?: string,
  ) => {
    setLoadingWorld(true);
    try {
      const response = await locateWorld(next.lat, next.lng, WORLD_RING);
      setWorld(response);
      setSelectedCell(
        keepSelectedH3
          ? response.cells.find((cell) => cell.h3Index === keepSelectedH3) ?? response.currentCell
          : response.currentCell,
      );
      setScan(null);
      setMessage(`H3 r12 · ${response.cells.length} локальных ячеек`);
      await refreshInventory();
    } catch (error) {
      setMessage(`API недоступен: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoadingWorld(false);
    }
  }, [refreshInventory]);

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
          // Development fallback below.
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

  useEffect(() => {
    let cancelled = false;
    const building = selectedCell?.building;

    if (!building?.id || selectedCell?.claim?.ownerId !== DEMO_PLAYER_ID) {
      setExtraction(null);
      return () => { cancelled = true; };
    }

    setLoadingExtraction(true);
    getExtractionStatus(building.id)
      .then((status) => {
        if (!cancelled) setExtraction(status);
      })
      .catch((error) => {
        if (!cancelled) {
          setExtraction(null);
          if (error instanceof Error && error.message !== 'extraction_not_found') {
            setMessage(`Добыча: ${error.message}`);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingExtraction(false);
      });

    return () => { cancelled = true; };
  }, [selectedCell]);

  const cellsGeoJson = useMemo(
    () => cellsToGeoJson(world?.cells ?? [], selectedCell?.h3Index),
    [selectedCell?.h3Index, world],
  );
  const playerGeoJson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: [position.lng, position.lat] },
    }],
  }), [position]);

  const depositsInSelectedCell = useMemo(
    () => scan?.deposits.filter((deposit) => deposit.h3Index === selectedCell?.h3Index) ?? [],
    [scan, selectedCell],
  );

  const runScan = useCallback(async () => {
    if (!selectedCell) return;
    setScanning(true);
    setScan(null);
    try {
      const result = await runGeologyScan({
        playerId: DEMO_PLAYER_ID,
        playerLat: position.lat,
        playerLng: position.lng,
        targetLat: selectedCell.center.lat,
        targetLng: selectedCell.center.lng,
      });
      setScan(result);
      setSheetExpanded(true);
      setMessage(result.deposits.length
        ? `Разведка сохранена · обнаружено залежей: ${result.deposits.length}`
        : 'Разведка сохранена · доступных залежей не обнаружено');
    } catch (error) {
      setMessage(`Разведка: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setScanning(false);
    }
  }, [position, selectedCell]);

  const claimSelected = useCallback(async () => {
    if (!selectedCell) return;
    setAction('claim');
    try {
      const result = await claimTerritory({
        playerId: DEMO_PLAYER_ID,
        playerLat: position.lat,
        playerLng: position.lng,
        h3Index: selectedCell.h3Index,
      });
      await refreshWorld(position, selectedCell.h3Index);
      setMessage(result.status === 'already_owned'
        ? 'Этот участок уже принадлежит вашей компании'
        : `Участок арендован · списано ${formatNumber(result.charged)} ₡`);
    } catch (error) {
      setMessage(`Аренда участка: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setAction(null);
    }
  }, [position, refreshWorld, selectedCell]);

  const buildMine = useCallback(async () => {
    if (!selectedCell) return;
    setAction('build');
    try {
      const result = await constructBuilding({
        playerId: DEMO_PLAYER_ID,
        h3Index: selectedCell.h3Index,
        buildingCode: 'MINE',
      });
      await refreshWorld(position, selectedCell.h3Index);
      setMessage(`Строительство «${result.building.name}» начато · списано ${formatNumber(result.charged)} ₡`);
    } catch (error) {
      setMessage(`Строительство: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setAction(null);
    }
  }, [position, refreshWorld, selectedCell]);

  const beginExtraction = useCallback(async (depositId: string) => {
    const buildingId = selectedCell?.building?.id;
    if (!buildingId) return;

    setAction('extract');
    try {
      const result = await startExtraction({
        playerId: DEMO_PLAYER_ID,
        buildingId,
        depositId,
      });
      setExtraction(await getExtractionStatus(buildingId));
      setMessage(
        `Добыча «${result.deposit.resource.name}» запущена · ${formatNumber(result.ratePerHour, 2)} ${result.deposit.resource.unit}/ч`,
      );
      await refreshWorld(position, selectedCell.h3Index);
    } catch (error) {
      setMessage(`Запуск добычи: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setAction(null);
    }
  }, [position, refreshWorld, selectedCell]);

  const collectResources = useCallback(async () => {
    const buildingId = selectedCell?.building?.id;
    if (!buildingId) return;

    setAction('collect');
    try {
      const result = await collectExtraction({ playerId: DEMO_PLAYER_ID, buildingId });
      const operatingCost = result.economics?.operatingCost ?? 0;
      setMessage(
        operatingCost > 0
          ? `Получено ${formatNumber(result.collected, 2)} ${result.resource.unit} · OPEX ${formatNumber(operatingCost)} ₡`
          : `Получено ${formatNumber(result.collected, 2)} ${result.resource.unit} · ${result.resource.name}`,
      );
      setExtraction(await getExtractionStatus(buildingId));
      await refreshInventory();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'ошибка';
      setMessage(reason === 'insufficient_operating_funds'
        ? 'Недостаточно средств для оплаты эксплуатационных расходов. Ресурс остаётся в буфере.'
        : `Получение ресурсов: ${reason}`);
    } finally {
      setAction(null);
    }
  }, [refreshInventory, selectedCell]);

  const ownedByPlayer = selectedCell?.claim?.ownerId === DEMO_PLAYER_ID;
  const isExtractionBuilding = ['MINE', 'OIL_WELL', 'GAS_WELL'].includes(selectedCell?.building?.code ?? '');

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <Map style={styles.map} mapStyle={MAP_STYLE_URL}>
        <Camera center={[position.lng, position.lat]} zoom={MAP_ZOOM} />

        <GeoJSONSource
          id="geo-empire-cells"
          data={cellsGeoJson}
          onPress={(event) => {
            const h3Index = String(event.nativeEvent.features?.[0]?.properties?.h3Index ?? '');
            const cell = world?.cells.find((item) => item.h3Index === h3Index) ?? null;
            if (cell) {
              setSelectedCell(cell);
              setScan(null);
              setShowGeology(false);
              setSheetExpanded(false);
            }
          }}
        >
          <Layer
            id="cell-fill"
            type="fill"
            paint={{
              'fill-color': [
                'case',
                ['==', ['get', 'current'], 1], '#dca936',
                ['==', ['get', 'occupied'], 1], '#b74a4a',
                '#16886d',
              ],
              'fill-opacity': ['case', ['==', ['get', 'selected'], 1], 0.42, 0.24],
            } as never}
          />
          <Layer
            id="cell-outline"
            type="line"
            paint={{
              'line-color': ['case', ['==', ['get', 'selected'], 1], '#ffe08a', '#8fd7bc'],
              'line-width': ['case', ['==', ['get', 'selected'], 1], 2.8, 1.05],
              'line-opacity': 0.9,
            } as never}
          />
        </GeoJSONSource>

        <GeoJSONSource id="player-position" data={playerGeoJson}>
          <Layer id="player-halo" type="circle" paint={{ 'circle-radius': 14, 'circle-color': '#0a0f16', 'circle-opacity': 0.46 } as never} />
          <Layer id="player-dot" type="circle" paint={{ 'circle-radius': 6, 'circle-color': '#f5c451', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } as never} />
        </GeoJSONSource>
      </Map>

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topCard}>
          <View style={styles.flex}>
            <Text style={styles.brand}>GEO EMPIRE</Text>
            <Text style={styles.status} numberOfLines={2}>{message}</Text>
          </View>
          <Pressable
            onPress={() => {
              setShowGeology((value) => !value);
              setSheetExpanded(false);
            }}
            style={({ pressed }) => [
              styles.geologyButton,
              showGeology && styles.geologyButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.geologyButtonText}>{showGeology ? 'КАРТА' : 'ГЕОЛОГИЯ'}</Text>
          </Pressable>
          {loadingWorld ? <ActivityIndicator size="small" /> : null}
        </View>

        <View style={styles.legend}>
          <Legend dotStyle={styles.freeDot} label="Свободно" />
          <Legend dotStyle={styles.busyDot} label="Занято" />
          <Legend dotStyle={styles.currentDot} label="Вы здесь" />
          <Text style={styles.legendMeta}>r12 · локальная сетка</Text>
        </View>

        <View style={styles.spacer} />

        <View style={[styles.bottomCard, sheetExpanded && styles.bottomCardExpanded]}>
          <Pressable
            onPress={() => setSheetExpanded((value) => !value)}
            style={({ pressed }) => [styles.sheetHandleArea, pressed && styles.pressed]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetHint}>{sheetExpanded ? 'Свернуть' : 'Развернуть'}</Text>
          </Pressable>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {showGeology ? (
              <>
                <GeologyProgressPanel onMessage={setMessage} />
                <Text style={styles.devText}>Прокачка применяется к следующим георазведкам сразу после покупки.</Text>
              </>
            ) : (
              <TerritoryPanel
                selectedCell={selectedCell}
                ownedByPlayer={ownedByPlayer}
                isExtractionBuilding={isExtractionBuilding}
                action={action}
                scanning={scanning}
                loadingExtraction={loadingExtraction}
                extraction={extraction}
                scan={scan}
                inventory={inventory}
                depositsInSelectedCell={depositsInSelectedCell.length}
                onClaim={() => void claimSelected()}
                onBuild={() => void buildMine()}
                onScan={() => void runScan()}
                onCollect={() => void collectResources()}
                onStartExtraction={(depositId) => void beginExtraction(depositId)}
              />
            )}

            <Text style={styles.devText}>
              {usingDemoPosition ? 'DEV: тестовая позиция Астана' : 'GPS: реальное положение'} · API {getApiUrl()}
            </Text>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

function TerritoryPanel({
  selectedCell,
  ownedByPlayer,
  isExtractionBuilding,
  action,
  scanning,
  loadingExtraction,
  extraction,
  scan,
  inventory,
  depositsInSelectedCell,
  onClaim,
  onBuild,
  onScan,
  onCollect,
  onStartExtraction,
}: {
  selectedCell: WorldCell | null;
  ownedByPlayer: boolean;
  isExtractionBuilding: boolean;
  action: 'claim' | 'build' | 'extract' | 'collect' | null;
  scanning: boolean;
  loadingExtraction: boolean;
  extraction: ExtractionStatus | null;
  scan: GeologyScanResponse | null;
  inventory: InventoryItem[];
  depositsInSelectedCell: number;
  onClaim: () => void;
  onBuild: () => void;
  onScan: () => void;
  onCollect: () => void;
  onStartExtraction: (depositId: string) => void;
}) {
  return (
    <>
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
          <Text style={styles.infoText}>Статус: {selectedCell.building.status ?? '—'}</Text>
        </View>
      ) : selectedCell?.claim ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{ownedByPlayer ? 'Участок вашей компании' : 'Чужая территория'}</Text>
          <Text style={styles.infoText}>Владелец: {selectedCell.claim.ownerName ?? 'неизвестно'}</Text>
        </View>
      ) : (
        <Text style={styles.infoText}>Свободный участок. Его можно исследовать и арендовать.</Text>
      )}

      {selectedCell && !selectedCell.claim ? (
        <ActionButton
          busy={action === 'claim'}
          disabled={action !== null}
          label="АРЕНДОВАТЬ УЧАСТОК · 5 000 ₡"
          onPress={onClaim}
        />
      ) : null}

      {selectedCell && ownedByPlayer && !selectedCell.building ? (
        <ActionButton
          busy={action === 'build'}
          disabled={action !== null}
          label="ПОСТРОИТЬ ШАХТУ · 10 000 ₡"
          onPress={onBuild}
        />
      ) : null}

      <ActionButton
        busy={scanning}
        disabled={scanning || !selectedCell || action !== null}
        label="ПРОВЕСТИ ГЕОРАЗВЕДКУ"
        onPress={onScan}
      />

      {loadingExtraction ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator size="small" />
          <Text style={styles.infoText}>Проверка добычи…</Text>
        </View>
      ) : null}

      {ownedByPlayer && isExtractionBuilding && extraction ? (
        <View style={styles.productionCard}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>ДОБЫЧА</Text>
              <Text style={styles.infoTitle}>{extraction.deposit.resource.name}</Text>
            </View>
            <Text style={styles.productionRate}>{formatNumber(extraction.ratePerHour, 2)} {extraction.deposit.resource.unit}/ч</Text>
          </View>
          {extraction.economics?.source === 'development_project' ? (
            <View style={styles.economicsBox}>
              <Text style={styles.economicsTitle}>ЭКОНОМИКА ПРОЕКТА</Text>
              <Text style={styles.economicsText}>
                Мощность: {formatNumber(extraction.plannedDailyOutput ?? extraction.ratePerHour * 24, 1)} {extraction.deposit.resource.unit}/сут
              </Text>
              <Text style={styles.economicsText}>
                OPEX: {formatNumber(extraction.economics.opexPerUnit, 2)} ₡/{extraction.deposit.resource.unit}
              </Text>
              <Text style={styles.operatingCost}>
                К оплате при сборе: {formatNumber(extraction.economics.operatingCostDue ?? 0)} ₡
              </Text>
            </View>
          ) : null}
          <Text style={styles.infoText}>Накоплено: {formatNumber(extraction.availableToCollect, 2)} {extraction.deposit.resource.unit}</Text>
          <Text style={styles.infoText}>Остаток месторождения: {formatNumber(extraction.deposit.quantityRemaining, 2)} {extraction.deposit.resource.unit}</Text>
          <ActionButton
            busy={action === 'collect'}
            disabled={action !== null || extraction.availableToCollect <= 0}
            label={`ЗАБРАТЬ · ${formatNumber(extraction.availableToCollect, 2)} ${extraction.deposit.resource.unit}`}
            onPress={onCollect}
          />
        </View>
      ) : null}

      {scan ? (
        <View style={styles.scanResults}>
          <View style={styles.statsRow}>
            <Stat value={`${scan.capabilities.maxDepthMeters} м`} label="глубина" />
            <Stat value={`${scan.capabilities.rangeMeters} м`} label="дальность" />
            <Stat value={`${Math.round(scan.capabilities.confidence * 100)}%`} label="точность" />
          </View>
          <Text style={styles.scanId}>Отчёт: {scan.scanId.slice(0, 8)}</Text>

          {scan.deposits.length ? scan.deposits.map((deposit) => {
            const canStartHere = ownedByPlayer
              && isExtractionBuilding
              && !extraction
              && deposit.h3Index === selectedCell?.h3Index;

            return (
              <View key={deposit.id} style={styles.depositCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.depositName}>{deposit.resource.name}</Text>
                  <Text style={styles.rarity}>R{deposit.resource.rarity}</Text>
                </View>
                <Text style={styles.depositText}>Запасы: {formatNumber(deposit.estimates.quantity.min)}–{formatNumber(deposit.estimates.quantity.max)} {deposit.resource.unit}</Text>
                <Text style={styles.depositText}>Глубина: {formatNumber(deposit.estimates.depthFromMeters)}–{formatNumber(deposit.estimates.depthToMeters)} м</Text>
                {canStartHere ? (
                  <ActionButton
                    busy={action === 'extract'}
                    disabled={action !== null}
                    label={`НАЧАТЬ ДОБЫЧУ · ${deposit.resource.name.toUpperCase()}`}
                    onPress={() => onStartExtraction(deposit.id)}
                  />
                ) : null}
              </View>
            );
          }) : <Text style={styles.emptyText}>Доступных вашему уровню геологии залежей не найдено.</Text>}

          {!extraction && ownedByPlayer && isExtractionBuilding && depositsInSelectedCell === 0 ? (
            <Text style={styles.emptyText}>Для запуска добычи сначала найдите залежь именно в ячейке этого объекта.</Text>
          ) : null}
        </View>
      ) : null}

      {inventory.length ? (
        <View style={styles.inventoryBox}>
          <Text style={styles.eyebrow}>СКЛАД КОМПАНИИ</Text>
          {inventory.map((item) => (
            <View key={item.resourceId} style={styles.inventoryRow}>
              <Text style={styles.inventoryName}>{item.name}</Text>
              <Text style={styles.inventoryValue}>{formatNumber(item.quantity, 2)} {item.unit}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

function Legend({ dotStyle, label }: { dotStyle: object; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, dotStyle]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionButton({
  busy,
  disabled,
  label,
  onPress,
}: {
  busy: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, disabled && styles.disabled, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator color="#11161d" /> : <Text style={styles.actionButtonText}>{label}</Text>}
    </Pressable>
  );
}

const absolute = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0f16' },
  map: { ...absolute },
  overlay: { ...absolute, paddingHorizontal: 12, paddingTop: 5 },
  flex: { flex: 1 },
  topCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(8,13,20,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(242,209,139,0.26)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  brand: { color: '#f5c451', fontWeight: '900', fontSize: 18, letterSpacing: 1.5 },
  status: { color: '#c7ced8', fontSize: 10, marginTop: 2, maxWidth: 235 },
  geologyButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(245,196,81,0.4)',
    backgroundColor: 'rgba(245,196,81,0.08)',
  },
  geologyButtonActive: { backgroundColor: 'rgba(121,199,255,0.14)', borderColor: 'rgba(121,199,255,0.5)' },
  geologyButtonText: { color: '#f4e8c8', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  legend: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: 'rgba(8,13,20,0.84)',
    maxWidth: '96%',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  freeDot: { backgroundColor: '#1c9b7a' },
  busyDot: { backgroundColor: '#d95757' },
  currentDot: { backgroundColor: '#e7b44b' },
  legendText: { color: '#d7dce3', fontSize: 9 },
  legendMeta: { color: '#8290a1', fontSize: 8 },
  spacer: { flex: 1 },
  bottomCard: {
    maxHeight: '32%',
    minHeight: 176,
    marginBottom: 5,
    overflow: 'hidden',
    backgroundColor: 'rgba(8,13,20,0.97)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(242,209,139,0.24)',
  },
  bottomCardExpanded: { maxHeight: '67%' },
  sheetHandleArea: { alignItems: 'center', paddingTop: 7, paddingBottom: 3 },
  sheetHandle: { width: 48, height: 4, borderRadius: 3, backgroundColor: '#4d5868' },
  sheetHint: { color: '#697587', fontSize: 8, marginTop: 3 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 5, paddingBottom: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  eyebrow: { color: '#8d99a8', fontSize: 9, letterSpacing: 1.25, fontWeight: '700' },
  cellTitle: { color: '#f6f7f9', fontSize: 13, fontWeight: '800', marginTop: 2 },
  badge: { borderRadius: 18, paddingHorizontal: 9, paddingVertical: 5 },
  badgeBusy: { backgroundColor: 'rgba(184,58,58,0.28)' },
  badgeFree: { backgroundColor: 'rgba(28,123,110,0.28)' },
  badgeText: { color: '#f4e8c8', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  infoBox: { marginTop: 9, padding: 9, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.045)' },
  infoTitle: { color: '#f5c451', fontSize: 14, fontWeight: '800' },
  infoText: { color: '#b8c0cc', fontSize: 11, marginTop: 4 },
  actionButton: { marginTop: 8, minHeight: 39, justifyContent: 'center', alignItems: 'center', borderRadius: 11, backgroundColor: '#f5c451' },
  actionButtonText: { color: '#11161d', fontSize: 10, fontWeight: '900', letterSpacing: 0.55 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.82 },
  inlineLoading: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  productionCard: { marginTop: 10, padding: 10, borderRadius: 11, backgroundColor: 'rgba(245,196,81,0.08)', borderWidth: 1, borderColor: 'rgba(245,196,81,0.25)' },
  productionRate: { color: '#f5c451', fontSize: 10, fontWeight: '900' },
  economicsBox: { marginTop: 8, padding: 8, borderRadius: 9, backgroundColor: 'rgba(121,199,255,0.07)', borderWidth: 1, borderColor: 'rgba(121,199,255,0.16)' },
  economicsTitle: { color: '#79c7ff', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  economicsText: { color: '#aebdca', fontSize: 9, marginTop: 3 },
  operatingCost: { color: '#f5c451', fontSize: 9, fontWeight: '900', marginTop: 4 },
  scanResults: { marginTop: 11 },
  scanId: { color: '#687586', fontSize: 8, marginBottom: 4 },
  statsRow: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  stat: { flex: 1, padding: 8, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.045)' },
  statValue: { color: '#f5c451', fontSize: 12, fontWeight: '800' },
  statLabel: { color: '#8792a2', fontSize: 8, marginTop: 2 },
  depositCard: { marginTop: 6, padding: 9, borderRadius: 10, backgroundColor: 'rgba(28,123,110,0.12)', borderWidth: 1, borderColor: 'rgba(28,123,110,0.28)' },
  depositName: { color: '#f3f4f6', fontSize: 12, fontWeight: '800' },
  rarity: { color: '#f5c451', fontSize: 9, fontWeight: '900' },
  depositText: { color: '#aeb7c3', fontSize: 10, marginTop: 3 },
  emptyText: { color: '#9ba5b2', fontSize: 11, marginTop: 7 },
  inventoryBox: { marginTop: 11, padding: 10, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.035)' },
  inventoryRow: { marginTop: 7, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inventoryName: { color: '#cbd2dc', fontSize: 11 },
  inventoryValue: { color: '#f5c451', fontSize: 11, fontWeight: '800' },
  devText: { color: '#5f6a78', fontSize: 8, marginTop: 11 },
});
