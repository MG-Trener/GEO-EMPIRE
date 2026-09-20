import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

const RELEASE_API = 'https://api.github.com/repos/MG-Trener/GEO-EMPIRE/releases/latest';
const RAW_APP_JSON = 'https://raw.githubusercontent.com/MG-Trener/GEO-EMPIRE/main/apps/mobile/app.json';
const RELEASE_BASE = 'https://github.com/MG-Trener/GEO-EMPIRE/releases/download';
const APK_MIME = 'application/vnd.android.package-archive';
const CHECK_INTERVAL_MS = 60 * 1000;

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
};

type GitHubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  prerelease: boolean;
  draft: boolean;
  assets: ReleaseAsset[];
};

type AvailableUpdate = {
  version: string;
  notes: string;
  asset: ReleaseAsset;
};

type UpdateState =
  | { kind: 'hidden' }
  | { kind: 'available'; update: AvailableUpdate }
  | { kind: 'downloading'; update: AvailableUpdate; progress: number }
  | { kind: 'installing'; update: AvailableUpdate }
  | { kind: 'error'; update: AvailableUpdate; message: string };

function normalizeVersion(value: string | null | undefined): string {
  return String(value ?? '0.0.0').trim().replace(/^v/i, '').split('-')[0];
}

function versionParts(value: string): number[] {
  return normalizeVersion(value)
    .split('.')
    .map((part) => Number.parseInt(part.replace(/\D/g, ''), 10) || 0);
}

