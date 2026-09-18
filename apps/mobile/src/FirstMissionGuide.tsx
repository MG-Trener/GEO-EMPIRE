import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPlayerSummary } from './api';
import { gameAssets } from './gameAssets';
import { useGameSettings } from './gameSettings';
import type { PlayerSummary } from './types';

type Props = {
  playerId: string;
  initialPlayer: PlayerSummary;
};

type Mission = {
  step: number;
  title: string;
  body: string;
  complete?: boolean;
};

function missionFor(player: PlayerSummary): Mission {
  if (player.stats.knownDeposits === 0) {
    return { step: 1, title: 'Проведите первую разведку', body: 'Выберите соседнюю ячейку на карте и запустите георазведку. Если залежей нет, исследуйте следующую.' };
  }
  if (player.stats.territories === 0) {
    return { step: 2, title: 'Оформите первый участок', body: 'Выберите свободную ячейку с перспективным ресурсом и арендуйте её для компании.' };
  }
  if (player.stats.buildings === 0) {
    return { step: 3, title: 'Начните промышленное освоение', body: 'На своём участке создайте добывающий объект и подготовьте проект к запуску.' };
  }
  return { step: 3, title: 'Первая база создана', body: 'Расширяйте разведку, осваивайте месторождения и продавайте добытые ресурсы на рынке.', complete: true };
}

function missionIcon(step: number, complete?: boolean) {
  if (complete) return gameAssets.utility.select;
  if (step === 1) return gameAssets.nav.exploration;
  if (step === 2) return gameAssets.utility.marker;
  return gameAssets.nav.construction;
}

export function FirstMissionGuide({ playerId, initialPlayer }: Props) {
  const insets = useSafeAreaInsets();
  const { settings } = useGameSettings();
  const [player, setPlayer] = useState(initialPlayer);
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const mission = useMemo(() => missionFor(player), [player]);
  const progressWidth: '33%' | '66%' | '100%' = mission.complete || mission.step >= 3 ? '100%' : mission.step === 2 ? '66%' : '33%';

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { setPlayer(await getPlayerSummary(playerId)); } catch { /* Main UI surfaces connection errors. */ } finally { setRefreshing(false); }
  }, [playerId]);

  useEffect(() => {
    if (mission.complete) return undefined;
    const timer = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(timer);
  }, [mission.complete, refresh]);

  if (hidden || !settings.showMission) return null;

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + 55 }]}>
      <View style={[styles.card, mission.complete && styles.cardComplete]}>
        <Pressable onPress={() => setExpanded((value) => !value)} style={({ pressed }) => [styles.compactHeader, pressed && styles.pressed]}>
          <Image source={missionIcon(mission.step, mission.complete)} style={styles.missionIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>{mission.complete ? 'ЭТАП ЗАВЕРШЁН' : `МИССИЯ ${mission.step}/3`}</Text>
            <Text style={styles.title} numberOfLines={1}>{mission.title}</Text>
          </View>
          <Text style={styles.expandText}>{expanded ? '▲' : '▼'}</Text>
          <Pressable onPress={() => setHidden(true)} hitSlop={8} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <Text style={styles.close}>×</Text>
          </Pressable>
        </Pressable>

        {expanded ? (
          <View style={styles.details}>
            <Text style={styles.body}>{mission.body}</Text>
            <View style={styles.footer}>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: progressWidth }]} /></View>
              {!mission.complete ? (
                <Pressable disabled={refreshing} onPress={() => void refresh()} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}>
                  <Image source={gameAssets.utility.center} style={styles.refreshIcon} resizeMode="contain" />
                  <Text style={styles.refreshText}>{refreshing ? '…' : 'ОБНОВИТЬ'}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 10, right: 10, alignItems: 'center' },
  card: { width: '100%', maxWidth: 520, backgroundColor: 'rgba(5,17,25,0.94)', borderWidth: 1, borderColor: 'rgba(77,205,218,0.25)', borderRadius: 13, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 7, overflow: 'hidden' },
  cardComplete: { borderColor: 'rgba(80,209,158,0.38)' },
  compactHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 5 },
  missionIcon: { width: 36, height: 36 },
  flex: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#54d8e5', fontSize: 7, fontWeight: '900', letterSpacing: 0.9 },
  title: { color: '#f1c45b', fontSize: 11, fontWeight: '900', marginTop: 1 },
  expandText: { color: '#6e8793', fontSize: 10, paddingHorizontal: 2 },
  closeButton: { width: 25, height: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.035)' },
  close: { color: '#7e929c', fontSize: 19, lineHeight: 21 },
  details: { paddingHorizontal: 9, paddingBottom: 8, borderTopWidth: 1, borderTopColor: 'rgba(84,216,229,0.08)' },
  body: { color: '#a9bac2', fontSize: 9, lineHeight: 13, marginTop: 7 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  progressTrack: { flex: 1, height: 3, borderRadius: 4, backgroundColor: '#1a2c35', overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 4, backgroundColor: '#d5a441' },
  refreshButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4, paddingVertical: 2 },
  refreshIcon: { width: 18, height: 18 },
  refreshText: { color: '#6ed7bf', fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  pressed: { opacity: 0.76 },
});
