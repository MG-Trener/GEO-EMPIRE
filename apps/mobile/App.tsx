import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
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
import { gameAssets, resourceIconForCode } from './src/gameAssets';
import { GeologyProgressPanel, type GeoHubSection } from './src/GeologyProgressPanel';
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

type MainSection = 'map' | 'exploration' | 'development' | 'trade' | 'technology';

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

function scanDepositsToGeoJson(scan: GeologyScanResponse | null): FeatureCollection<Polygon> {
  const seen = new Set<string>();
  const deposits = scan?.deposits ?? [];
  return {
    type: 'FeatureCollection',
    features: deposits.flatMap((deposit) => {
      if (!deposit.h3Index || seen.has(deposit.h3Index)) return [];
      seen.add(deposit.h3Index);
      const boundary = cellToBoundary(deposit.h3Index, true) as [number, number][];
      if (!boundary.length) return [];
      return [{
        type: 'Feature' as const,
        id: `deposit-${deposit.h3Index}`,
        properties: {
          resourceCode: deposit.resource.code,
          resourceName: deposit.resource.name,
          rarity: deposit.resource.rarity,
        },
        geometry: { type: 'Polygon' as const, coordinates: [[...boundary, boundary[0]]] },
      }];
    }),
  };
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
  const [showResourceOverlay, setShowResourceOverlay] = useState(true);
  const [hubSection, setHubSection] = useState<GeoHubSection>('geology');
  const [activeMainSection, setActiveMainSection] = useState<MainSection>('map');
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
  const discoveredDepositsGeoJson = useMemo(
    () => showResourceOverlay ? scanDepositsToGeoJson(scan) : ({ type: 'FeatureCollection', features: [] } as FeatureCollection<Polygon>),
    [scan, showResourceOverlay],
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
      setShowResourceOverlay(true);
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

  const openHubSection = useCallback((mainSection: MainSection, section: GeoHubSection, message?: string) => {
    setActiveMainSection(mainSection);
    setHubSection(section);
    setShowGeology(true);
    setSheetExpanded(true);
    if (message) setMessage(message);
  }, []);

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
              setShowGeology(false);
              setActiveMainSection('map');
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
                ['==', ['get', 'current'], 1], '#e3ad38',
                ['==', ['get', 'occupied'], 1], '#d04b4b',
                '#12a98b',
              ],
              'fill-opacity': ['case', ['==', ['get', 'selected'], 1], 0.46, 0.22],
            } as never}
          />
          <Layer
            id="cell-outline"
            type="line"
            paint={{
              'line-color': ['case', ['==', ['get', 'selected'], 1], '#ffd76a', '#48e2c0'],
              'line-width': ['case', ['==', ['get', 'selected'], 1], 3.2, 1.1],
              'line-opacity': 0.92,
            } as never}
          />
        </GeoJSONSource>

        <GeoJSONSource id="discovered-resource-zones" data={discoveredDepositsGeoJson}>
          <Layer
            id="resource-zone-fill"
            type="fill"
            paint={{
              'fill-color': [
                'match', ['get', 'resourceCode'],
                'OIL', '#111820',
                'GAS', '#2d9df4',
                'GOLD', '#f4b942',
                'COPPER', '#d76b3e',
                'IRON', '#a7b2bd',
                'COAL', '#343b43',
                'URANIUM', '#65db72',
                'RARE_EARTHS', '#9b63e8',
                '#32d8e6',
              ],
              'fill-opacity': 0.5,
            } as never}
          />
          <Layer
            id="resource-zone-outline"
            type="line"
            paint={{
              'line-color': '#f4f8fa',
              'line-width': 2.2,
              'line-opacity': 0.82,
            } as never}
          />
        </GeoJSONSource>

        <GeoJSONSource id="player-position" data={playerGeoJson}>
          <Layer id="player-halo" type="circle" paint={{ 'circle-radius': 15, 'circle-color': '#0a0f16', 'circle-opacity': 0.5 } as never} />
          <Layer id="player-dot" type="circle" paint={{ 'circle-radius': 6, 'circle-color': '#38d8ff', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } as never} />
        </GeoJSONSource>
      </Map>

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topHud}>
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>GEO EMPIRE</Text>
            <Text style={styles.status} numberOfLines={1}>{message}</Text>
          </View>
          {loadingWorld ? <ActivityIndicator size="small" color="#38d8ff" /> : null}
        </View>

        <ResourceStrip inventory={inventory} />

        <View style={styles.legend}>
          <Legend dotStyle={styles.freeDot} label="Свободно" />
          <Legend dotStyle={styles.busyDot} label="Занято" />
          <Legend dotStyle={styles.currentDot} label="Вы здесь" />
        </View>

        <View style={styles.mapTools}>
          <MapToolButton
            source={gameAssets.utility.center}
            accessibilityLabel="Моё местоположение"
            onPress={() => void refreshWorld(position, selectedCell?.h3Index)}
          />
          <MapToolButton
            source={gameAssets.utility.layers}
            accessibilityLabel="Слои карты"
            onPress={() => setMessage('Слои карты: спутник, рельеф, ресурсы и инфраструктура')}
          />
          <MapToolButton
            source={gameAssets.utility.filter}
            accessibilityLabel="Фильтры ресурсов"
            active={showResourceOverlay}
            onPress={() => setShowResourceOverlay((current) => {
              const next = !current;
              setMessage(next ? 'Слой найденных ресурсов включён' : 'Слой найденных ресурсов скрыт');
              return next;
            })}
          />
          <MapToolButton
            source={gameAssets.utility.fullscreen}
            accessibilityLabel="Полный экран"
            onPress={() => setMessage('Карта уже работает в полноэкранном игровом режиме')}
          />
        </View>

        <View style={styles.spacer} />

        <BottomNavigation
          activeSection={activeMainSection}
          onMap={() => {
            setActiveMainSection('map');
            setShowGeology(false);
            setSheetExpanded(false);
          }}
          onExploration={() => openHubSection('exploration', 'deposits', 'Разведка: известные месторождения и углублённые исследования')}
          onDevelopment={() => openHubSection('development', 'deposits', 'Разработка: выберите месторождение и инвестиционный проект')}
          onTrade={() => openHubSection('trade', 'market', 'Торговля: товарная биржа ресурсов')}
          onTechnology={() => openHubSection('technology', 'geology', 'Технологии: развитие геологической службы')}
        />

        <View style={[styles.bottomCard, sheetExpanded && styles.bottomCardExpanded]}>
          <Pressable
            onPress={() => setSheetExpanded((value) => !value)}
            style={({ pressed }) => [styles.sheetHandleArea, pressed && styles.pressed]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetHint}>{sheetExpanded ? 'Свернуть панель' : 'Развернуть панель участка'}</Text>
          </Pressable>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {showGeology ? (
              <>
                <GeologyProgressPanel initialSection={hubSection} onMessage={setMessage} />
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

function ResourceStrip({ inventory }: { inventory: InventoryItem[] }) {
  const placeholders = [
    { resourceId: -1, code: 'OIL', name: 'Нефть', unit: 'т', quantity: 0, updatedAt: '' },
    { resourceId: -2, code: 'GAS', name: 'Газ', unit: 'м³', quantity: 0, updatedAt: '' },
    { resourceId: -3, code: 'GOLD', name: 'Золото', unit: 'кг', quantity: 0, updatedAt: '' },
  ];
  const items = inventory.length ? inventory.slice(0, 4) : placeholders;

  return (
    <View style={styles.resourceStrip}>
      {items.map((item) => (
        <View key={`${item.resourceId}-${item.code}`} style={styles.resourceChip}>
          <Image source={resourceIconForCode(item.code || item.name)} style={styles.resourceChipIcon} resizeMode="contain" />
          <View style={styles.resourceChipText}>
            <Text style={styles.resourceChipName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.resourceChipValue} numberOfLines={1}>{formatNumber(item.quantity, 1)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function MapToolButton({
  source,
  onPress,
  accessibilityLabel,
  active = false,
}: {
  source: ImageSourcePropType;
  onPress: () => void;
  accessibilityLabel: string;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.mapToolButton, active && styles.mapToolButtonActive, pressed && styles.pressed]}
    >
      <Image source={source} style={styles.mapToolImage} resizeMode="contain" />
    </Pressable>
  );
}

function BottomNavigation({
  activeSection,
  onMap,
  onExploration,
  onDevelopment,
  onTrade,
  onTechnology,
}: {
  activeSection: MainSection;
  onMap: () => void;
  onExploration: () => void;
  onDevelopment: () => void;
  onTrade: () => void;
  onTechnology: () => void;
}) {
  return (
    <View style={styles.bottomNav}>
      <BottomNavButton source={gameAssets.nav.map} active={activeSection === 'map'} onPress={onMap} />
      <BottomNavButton source={gameAssets.nav.exploration} active={activeSection === 'exploration'} onPress={onExploration} />
      <BottomNavButton source={gameAssets.nav.development} active={activeSection === 'development'} onPress={onDevelopment} />
      <BottomNavButton source={gameAssets.nav.trade} active={activeSection === 'trade'} onPress={onTrade} />
      <BottomNavButton source={gameAssets.nav.technologies} active={activeSection === 'technology'} onPress={onTechnology} />
    </View>
  );
}

function BottomNavButton({
  source,
  active = false,
  onPress,
}: {
  source: ImageSourcePropType;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bottomNavButton, active && styles.bottomNavButtonActive, pressed && styles.pressed]}
    >
      <Image source={source} style={styles.bottomNavImage} resizeMode="contain" />
    </Pressable>
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
          <Text style={styles.eyebrow}>ВЫБРАННЫЙ УЧАСТОК</Text>
          <Text style={styles.cellTitle} numberOfLines={1}>{selectedCell?.h3Index ?? 'Выберите ячейку на карте'}</Text>
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
        <Text style={styles.infoText}>Свободный участок. Проведите георазведку, оцените ресурсы и арендуйте территорию.</Text>
      )}

      <View style={styles.actionGrid}>
        {selectedCell && !selectedCell.claim ? (
          <ActionButton
            busy={action === 'claim'}
            disabled={action !== null}
            label="АРЕНДОВАТЬ · 5 000 ₡"
            tone="green"
            onPress={onClaim}
          />
        ) : null}

        {selectedCell && ownedByPlayer && !selectedCell.building ? (
          <ActionButton
            busy={action === 'build'}
            disabled={action !== null}
            label="ПОСТРОИТЬ ШАХТУ · 10 000 ₡"
            tone="amber"
            onPress={onBuild}
          />
        ) : null}

        <ActionButton
          busy={scanning}
          disabled={scanning || !selectedCell || action !== null}
          label="ПРОВЕСТИ ГЕОРАЗВЕДКУ"
          tone="cyan"
          onPress={onScan}
        />
      </View>

      {loadingExtraction ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator size="small" color="#38d8ff" />
          <Text style={styles.infoText}>Проверка добычи…</Text>
        </View>
      ) : null}

      {ownedByPlayer && isExtractionBuilding && extraction ? (
        <View style={styles.productionCard}>
          <View style={styles.rowBetween}>
            <View style={styles.productionTitleRow}>
              <Image source={resourceIconForCode(extraction.deposit.resource.code)} style={styles.depositIcon} resizeMode="contain" />
              <View>
                <Text style={styles.eyebrow}>ДОБЫЧА</Text>
                <Text style={styles.infoTitle}>{extraction.deposit.resource.name}</Text>
              </View>
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
            tone="green"
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
                <View style={styles.depositHeader}>
                  <Image source={resourceIconForCode(deposit.resource.code || deposit.resource.name)} style={styles.depositIcon} resizeMode="contain" />
                  <View style={styles.flex}>
                    <Text style={styles.depositName}>{deposit.resource.name}</Text>
                    <Text style={styles.depositText}>Глубина: {formatNumber(deposit.estimates.depthFromMeters)}–{formatNumber(deposit.estimates.depthToMeters)} м</Text>
                  </View>
                  <Text style={styles.rarity}>R{deposit.resource.rarity}</Text>
                </View>
                <Text style={styles.depositText}>Запасы: {formatNumber(deposit.estimates.quantity.min)}–{formatNumber(deposit.estimates.quantity.max)} {deposit.resource.unit}</Text>
                {canStartHere ? (
                  <ActionButton
                    busy={action === 'extract'}
                    disabled={action !== null}
                    label={`НАЧАТЬ ДОБЫЧУ · ${deposit.resource.name.toUpperCase()}`}
                    tone="amber"
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
              <View style={styles.inventoryNameRow}>
                <Image source={resourceIconForCode(item.code || item.name)} style={styles.inventoryIcon} resizeMode="contain" />
                <Text style={styles.inventoryName}>{item.name}</Text>
              </View>
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
  tone = 'cyan',
  onPress,
}: {
  busy: boolean;
  disabled: boolean;
  label: string;
  tone?: 'cyan' | 'green' | 'amber';
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        tone === 'green' && styles.actionButtonGreen,
        tone === 'amber' && styles.actionButtonAmber,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.actionButtonText}>{label}</Text>}
    </Pressable>
  );
}

const absolute = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07111a' },
  map: { ...absolute },
  overlay: { ...absolute, paddingHorizontal: 10, paddingTop: 4 },
  flex: { flex: 1 },
  topHud: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(5,16,25,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.34)',
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  brandBlock: { flex: 1 },
  brand: { color: '#f7c84b', fontWeight: '900', fontSize: 17, letterSpacing: 1.5 },
  status: { color: '#b5c6d3', fontSize: 9, marginTop: 2 },
  resourceStrip: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 6,
  },
  resourceChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(5,16,25,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(73,170,210,0.28)',
  },
  resourceChipIcon: { width: 34, height: 34 },
  resourceChipText: { flex: 1, minWidth: 0 },
  resourceChipName: { color: '#8ca4b7', fontSize: 7, fontWeight: '700' },
  resourceChipValue: { color: '#eef8ff', fontSize: 10, fontWeight: '900', marginTop: 1 },
  legend: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 9,
    marginTop: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(5,16,25,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  freeDot: { backgroundColor: '#21d7a8' },
  busyDot: { backgroundColor: '#f35f5f' },
  currentDot: { backgroundColor: '#f6c744' },
  legendText: { color: '#d6e1e8', fontSize: 8 },
  mapTools: {
    position: 'absolute',
    right: 9,
    top: 142,
    gap: 7,
  },
  mapToolButton: {
    width: 50,
    height: 50,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(5,16,25,0.9)',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  mapToolButtonActive: { borderWidth: 1, borderColor: 'rgba(56,216,255,0.85)', shadowColor: '#38d8ff', shadowOpacity: 0.5 },
  mapToolImage: { width: '100%', height: '100%' },
  spacer: { flex: 1 },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  bottomNavButton: {
    flex: 1,
    maxWidth: 72,
    height: 58,
    borderRadius: 14,
    overflow: 'hidden',
    opacity: 0.78,
    backgroundColor: 'rgba(5,16,25,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(73,170,210,0.16)',
  },
  bottomNavButtonActive: {
    opacity: 1,
    borderColor: 'rgba(56,216,255,0.8)',
    shadowColor: '#38d8ff',
    shadowOpacity: 0.45,
    shadowRadius: 7,
    elevation: 8,
  },
  bottomNavImage: { width: '100%', height: '100%' },
  bottomCard: {
    maxHeight: '31%',
    minHeight: 162,
    marginBottom: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(5,16,25,0.97)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.25)',
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
  },
  bottomCardExpanded: { maxHeight: '64%' },
  sheetHandleArea: { alignItems: 'center', paddingTop: 6, paddingBottom: 3 },
  sheetHandle: { width: 52, height: 4, borderRadius: 3, backgroundColor: '#3f7890' },
  sheetHint: { color: '#6e8798', fontSize: 8, marginTop: 3 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 13, paddingTop: 4, paddingBottom: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  eyebrow: { color: '#6e91a8', fontSize: 8, letterSpacing: 1.15, fontWeight: '800' },
  cellTitle: { color: '#f4f9fc', fontSize: 12, fontWeight: '800', marginTop: 2 },
  badge: { borderRadius: 18, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1 },
  badgeBusy: { backgroundColor: 'rgba(184,58,58,0.18)', borderColor: 'rgba(243,95,95,0.45)' },
  badgeFree: { backgroundColor: 'rgba(28,123,110,0.18)', borderColor: 'rgba(33,215,168,0.42)' },
  badgeText: { color: '#f1f8fb', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  infoBox: {
    marginTop: 8,
    padding: 9,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoTitle: { color: '#f4c957', fontSize: 13, fontWeight: '800' },
  infoText: { color: '#b6c3cc', fontSize: 10, marginTop: 4 },
  actionGrid: { marginTop: 3 },
  actionButton: {
    marginTop: 7,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 11,
    backgroundColor: '#08394a',
    borderWidth: 1,
    borderColor: '#27cce9',
  },
  actionButtonGreen: { backgroundColor: '#0b472e', borderColor: '#31df8b' },
  actionButtonAmber: { backgroundColor: '#4e350b', borderColor: '#f4b53c' },
  actionButtonText: { color: '#f7fbfd', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  inlineLoading: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  productionCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(9,51,64,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.26)',
  },
  productionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  productionRate: { color: '#47e5bc', fontSize: 10, fontWeight: '900' },
  economicsBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 9,
    backgroundColor: 'rgba(121,199,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(121,199,255,0.14)',
  },
  economicsTitle: { color: '#38d8ff', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  economicsText: { color: '#aebdca', fontSize: 9, marginTop: 3 },
  operatingCost: { color: '#f5c451', fontSize: 9, fontWeight: '900', marginTop: 4 },
  scanResults: { marginTop: 11 },
  scanId: { color: '#687f90', fontSize: 8, marginBottom: 4 },
  statsRow: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  stat: {
    flex: 1,
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.09)',
  },
  statValue: { color: '#38d8ff', fontSize: 12, fontWeight: '800' },
  statLabel: { color: '#879baa', fontSize: 8, marginTop: 2 },
  depositCard: {
    marginTop: 6,
    padding: 9,
    borderRadius: 11,
    backgroundColor: 'rgba(13,56,63,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(33,215,168,0.24)',
  },
  depositHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  depositIcon: { width: 46, height: 46 },
  depositName: { color: '#f3f7fa', fontSize: 12, fontWeight: '800' },
  rarity: { color: '#f5c451', fontSize: 9, fontWeight: '900' },
  depositText: { color: '#aebcc6', fontSize: 9, marginTop: 3 },
  emptyText: { color: '#91a5b2', fontSize: 10, marginTop: 7 },
  inventoryBox: {
    marginTop: 11,
    padding: 10,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.028)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.055)',
  },
  inventoryRow: { marginTop: 7, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inventoryNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inventoryIcon: { width: 28, height: 28 },
  inventoryName: { color: '#cbd7df', fontSize: 10 },
  inventoryValue: { color: '#47e5bc', fontSize: 10, fontWeight: '800' },
  devText: { color: '#536b7a', fontSize: 7, marginTop: 10 },
});