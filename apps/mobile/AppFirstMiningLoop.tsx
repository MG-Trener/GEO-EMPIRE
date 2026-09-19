import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { cellToBoundary, gridDisk } from 'h3-js';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import {
  claimTerritory,
  collectExtraction,
  DEMO_PLAYER_ID,
  getExtractionStatus,
  getGeologyUpgrades,
  getInventory,
  getKnownDeposits,
  locateWorld,
  runGeologyScan,
  startExtraction,
} from './src/api';
import { gameAssets } from './src/gameAssets';
import { GameSettingsPanel } from './src/GameSettingsPanel';
import { GeologyHeatmapLayer } from './src/GeologyHeatmapLayer';
import { HeatmapResourceSelector } from './src/HeatmapResourceSelector';
import { IndustrialMapLayer } from './src/IndustrialMapLayer';
import { MainSectionPanel, type GameplaySection } from './src/MainSectionPanel';
import { MapLayersPanel } from './src/MapLayersPanel';
import { ResourceHud } from './src/ResourceHud';
import { StrategicCellSummary } from './src/StrategicCellSummary';
import { TerritoryPanel, type TerritoryAction } from './src/TerritoryPanel';
import { useGameSettings } from './src/gameSettings';
import { useGameSounds } from './src/useGameSounds';
import type {
  ExtractionStatus,
  GeologyCapabilities,
  GeologyScanResponse,
  InventoryItem,
  KnownDeposit,
  LocateResponse,
  WorldCell,
} from './src/types';

const ASTANA_DEMO = { lat: 51.1694, lng: 71.4491 };
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const WORLD_RING = 6;
const MAP_ZOOM = 17.85;
const EARTH_RADIUS_METERS = 6_371_000;
const CLAIM_COST = 2_500;
const LOCATION_UPDATE_TIME_MS = 1_500;
const LOCATION_UPDATE_DISTANCE_METERS = 5;
const WORLD_REFRESH_DISTANCE_METERS = 30;

type MainSection = 'map' | GameplaySection;
type ScanDeposit = GeologyScanResponse['deposits'][number];
type LatLng = { lat: number; lng: number };

function ownerKind(cell: WorldCell): 'free' | 'mine' | 'rival' {
  if (!cell.claim) return 'free';
  return cell.claim.ownerId === DEMO_PLAYER_ID ? 'mine' : 'rival';
}

function distanceMeters(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * Math.PI / 180;
  const deltaLng = (b.lng - a.lng) * Math.PI / 180;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function cellsToGeoJson(cells: WorldCell[], selectedH3?: string): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: cells.flatMap((cell) => {
      try {
        const boundary = cellToBoundary(cell.h3Index, true) as [number, number][];
        return [{
          type: 'Feature' as const,
          id: cell.h3Index,
          properties: {
            h3Index: cell.h3Index,
            occupied: cell.occupied ? 1 : 0,
            current: cell.distance === 0 ? 1 : 0,
            selected: cell.h3Index === selectedH3 ? 1 : 0,
            ownerKind: ownerKind(cell),
            hasBuilding: cell.building ? 1 : 0,
          },
          geometry: { type: 'Polygon' as const, coordinates: [[...boundary, boundary[0]]] },
        }];
      } catch {
        return [];
      }
    }),
  };
}

function cellsToStatusMarkers(
  cells: WorldCell[],
  showOwned: boolean,
  showRivals: boolean,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: cells.flatMap((cell) => {
      if (!cell.claim || cell.building) return [];
      const kind = ownerKind(cell);
      if ((kind === 'mine' && !showOwned) || (kind === 'rival' && !showRivals)) return [];
      return [{
        type: 'Feature' as const,
        id: `status-${cell.h3Index}`,
        properties: { ownerKind: kind },
        geometry: {
          type: 'Point' as const,
          coordinates: [cell.center.lng, cell.center.lat],
        },
      }];
    }),
  };
}

