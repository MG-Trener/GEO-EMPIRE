import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'geo-empire.settings.v3';

export type GameSettings = {
  soundEnabled: boolean;
  soundVolume: number;
  showCellGrid: boolean;
  showResourceOverlay: boolean;
  showOwnedTerritories: boolean;
  showRivals: boolean;
  showIndustry: boolean;
  showScanRange: boolean;
  showMission: boolean;
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  soundEnabled: true,
  soundVolume: 0.6,
  showCellGrid: true,
  showResourceOverlay: true,
  showOwnedTerritories: true,
  showRivals: true,
  showIndustry: true,
  // Legacy preview only. The real scan/build radii are rendered from the
  // server-confirmed reconnaissance result after the player presses Scan.
  showScanRange: false,
  showMission: true,
};

let cachedSettings: GameSettings = DEFAULT_GAME_SETTINGS;
let loaded = false;
let loadingPromise: Promise<void> | null = null;
const listeners = new Set<(settings: GameSettings) => void>();

function notify(): void {
  for (const listener of listeners) listener(cachedSettings);
}

async function loadSettings(): Promise<void> {
  if (loaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GameSettings>;
        cachedSettings = {
          ...DEFAULT_GAME_SETTINGS,
          ...parsed,
          soundVolume: Math.min(1, Math.max(0, Number(parsed.soundVolume ?? DEFAULT_GAME_SETTINGS.soundVolume))),
          // Do not restore the old pre-scan preview toggle. Stage 2 uses the
          // actual scan result instead of showing unexplored geology in advance.
          showScanRange: false,
        };
      }
    } catch {
      cachedSettings = DEFAULT_GAME_SETTINGS;
    } finally {
      loaded = true;
      notify();
    }
  })();

  return loadingPromise;
}

async function persist(settings: GameSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings remain active for the current session even if persistence fails.
  }
}

export function useGameSettings(): {
  settings: GameSettings;
  updateSetting: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  resetSettings: () => void;
} {
  const [settings, setSettings] = useState(cachedSettings);

  useEffect(() => {
    const listener = (next: GameSettings) => setSettings(next);
    listeners.add(listener);
    void loadSettings();
    return () => { listeners.delete(listener); };
  }, []);

  const updateSetting = useCallback(<K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    cachedSettings = { ...cachedSettings, [key]: value };
    notify();
    void persist(cachedSettings);
  }, []);

  const resetSettings = useCallback(() => {
    cachedSettings = DEFAULT_GAME_SETTINGS;
    notify();
    void persist(cachedSettings);
  }, []);

  return { settings, updateSetting, resetSettings };
}
