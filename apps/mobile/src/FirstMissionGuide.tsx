import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiUrl } from './api';
import { gameAssets } from './gameAssets';
import { useGameSettings } from './gameSettings';
import type { PlayerSummary } from './types';

type Props = {
  playerId: string;
  initialPlayer: PlayerSummary;
};

type Mission = {
  step: number;
  total: number;
  code: string;
  title: string;
  body: string;
  rewardSoft: number;
  completed: boolean;
  claimed: boolean;
  unlocked: boolean;
  claimable: boolean;
};

type MissionCatalog = {
  playerId: string;
  missions: Mission[];
  currentCode: string | null;
  allClaimed: boolean;
  walletSoft: number;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

function missionIcon(step: number) {
  if (step === 1) return gameAssets.nav.exploration;
  if (step === 2) return gameAssets.utility.marker;
  if (step === 3) return gameAssets.nav.construction;
  if (step === 4) return gameAssets.actions.extract;
  if (step === 5) return gameAssets.nav.technologies;
  return gameAssets.nav.trade;
}

export function FirstMissionGuide({ playerId }: Props) {
  const insets = useSafeAreaInsets();
  const { settings } = useGameSettings();
  const [catalog, setCatalog] = useState<MissionCatalog | null>(null);
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await readJson<MissionCatalog>(
        `${getApiUrl()}/api/v1/players/${encodeURIComponent(playerId)}/missions`,
      );
      setCatalog(result);
    } catch {
      // Mission guidance is optional; main UI surfaces connection problems.
    } finally {
      setRefreshing(false);
    }
  }, [playerId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (catalog?.allClaimed) return undefined;
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [catalog?.allClaimed, refresh]);

  const mission = useMemo(() => {
    if (!catalog || catalog.allClaimed) return null;
    return catalog.missions.find((item) => item.code === catalog.currentCode)
      ?? catalog.missions.find((item) => !item.claimed)
      ?? null;
  }, [catalog]);

  const claim = useCallback(async () => {
    if (!mission?.claimable || claiming) return;
    setClaiming(true);
    try {
      await readJson(`${getApiUrl()}/api/v1/players/${encodeURIComponent(playerId)}/missions/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ missionCode: mission.code }),
      });
      setExpanded(false);
      await refresh();
    } catch {
      await refresh();
    } finally {
      setClaiming(false);
    }
  }, [claiming, mission, playerId, refresh]);

  if (!settings.showMission || hidden || catalog?.allClaimed || !mission) return null;

  const completedSteps = mission.step - 1 + (mission.completed ? 1 : 0);
  const progress = Math.max(0, Math.min(1, completedSteps / Math.max(1, mission.total)));

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + 55 }]}>
      <View style={[styles.card, mission.claimable && styles.cardReward]}>
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          style={({ pressed }) => [styles.compactHeader, pressed && styles.pressed]}
        >
          <Image source={missionIcon(mission.step)} style={styles.missionIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <Text style={[styles.eyebrow, mission.claimable && styles.eyebrowReward]}>
              {mission.claimable ? 'НАГРАДА ГОТОВА' : `ЗАДАНИЕ ${mission.step}/${mission.total}`}
            </Text>
            <Text style={styles.title} numberOfLines={1}>{mission.title}</Text>
          </View>
          {mission.claimable ? <Text style={styles.rewardCompact}>+{formatNumber(mission.rewardSoft)} ₡</Text> : null}
          <Text style={styles.expandText}>{expanded ? '▲' : '▼'}</Text>
          <Pressable onPress={() => setHidden(true)} hitSlop={8} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <Text style={styles.close}>×</Text>
          </Pressable>
        </Pressable>

        {expanded ? (
          <View style={styles.details}>
            <Text style={styles.body}>{mission.body}</Text>
            <View style={styles.rewardRow}>
              <Text style={styles.rewardLabel}>НАГРАДА</Text>
              <Text style={styles.rewardValue}>+{formatNumber(mission.rewardSoft)} ₡</Text>
            </View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} /></View>
            <View style={styles.footer}>
              {mission.claimable ? (
                <Pressable disabled={claiming} onPress={() => void claim()} style={({ pressed }) => [styles.claimButton, pressed && styles.pressed]}>
                  {claiming ? <ActivityIndicator size="small" color="#06120d" /> : (
                    <>
                      <Image source={gameAssets.utility.select} style={styles.claimIcon} resizeMode="contain" />
                      <Text style={styles.claimText}>ПОЛУЧИТЬ НАГРАДУ</Text>
                    </>
                  )}
                </Pressable>
              ) : (
                <Pressable disabled={refreshing} onPress={() => void refresh()} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}>
                  <Image source={gameAssets.utility.center} style={styles.refreshIcon} resizeMode="contain" />
                  <Text style={styles.refreshText}>{refreshing ? 'ПРОВЕРЯЮ…' : 'ПРОВЕРИТЬ ПРОГРЕСС'}</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 10, right: 10, alignItems: 'center' },
  card: { width: '100%', maxWidth: 520, backgroundColor: 'rgba(5,17,25,0.95)', borderWidth: 1, borderColor: 'rgba(77,205,218,0.28)', borderRadius: 13, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 7, overflow: 'hidden' },
  cardReward: { borderColor: 'rgba(80,209,158,0.65)' },
  compactHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 5 },
  missionIcon: { width: 36, height: 36 },
  flex: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#54d8e5', fontSize: 7, fontWeight: '900', letterSpacing: 0.9 },
  eyebrowReward: { color: '#57e2a4' },
  title: { color: '#f1c45b', fontSize: 11, fontWeight: '900', marginTop: 1 },
  rewardCompact: { color: '#63e4aa', fontSize: 8, fontWeight: '900' },
  expandText: { color: '#6e8793', fontSize: 10, paddingHorizontal: 2 },
  closeButton: { width: 25, height: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.035)' },
  close: { color: '#7e929c', fontSize: 19, lineHeight: 21 },
  details: { paddingHorizontal: 9, paddingBottom: 9, borderTopWidth: 1, borderTopColor: 'rgba(84,216,229,0.08)' },
  body: { color: '#a9bac2', fontSize: 9, lineHeight: 13, marginTop: 7 },
  rewardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  rewardLabel: { color: '#718b98', fontSize: 6.5, fontWeight: '900', letterSpacing: 0.7 },
  rewardValue: { color: '#61dda5', fontSize: 10, fontWeight: '900' },
  progressTrack: { height: 4, borderRadius: 4, backgroundColor: '#1a2c35', overflow: 'hidden', marginTop: 6 },
  progressFill: { height: 4, borderRadius: 4, backgroundColor: '#d5a441' },
  footer: { marginTop: 8 },
  refreshButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 8, backgroundColor: 'rgba(20,70,84,0.52)', borderWidth: 1, borderColor: 'rgba(77,205,218,0.26)' },
  refreshIcon: { width: 20, height: 20 },
  refreshText: { color: '#83daca', fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  claimButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 9, backgroundColor: '#56d89c' },
  claimIcon: { width: 23, height: 23 },
  claimText: { color: '#07140f', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.45 },
  pressed: { opacity: 0.76 },
});