function scanCoverageToGeoJson(h3Index: string | undefined, coverageRing: number): FeatureCollection<Polygon> {
  if (!h3Index) return { type: 'FeatureCollection', features: [] };
  try {
    const cells = gridDisk(h3Index, Math.max(0, Math.trunc(coverageRing)));
    return {
      type: 'FeatureCollection',
      features: cells.flatMap((cell, index) => {
        const boundary = cellToBoundary(cell, true) as [number, number][];
        if (!boundary.length) return [];
        return [{
          type: 'Feature' as const,
          id: `scan-area-${cell}`,
          properties: { center: index === 0 ? 1 : 0 },
          geometry: { type: 'Polygon' as const, coordinates: [[...boundary, boundary[0]]] },
        }];
      }),
    };
  } catch {
    return { type: 'FeatureCollection', features: [] };
  }
}

function rangeCircleToGeoJson(lat: number, lng: number, radiusMeters: number): FeatureCollection<Polygon> {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return { type: 'FeatureCollection', features: [] };

  const points: [number, number][] = [];
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
  const latRad = lat * Math.PI / 180;
  const lngRad = lng * Math.PI / 180;

  for (let step = 0; step <= 64; step += 1) {
    const bearing = (step / 64) * Math.PI * 2;
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
      id: 'scan-range',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [points] },
    }],
  };
}

function knownToScanDeposit(deposit: KnownDeposit): ScanDeposit {
  return {
    id: deposit.id,
    h3Index: deposit.h3Index,
    resource: deposit.resource,
    estimates: {
      quantity: deposit.estimatedQuantity,
      depthFromMeters: deposit.estimates.depthFromMeters,
      depthToMeters: deposit.estimates.depthToMeters,
      quality: 0,
      density: deposit.estimates.density,
      confidence: deposit.estimates.confidence,
    },
  };
}

function formatNumber(value: number, maxDigits = 0): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: maxDigits }).format(value);
}

