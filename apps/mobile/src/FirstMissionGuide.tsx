import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { getPlayerSummary } from './api';
import { gameAssets } from './gameAssets';
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
    return { step: 1, title: 'Проведите первую разведку', body: 'Выберите ближайшую ячейку и запустите георазведку. Если залежей нет, проверьте соседнюю ячейку.' };
  }
  if (player.stats.territories === 0) {
    return { step: 2, title: 'Оформите первый участок', body: 'Выберите свободную ячейку рядом с вашей позицией и арендуйте её. Стартового капитала достаточно для первого участка.' };
  }
  if (player.stats.buildings === 0) {
    return { step: 3, title: 'Начните промышленное освоение', body: 'На своём участке постройте первый добывающий объект. После завершения строительства можно запускать добычу.' };
  }
  return { step: 3, title: 'Первая база создана', body: 'Теперь развивайте геологию, расширяйте территорию, добывайте ресурсы и продавайте их на рынке.', complete: true };
}

function missionIcon(step: number, complete?: boolean) {
  if (complete) return gameAssets.utility.select;
  if (step === 1) return gameAssets.nav.exploration;
  if (step === 2) return gameAssets.utility.marker;
  return gameAssets.nav.construction;
}

export function FirstMissionGuide({ playerId, initialPlayer }: Props) {
  const [player, setPlayer] = useState(initialPlayer);
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const mission = useMemo(() => missionFor(player), [player]);
  const progressWidth: '33%' | '66%' | '100%' = mission.complete || mission.step >= 3 ? '100%' : mission.step === 2 ? '66%' : '33%';

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { setPlayer(await getPlayerSummary(playerId)); } catch { /* App surfaces API errors. */ } finally { setRefreshing(false); }
  }, [playerId]);

  useEffect(() => {
    if (mission.complete) return undefined;
    const timer = setInterval(() => void refresh(), 12_000);
    return () => clearInterval(timer);
  }, [mission.complete, refresh]);

  if (hidden) return null;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={[styles.card, mission.complete && styles.cardComplete]}>
        <View style={styles.header}>
          <View style={styles.iconBox}>
            <Image source={missionIcon(mission.step, mission.complete)} style={styles.missionIcon} resizeMode="contain" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>{mission.complete ? 'ПЕРВЫЙ ЭТАП ЗАВЕРШЁН' : `ПЕРВАЯ МИССИЯ · ${mission.step}/3`}</Text>
            <Text style={styles.title}>{mission.title}</Text>
          </View>
          <Pressable onPress={() => setHidden(true)} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <Text style={styles.close}>×</Text>
          </Pressable>
        </View>

        <Text style={styles.body}>{mission.body}</Text>

        <View style={styles.stepRow}>
          {[1, 2, 3].map((step) => (
            <View key={step} style={styles.stepWrap}>
              <View style={[styles.stepCircle, (mission.complete || mission.step >= step) && styles.stepCircleActive]}>
                <Text style={[styles.stepNumber, (mission.complete || mission.step >= step) && styles.stepNumberActive]}>{step}</Text>
              </View>
              {step < 3 ? <View style={[styles.stepLine, (mission.complete || mission.step > step) && styles.stepLineActive]} /> : null}
            </View>
          ))}
        </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 118, left: 12, right: 12, alignItems: 'center' },
  card: { width: '100%', maxWidth: 520, backgroundColor: 'rgba(6, 18, 26, 0.97)', borderWidth: 1, borderColor: 'rgba(77, 205, 218, 0.28)', borderRadius: 15, padding: 11, shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  cardComplete: { borderColor: 'rgba(80, 209, 158, 0.45)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBox: { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,10,14,0.55)' },
  missionIcon: { width: 42, height: 42 },
  flex: { flex: 1 },
  eyebrow: { color: '#54d8e5', fontSize: 8, fontWeight: '900', letterSpacing: 1.05 },
  title: { color: '#f1c45b', fontSize: 14, fontWeight: '900', marginTop: 1 },
  closeButton: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.035)' },
  close: { color: '#7e929c', fontSize: 22, lineHeight: 24 },
  body: { color: '#a9bac2', fontSize: 10, lineHeight: 15, marginTop: 7 },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 2 },
  stepWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stepCircle: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#14252e', borderWidth: 1, borderColor: '#29414d' },
  stepCircleActive: { backgroundColor: '#184f51', borderColor: '#54d8e5' },
  stepNumber: { color: '#667985', fontSize: 8, fontWeight: '900' },
  stepNumberActive: { color: '#dffbff' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#1d3039', marginHorizontal: 4 },
  stepLineActive: { backgroundColor: '#4ad4ad' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  progressTrack: { flex: 1, height: 4, borderRadius: 4, backgroundColor: '#1a2c35', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 4, backgroundColor: '#d5a441' },
  refreshButton: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, paddingVertical: 3 },
  refreshIcon: { width: 22, height: 22 },
  refreshText: { color: '#6ed7bf', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  pressed: { opacity: 0.78 },
});