function isNewerVersion(candidate: string, current: string): boolean {
  const left = versionParts(candidate);
  const right = versionParts(current);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

function selectApk(release: GitHubRelease): ReleaseAsset | null {
  const apks = release.assets.filter((asset) => asset.name.toLowerCase().endsWith('.apk'));
  return apks.find((asset) => asset.name.toLowerCase().includes('geo-empire')) ?? apks[0] ?? null;
}

function fallbackAsset(version: string): ReleaseAsset {
  const name = `geo-empire-v${version}.apk`;
  return {
    name,
    browser_download_url: `${RELEASE_BASE}/v${version}/${name}`,
    size: 0,
    content_type: APK_MIME,
  };
}

async function discoverLatestUpdate(currentVersion: string): Promise<AvailableUpdate | null> {
  try {
    const response = await fetch(`${RELEASE_API}?t=${Date.now()}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (response.ok) {
      const release = await response.json() as GitHubRelease;
      if (!release.draft && !release.prerelease) {
        const version = normalizeVersion(release.tag_name);
        const asset = selectApk(release);
        if (asset && isNewerVersion(version, currentVersion)) {
          return {
            version,
            notes: (release.body ?? '').trim(),
            asset,
          };
        }
        if (!isNewerVersion(version, currentVersion)) return null;
      }
    }
  } catch {
    // Fall through to the raw app.json check below.
  }

  const response = await fetch(`${RAW_APP_JSON}?t=${Date.now()}`);
  if (!response.ok) throw new Error(`Проверка версии: HTTP ${response.status}`);
  const config = await response.json() as { expo?: { version?: string } };
  const version = normalizeVersion(config.expo?.version);
  if (!isNewerVersion(version, currentVersion)) return null;

  return {
    version,
    notes: 'Новая сборка GEO EMPIRE готова к установке.',
    asset: fallbackAsset(version),
  };
}

function readableBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} МБ`;
}

export function AppUpdateBanner() {
  const [state, setState] = useState<UpdateState>({ kind: 'hidden' });
  const checking = useRef(false);
  const lastCheckAt = useRef(0);
  const currentVersion = normalizeVersion(Application.nativeApplicationVersion);

  const checkForUpdate = useCallback(async (force = false) => {
    if (Platform.OS !== 'android' || checking.current) return;
    const now = Date.now();
    if (!force && now - lastCheckAt.current < CHECK_INTERVAL_MS) return;

    checking.current = true;
    lastCheckAt.current = now;
    try {
      const update = await discoverLatestUpdate(currentVersion);
      setState(update ? { kind: 'available', update } : { kind: 'hidden' });
    } catch {
      // A failed background check must not interrupt gameplay. The next timer,
      // foreground event or app restart will try both discovery sources again.
    } finally {
      checking.current = false;
    }
  }, [currentVersion]);

  useEffect(() => {
    const initial = setTimeout(() => void checkForUpdate(true), 1500);
    const interval = setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void checkForUpdate(true);
    });

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      subscription.remove();
    };
  }, [checkForUpdate]);

  const installDownloadedApk = useCallback(async (fileUri: string, update: AvailableUpdate) => {
    try {
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      setState({ kind: 'installing', update });
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: APK_MIME,
        flags: 1,
      });
      setState({ kind: 'available', update });
    } catch {
      try {
        const packageName = Application.applicationId ?? 'kz.geoempire.game';
        await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
          data: `package:${packageName}`,
        });
      } catch {
        // Some Android builds do not expose this settings screen directly.
      }
      setState({
        kind: 'error',
        update,
        message: 'Разрешите GEO EMPIRE устанавливать приложения из этого источника и нажмите «Повторить».',
      });
    }
  }, []);

  const downloadAndInstall = useCallback(async (update: AvailableUpdate) => {
    const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!directory) {
      setState({ kind: 'error', update, message: 'Не удалось открыть локальное хранилище приложения.' });
      return;
    }

    const fileUri = `${directory}geo-empire-v${update.version}.apk`;
    try {
      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
      setState({ kind: 'downloading', update, progress: 0 });

      const task = FileSystem.createDownloadResumable(
        update.asset.browser_download_url,
        fileUri,
        {},
        (progress) => {
          const total = progress.totalBytesExpectedToWrite;
          const value = total > 0 ? progress.totalBytesWritten / total : 0;
          setState({ kind: 'downloading', update, progress: Math.max(0, Math.min(1, value)) });
        },
      );
      const result = await task.downloadAsync();
      if (!result?.uri) throw new Error('APK не был загружен');
      await installDownloadedApk(result.uri, update);
    } catch (error) {
      setState({
        kind: 'error',
        update,
        message: error instanceof Error ? error.message : 'Не удалось загрузить обновление',
      });
    }
  }, [installDownloadedApk]);

  if (Platform.OS !== 'android' || state.kind === 'hidden') return null;

  const update = state.update;
  const progressPercent = state.kind === 'downloading' ? Math.round(state.progress * 100) : 0;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>ОБНОВЛЕНИЕ GEO EMPIRE</Text>
            <Text style={styles.title}>Доступна версия {update.version}</Text>
          </View>
          {update.asset.size > 0 ? <Text style={styles.size}>{readableBytes(update.asset.size)}</Text> : null}
        </View>

        {state.kind === 'downloading' ? (
          <>
            <Text style={styles.status}>Загрузка APK · {progressPercent}%</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
          </>
        ) : state.kind === 'installing' ? (
          <View style={styles.installingRow}>
            <ActivityIndicator size="small" color="#38d8ff" />
            <Text style={styles.status}>Открываем системный установщик Android…</Text>
          </View>
        ) : state.kind === 'error' ? (
          <Text style={styles.error}>{state.message}</Text>
        ) : (
          <Text style={styles.status} numberOfLines={2}>{update.notes}</Text>
        )}

        <View style={styles.actions}>
          {state.kind !== 'downloading' && state.kind !== 'installing' ? (
            <Pressable
              onPress={() => void downloadAndInstall(update)}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>{state.kind === 'error' ? 'ПОВТОРИТЬ' : 'ОБНОВИТЬ'}</Text>
            </Pressable>
          ) : null}
          {state.kind !== 'downloading' && state.kind !== 'installing' ? (
            <Pressable onPress={() => setState({ kind: 'hidden' })} style={({ pressed }) => [styles.laterButton, pressed && styles.pressed]}>
              <Text style={styles.laterText}>ПОЗЖЕ</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 78,
    left: 12,
    right: 12,
    zIndex: 100,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    padding: 11,
    borderRadius: 14,
    backgroundColor: 'rgba(4, 17, 27, 0.97)',
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.52)',
    shadowColor: '#000000',
    shadowOpacity: 0.38,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 5 },
    elevation: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1 },
  eyebrow: { color: '#38d8ff', fontSize: 7, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: '#f6d06c', fontSize: 14, fontWeight: '900', marginTop: 2 },
  size: { color: '#7f95a3', fontSize: 8, fontWeight: '800' },
  status: { color: '#aabac4', fontSize: 9, lineHeight: 13, marginTop: 6 },
  error: { color: '#e69b82', fontSize: 9, lineHeight: 13, marginTop: 6 },
  installingRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  progressTrack: { height: 5, borderRadius: 5, backgroundColor: '#19313e', overflow: 'hidden', marginTop: 7 },
  progressFill: { height: 5, borderRadius: 5, backgroundColor: '#38d8ff' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 7, marginTop: 9 },
  primaryButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 9, backgroundColor: '#d7a640' },
  primaryText: { color: '#11161d', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  laterButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: '#35515f' },
  laterText: { color: '#91a6b3', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  pressed: { opacity: 0.78 },
});