export default function AppFirstMiningLoop() {
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, 24) + 6;
  const safeBottom = Math.max(insets.bottom, 24) + 8;

  const [position, setPosition] = useState(ASTANA_DEMO);
  const [world, setWorld] = useState<LocateResponse | null>(null);
  const [selectedCell, setSelectedCell] = useState<WorldCell | null>(null);
  const [scan, setScan] = useState<GeologyScanResponse | null>(null);
  const [knownDeposits, setKnownDeposits] = useState<KnownDeposit[]>([]);
  const [selectedHeatResource, setSelectedHeatResource] = useState<string | null>(null);
  const [geologyCapabilities, setGeologyCapabilities] = useState<GeologyCapabilities | null>(null);
  const [extraction, setExtraction] = useState<ExtractionStatus | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingWorld, setLoadingWorld] = useState(false);
  const [loadingExtraction, setLoadingExtraction] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [activeMainSection, setActiveMainSection] = useState<MainSection>('map');
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [action, setAction] = useState<TerritoryAction>(null);
  const [message, setMessage] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [resourceFilterOpen, setResourceFilterOpen] = useState(false);
  const cameraRef = useRef<any>(null);
  const selectedCellRef = useRef<WorldCell | null>(null);
  const lastWorldRefreshRef = useRef<LatLng | null>(null);
  const worldRefreshInFlightRef = useRef(false);

  useEffect(() => {
    selectedCellRef.current = selectedCell;
  }, [selectedCell]);

  const { settings, updateSetting, resetSettings } = useGameSettings();
  const {
    click: playClick,
    scan: playScan,
    success: playSuccess,
    error: playError,
    cash: playCash,
  } = useGameSounds(settings.soundEnabled, settings.soundVolume);

  const refreshInventory = useCallback(async () => {
    try {
      setInventory(await getInventory());
    } catch {
      setInventory([]);
    }
  }, []);

  const refreshCapabilities = useCallback(async () => {
    try {
      const catalog = await getGeologyUpgrades();
      setGeologyCapabilities(catalog.capabilities);
    } catch {
      setGeologyCapabilities(null);
    }
  }, []);

  const refreshKnownDeposits = useCallback(async () => {
    try {
      const result = await getKnownDeposits();
      setKnownDeposits(result.deposits);
      setSelectedHeatResource((current) => current ?? result.deposits[0]?.resource.code ?? null);
    } catch {
      setKnownDeposits([]);
    }
  }, []);

  const refreshWorld = useCallback(async (
    next: LatLng,
    keepSelectedH3?: string,
    refreshSideData = true,
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
      lastWorldRefreshRef.current = next;
      if (refreshSideData) {
        await Promise.all([refreshInventory(), refreshCapabilities(), refreshKnownDeposits()]);
      }
    } catch {
      setMessage('Нет связи с игровым сервером');
    } finally {
      setLoadingWorld(false);
    }
  }, [refreshCapabilities, refreshInventory, refreshKnownDeposits]);

  useEffect(() => {
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    const updateFromLocation = async (
      location: Location.LocationObject,
      forceWorldRefresh = false,
    ) => {
      if (cancelled) return;

      const next = { lat: location.coords.latitude, lng: location.coords.longitude };
      setPosition(next);
      // Move only the camera center. MapLibre easeTo keeps the zoom chosen by the player.
      cameraRef.current?.easeTo({ center: [next.lng, next.lat], duration: LOCATION_UPDATE_TIME_MS });

      const lastWorldRefresh = lastWorldRefreshRef.current;
      const shouldRefreshWorld = forceWorldRefresh
        || !lastWorldRefresh
        || distanceMeters(lastWorldRefresh, next) >= WORLD_REFRESH_DISTANCE_METERS;

      if (!shouldRefreshWorld || worldRefreshInFlightRef.current) return;

      worldRefreshInFlightRef.current = true;
      try {
        await refreshWorld(
          next,
          selectedCellRef.current?.h3Index,
          forceWorldRefresh,
        );
      } finally {
        worldRefreshInFlightRef.current = false;
      }
    };

    const start = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (permission.status !== 'granted') {
        setPosition(ASTANA_DEMO);
        await refreshWorld(ASTANA_DEMO);
        setMessage('Геолокация недоступна - показан тестовый сектор');
        return;
      }

      let hasRealPosition = false;
      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          mayShowUserSettingsDialog: true,
        });
        if (!cancelled) {
          hasRealPosition = true;
          await updateFromLocation(current, true);
        }
      } catch {
        try {
          const recent = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
          if (recent && !cancelled) {
            hasRealPosition = true;
            await updateFromLocation(recent, true);
          }
        } catch {
          // The live watcher below can still acquire the first valid fix.
        }
      }

      if (!hasRealPosition && !cancelled) {
        setPosition(ASTANA_DEMO);
        await refreshWorld(ASTANA_DEMO);
        setMessage('Ожидаю точную GPS-позицию...');
      }

      if (cancelled) return;

      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: LOCATION_UPDATE_TIME_MS,
            distanceInterval: LOCATION_UPDATE_DISTANCE_METERS,
            mayShowUserSettingsDialog: true,
          },
          (location) => {
            void updateFromLocation(location);
          },
        );
      } catch {
        if (!cancelled) {
          setMessage('Не удалось запустить постоянное GPS-отслеживание');
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
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

  const statusMarkersGeoJson = useMemo(
    () => cellsToStatusMarkers(
      world?.cells ?? [],
      settings.showOwnedTerritories,
      settings.showRivals,
    ),
    [settings.showOwnedTerritories, settings.showRivals, world],
  );

  const playerGeoJson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: [position.lng, position.lat] },
    }],
  }), [position]);

  const effectiveCapabilities = scan?.capabilities ?? geologyCapabilities;

  const scanCoverageGeoJson = useMemo(
    () => scanCoverageToGeoJson(selectedCell?.h3Index, effectiveCapabilities?.coverageRing ?? 0),
    [effectiveCapabilities?.coverageRing, selectedCell?.h3Index],
  );

  const scanRangeGeoJson = useMemo(
    () => rangeCircleToGeoJson(position.lat, position.lng, effectiveCapabilities?.rangeMeters ?? 0),
    [effectiveCapabilities?.rangeMeters, position.lat, position.lng],
  );

  const allVisibleDeposits = useMemo(() => {
    const merged = new globalThis.Map<string, ScanDeposit>();
    for (const deposit of knownDeposits) merged.set(deposit.id, knownToScanDeposit(deposit));
    for (const deposit of scan?.deposits ?? []) merged.set(deposit.id, deposit);
    return [...merged.values()];
  }, [knownDeposits, scan]);

  const depositsInSelectedCell = useMemo(
    () => allVisibleDeposits.filter((deposit) => deposit.h3Index === selectedCell?.h3Index),
    [allVisibleDeposits, selectedCell?.h3Index],
  );

  const runScan = useCallback(async () => {
    if (!selectedCell) return;

    setScanning(true);
    playScan();

    try {
      const result = await runGeologyScan({
        playerId: DEMO_PLAYER_ID,
        playerLat: position.lat,
        playerLng: position.lng,
        targetLat: selectedCell.center.lat,
        targetLng: selectedCell.center.lng,
      });

      setScan(result);
      setGeologyCapabilities(result.capabilities);
      setSelectedHeatResource(result.deposits[0]?.resource.code ?? selectedHeatResource);
      updateSetting('showResourceOverlay', true);
      setResourceFilterOpen(true);
      await refreshKnownDeposits();
      playSuccess();
      setSheetExpanded(false);
      setMessage(
        result.deposits.length
          ? `Месторождение найдено · ${result.deposits[0]?.resource.name ?? 'ресурс'} · следующий шаг: взять участок`
          : 'Промышленно значимых залежей не найдено. Выберите соседний участок.',
      );
    } catch (error) {
      playError();
      const reason = error instanceof Error ? error.message : 'ошибка';
      setMessage(
        reason === 'target_out_of_range'
          ? 'Выбранный участок вне радиуса георазведки'
          : 'Не удалось провести георазведку',
      );
    } finally {
      setScanning(false);
    }
  }, [playError, playScan, playSuccess, position, refreshKnownDeposits, selectedCell, selectedHeatResource, updateSetting]);

  const claimSelected = useCallback(async () => {
    if (!selectedCell) return;

    setAction('claim');
    playClick();
    try {
      const result = await claimTerritory({
        playerId: DEMO_PLAYER_ID,
        playerLat: position.lat,
        playerLng: position.lng,
        h3Index: selectedCell.h3Index,
      });
      await refreshWorld(position, selectedCell.h3Index);
      playSuccess();
      setMessage(
        result.status === 'already_owned'
          ? 'Этот участок уже принадлежит вашей компании'
          : 'Участок ваш · следующий шаг: начать разработку',
      );
    } catch (error) {
      playError();
      setMessage(`Аренда участка: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setAction(null);
    }
  }, [playClick, playError, playSuccess, position, refreshWorld, selectedCell]);

  const beginExtraction = useCallback(async (depositId: string) => {
    const buildingId = selectedCell?.building?.id;
    if (!buildingId) return;

    setAction('extract');
    try {
      const result = await startExtraction({ playerId: DEMO_PLAYER_ID, buildingId, depositId });
      setExtraction(await getExtractionStatus(buildingId));
      playSuccess();
      setMessage(
        `Добыча «${result.deposit.resource.name}» запущена · ${formatNumber(result.ratePerHour, 2)} ${result.deposit.resource.unit}/ч`,
      );
      await refreshWorld(position, selectedCell.h3Index);
    } catch (error) {
      playError();
      const reason = error instanceof Error ? error.message : 'ошибка';
      setMessage(
        reason === 'building_under_construction'
          ? 'Строительство ещё не завершено'
          : `Запуск добычи: ${reason}`,
      );
    } finally {
      setAction(null);
    }
  }, [playError, playSuccess, position, refreshWorld, selectedCell]);

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
          : `Получено ${formatNumber(result.collected, 2)} ${result.resource.unit}`,
      );
      setExtraction(await getExtractionStatus(buildingId));
      playCash();
      await refreshInventory();
    } catch (error) {
      playError();
      const reason = error instanceof Error ? error.message : 'ошибка';
      setMessage(
        reason === 'insufficient_operating_funds'
          ? 'Недостаточно средств для эксплуатационных расходов'
          : `Получение ресурсов: ${reason}`,
      );
    } finally {
      setAction(null);
    }
  }, [playCash, playError, refreshInventory, selectedCell]);

  const ownedByPlayer = selectedCell?.claim?.ownerId === DEMO_PLAYER_ID;
  const isExtractionBuilding = ['MINE', 'OIL_WELL', 'GAS_WELL'].includes(selectedCell?.building?.code ?? '');

  const openSection = useCallback((section: GameplaySection, nextMessage?: string) => {
    setActiveMainSection(section);
    setSheetExpanded(true);
    setLayersOpen(false);
    setResourceFilterOpen(false);
    if (nextMessage) setMessage(nextMessage);
  }, []);

  const selectCell = useCallback((h3Index: string) => {
    const cell = world?.cells.find((item) => item.h3Index === h3Index) ?? null;
    if (!cell) return;
    playClick();
    setSelectedCell(cell);
    setActiveMainSection('map');
    setSheetExpanded(false);
    setLayersOpen(false);
  }, [playClick, world]);

  const showMapSummary = activeMainSection === 'map' && !sheetExpanded;
  const showBottomCard = activeMainSection !== 'map' || sheetExpanded;
  const ownFillOpacity = settings.showOwnedTerritories ? 0.22 : settings.showCellGrid ? 0.035 : 0;
  const rivalFillOpacity = settings.showRivals ? 0.2 : settings.showCellGrid ? 0.035 : 0;
  const ownedLineOpacity = settings.showOwnedTerritories ? 0.94 : settings.showCellGrid ? 0.35 : 0;
  const rivalLineOpacity = settings.showRivals ? 0.94 : settings.showCellGrid ? 0.35 : 0;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent={false} backgroundColor="#071018" />

      <Map style={styles.map} mapStyle={MAP_STYLE_URL}>
        <Camera
          ref={cameraRef}
          initialViewState={{ center: [ASTANA_DEMO.lng, ASTANA_DEMO.lat], zoom: MAP_ZOOM }}
        />

        {settings.showScanRange ? (
          <GeoJSONSource id="scan-range-preview" data={scanRangeGeoJson}>
            <Layer
              id="scan-range-fill"
              type="fill"
              paint={{ 'fill-color': '#38d8ff', 'fill-opacity': 0.025 } as never}
            />
            <Layer
              id="scan-range-outline"
              type="line"
              paint={{ 'line-color': '#21cce8', 'line-width': 1.4, 'line-opacity': 0.64 } as never}
            />
          </GeoJSONSource>
        ) : null}

        <GeoJSONSource
          id="geo-empire-cells"
          data={cellsGeoJson}
          onPress={(event) => {
            const h3Index = String(event.nativeEvent.features?.[0]?.properties?.h3Index ?? '');
            if (h3Index) selectCell(h3Index);
          }}
        >
          <Layer
            id="cell-fill"
            type="fill"
            paint={{
              'fill-color': [
                'case',
                ['==', ['get', 'hasBuilding'], 1], '#8d6a20',
                ['==', ['get', 'ownerKind'], 'mine'], '#0a8074',
                ['==', ['get', 'ownerKind'], 'rival'], '#a83f4e',
                ['==', ['get', 'current'], 1], '#c69d37',
                '#0c5660',
              ],
              'fill-opacity': [
                'case',
                ['==', ['get', 'selected'], 1], 0.46,
                ['==', ['get', 'ownerKind'], 'mine'], ownFillOpacity,
                ['==', ['get', 'ownerKind'], 'rival'], rivalFillOpacity,
                ['==', ['get', 'current'], 1], settings.showCellGrid ? 0.13 : 0,
                settings.showCellGrid ? 0.055 : 0,
              ],
            } as never}
          />
          <Layer
            id="cell-outline"
            type="line"
            paint={{
              'line-color': [
                'case',
                ['==', ['get', 'selected'], 1], '#fff0a6',
                ['==', ['get', 'hasBuilding'], 1], '#f4bd42',
                ['==', ['get', 'ownerKind'], 'mine'], '#35df9e',
                ['==', ['get', 'ownerKind'], 'rival'], '#f05f65',
                ['==', ['get', 'current'], 1], '#ffc13d',
                '#148b91',
              ],
              'line-width': [
                'case',
                ['==', ['get', 'selected'], 1], 3.2,
                ['!=', ['get', 'ownerKind'], 'free'], 2,
                settings.showCellGrid ? 1.1 : 0,
              ],
              'line-opacity': [
                'case',
                ['==', ['get', 'selected'], 1], 1,
                ['==', ['get', 'ownerKind'], 'mine'], ownedLineOpacity,
                ['==', ['get', 'ownerKind'], 'rival'], rivalLineOpacity,
                settings.showCellGrid ? 0.75 : 0,
              ],
            } as never}
          />
        </GeoJSONSource>

        <GeologyHeatmapLayer
          scan={scan}
          resourceCode={selectedHeatResource}
          visible={settings.showResourceOverlay}
        />

        <GeoJSONSource id="territory-status-markers" data={statusMarkersGeoJson}>
          <Layer
            id="territory-status-halo"
            type="circle"
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 6, 18, 9],
              'circle-color': [
                'case',
                ['==', ['get', 'ownerKind'], 'mine'], '#35df9e',
                '#f05f65',
              ],
              'circle-opacity': 0.16,
              'circle-blur': 0.25,
            } as never}
          />
          <Layer
            id="territory-status-core"
            type="circle"
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 3, 18, 4.5],
              'circle-color': [
                'case',
                ['==', ['get', 'ownerKind'], 'mine'], '#35df9e',
                '#f05f65',
              ],
              'circle-opacity': 0.92,
              'circle-stroke-color': '#071018',
              'circle-stroke-width': 1.5,
            } as never}
          />
        </GeoJSONSource>

        <IndustrialMapLayer
          cells={world?.cells ?? []}
          playerId={DEMO_PLAYER_ID}
          selectedH3={selectedCell?.h3Index}
          onSelect={selectCell}
          visible={settings.showIndustry}
          showOwned={settings.showOwnedTerritories}
          showRivals={settings.showRivals}
        />

        {settings.showScanRange ? (
          <GeoJSONSource id="scan-coverage-preview" data={scanCoverageGeoJson}>
            <Layer
              id="scan-coverage-fill"
              type="fill"
              paint={{ 'fill-color': '#2dcdf4', 'fill-opacity': scanning ? 0.22 : 0.035 } as never}
            />
            <Layer
              id="scan-coverage-outline"
              type="line"
              paint={{ 'line-color': '#60e6ff', 'line-width': scanning ? 3 : 1.2, 'line-opacity': scanning ? 0.9 : 0.45 } as never}
            />
          </GeoJSONSource>
        ) : null}

        <GeoJSONSource id="player-position" data={playerGeoJson}>
          <Layer
            id="player-halo"
            type="circle"
            paint={{ 'circle-radius': 15, 'circle-color': '#0a0f16', 'circle-opacity': 0.5 } as never}
          />
          <Layer
            id="player-dot"
            type="circle"
            paint={{
              'circle-radius': 6,
              'circle-color': '#38d8ff',
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            } as never}
          />
        </GeoJSONSource>
      </Map>

      <SafeAreaView
        pointerEvents="box-none"
        style={[styles.overlay, { paddingTop: safeTop, paddingBottom: safeBottom }]}
        edges={[]}
      >
        <View style={styles.resourceBar}>
          <ResourceHud inventory={inventory} />
          {loadingWorld ? <ActivityIndicator size="small" color="#38d8ff" style={styles.resourceLoading} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Настройки игры"
            onPress={() => {
              playClick();
              setSettingsOpen(true);
            }}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
          >
            <Image source={gameAssets.nav.settings} style={styles.settingsButtonImage} resizeMode="contain" />
          </Pressable>
        </View>

        {settings.showResourceOverlay && resourceFilterOpen ? (
          <HeatmapResourceSelector
            scan={scan}
            selectedCode={selectedHeatResource}
            onSelect={setSelectedHeatResource}
          />
        ) : null}

        {activeMainSection === 'map' ? (
          <MapStatusLegend
            showOwned={settings.showOwnedTerritories}
            showRivals={settings.showRivals}
            showIndustry={settings.showIndustry}
          />
        ) : null}

        {message ? (
          <Pressable
            onPress={() => setMessage('')}
            style={({ pressed }) => [styles.statusToast, pressed && styles.pressed]}
          >
            <Text style={styles.statusToastText} numberOfLines={2}>{message}</Text>
          </Pressable>
        ) : null}

        <MapLayersPanel
          visible={layersOpen}
          settings={settings}
          onToggle={updateSetting}
          onClose={() => setLayersOpen(false)}
        />

        <View style={[styles.mapTools, { top: safeTop + 52 }]}>
          <MapToolButton
            source={gameAssets.utility.center}
            accessibilityLabel="Вернуться к моей геопозиции"
            onPress={() => {
              playClick();
              cameraRef.current?.easeTo({ center: [position.lng, position.lat], duration: 250 });
            }}
          />
          <MapToolButton
            source={gameAssets.utility.layers}
            accessibilityLabel="Открыть слои карты"
            active={layersOpen}
            onPress={() => {
              playClick();
              setResourceFilterOpen(false);
              setLayersOpen((value) => !value);
            }}
          />
          <MapToolButton
            source={gameAssets.utility.filter}
            accessibilityLabel="Фильтр ресурсов тепловой карты"
            active={resourceFilterOpen}
            onPress={() => {
              playClick();
              setLayersOpen(false);
              updateSetting('showResourceOverlay', true);
              setResourceFilterOpen((value) => !value);
            }}
          />
        </View>

        <View style={styles.spacer} />

        {showMapSummary ? (
          <StrategicCellSummary
            cell={selectedCell}
            playerId={DEMO_PLAYER_ID}
            deposits={depositsInSelectedCell}
            extraction={extraction}
            scanning={scanning}
            busy={action !== null}
            claimCost={CLAIM_COST}
            onScan={() => void runScan()}
            onClaim={() => void claimSelected()}
            onDevelop={() => openSection('development', 'Месторождение выбрано. Рассчитайте рекомендуемый проект и запустите строительство.')}
            onCollect={() => void collectResources()}
            onStartExtraction={(depositId) => void beginExtraction(depositId)}
            onExpand={() => setSheetExpanded(true)}
          />
        ) : null}

        <BottomNavigation
          activeSection={activeMainSection}
          onMap={() => {
            playClick();
            setActiveMainSection('map');
            setSheetExpanded(false);
            setLayersOpen(false);
            setResourceFilterOpen(false);
            void refreshWorld(position, selectedCell?.h3Index);
          }}
          onExploration={() => {
            playClick();
            openSection('exploration');
          }}
          onDevelopment={() => {
            playClick();
            openSection('development');
          }}
          onTrade={() => {
            playClick();
            openSection('trade');
          }}
          onTechnology={() => {
            playClick();
            openSection('technology');
          }}
        />

        {showBottomCard ? (
          <View style={[styles.bottomCard, sheetExpanded && styles.bottomCardExpanded]}>
            <Pressable
              onPress={() => setSheetExpanded((value) => !value)}
              style={({ pressed }) => [styles.sheetHandleArea, pressed && styles.pressed]}
            >
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetHint}>
                {activeMainSection === 'map'
                  ? (sheetExpanded ? 'Свернуть детали участка' : 'Развернуть детали участка')
                  : 'Игровой раздел'}
              </Text>
            </Pressable>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {activeMainSection !== 'map' ? (
                <MainSectionPanel
                  key={activeMainSection}
                  section={activeMainSection}
                  onMessage={setMessage}
                />
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
                  scanCapabilities={effectiveCapabilities}
                  depositsInSelectedCell={depositsInSelectedCell}
                  claimCost={CLAIM_COST}
                  onClaim={() => void claimSelected()}
                  onScan={() => void runScan()}
                  onOpenDevelopment={() => openSection('development', 'Месторождение выбрано. Рассчитайте проект разработки.')}
                  onCollect={() => void collectResources()}
                  onStartExtraction={(depositId) => void beginExtraction(depositId)}
                />
              )}
            </ScrollView>
          </View>
        ) : null}
      </SafeAreaView>

      <GameSettingsPanel
        visible={settingsOpen}
        settings={settings}
        onChange={updateSetting}
        onReset={resetSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </View>
  );
}

function MapStatusLegend({
  showOwned,
  showRivals,
  showIndustry,
}: {
  showOwned: boolean;
  showRivals: boolean;
  showIndustry: boolean;
}) {
  return (
    <View style={styles.mapLegend} pointerEvents="none">
      <LegendItem color="#148b91" label="свободно" />
      {showOwned ? <LegendItem color="#35df9e" label="наше" /> : null}
      {showRivals ? <LegendItem color="#f05f65" label="конкурент" /> : null}
      {showIndustry ? <LegendItem color="#f4bd42" label="объект" /> : null}
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
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
      style={({ pressed }) => [
        styles.mapToolButton,
        active && styles.mapToolButtonActive,
        pressed && styles.pressed,
      ]}
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
      style={({ pressed }) => [
        styles.bottomNavButton,
        active && styles.bottomNavButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <Image source={source} style={styles.bottomNavImage} resizeMode="contain" />
    </Pressable>
  );
}

const absolute = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07111a' },
  map: { ...absolute },
  overlay: { ...absolute, paddingHorizontal: 8 },
  resourceBar: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 5, zIndex: 30 },
  resourceLoading: { marginHorizontal: 2 },
  settingsButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(5,16,25,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(73,170,210,0.24)',
  },
  settingsButtonImage: { width: '100%', height: '100%' },
  mapLegend: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 7,
    minHeight: 24,
    borderRadius: 9,
    backgroundColor: 'rgba(4,14,22,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendDot: { width: 6, height: 6, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  legendText: { color: '#718995', fontSize: 5.9, fontWeight: '800' },
  statusToast: {
    alignSelf: 'flex-start',
    maxWidth: '84%',
    marginTop: 4,
    minHeight: 25,
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: 'rgba(5,16,25,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.18)',
  },
  statusToastText: { color: '#b8cbd3', fontSize: 8.5, lineHeight: 11 },
  mapTools: { position: 'absolute', right: 8, gap: 5, zIndex: 90 },
  mapToolButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(5,16,25,0.9)',
    shadowColor: '#000000',
    shadowOpacity: 0.32,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 7,
  },
  mapToolButtonActive: {
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.85)',
    shadowColor: '#38d8ff',
    shadowOpacity: 0.45,
  },
  mapToolImage: { width: '100%', height: '100%' },
  spacer: { flex: 1 },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 3,
    marginTop: 4,
    marginBottom: 3,
    paddingHorizontal: 4,
  },
  bottomNavButton: {
    flex: 1,
    maxWidth: 60,
    height: 48,
    borderRadius: 11,
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
    shadowOpacity: 0.42,
    shadowRadius: 6,
    elevation: 7,
  },
  bottomNavImage: { width: '100%', height: '100%' },
  bottomCard: {
    maxHeight: '25%',
    minHeight: 116,
    marginBottom: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(5,16,25,0.97)',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.24)',
    shadowColor: '#000000',
    shadowOpacity: 0.38,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: -3 },
    elevation: 9,
  },
  bottomCardExpanded: { maxHeight: '58%' },
  sheetHandleArea: { alignItems: 'center', paddingTop: 4, paddingBottom: 2 },
  sheetHandle: { width: 50, height: 4, borderRadius: 3, backgroundColor: '#3f7890' },
  sheetHint: { color: '#6e8798', fontSize: 7.5, marginTop: 2 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 11, paddingTop: 3, paddingBottom: 10 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
});
