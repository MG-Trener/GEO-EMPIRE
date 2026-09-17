import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getPlayerSummary } from './api';
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
    return {
      step: 1,
      title: 'Проведите первую разведку',
      body: 'Выберите ближайшую ячейку и запустите георазведку. Если залежей нет, проверьте соседнюю ячейку.',
    };
  }

  if (player.stats.territories === 0) {
    return {
      step: 2,
      title: 'Оформите первый участок',
      body: 'Выберите свободную ячейку рядом с вашей позицией и арендуйте её. Стартового капитала достаточно для первого участка.',
    };
  }

  if (player.stats.buildings === 0) {
    return {
      step: 3,
      title: 'Начните промышленное освоение',
      body: 'На своём участке постройте первый добывающий объект. После завершения строительства можно запускать добычу.',
    };
  }

  return {
    step: 3,
    title: 'Первая база создана',
    body: 'Теперь развивайте геологию, расширяйте территорию, добывайте ресурсы и продавайте их на рынке.',
    complete: true,
  };
}

export function FirstMissionGuide({ playerId, initialPlayer }: Props) {
  const [player, setPlayer] = useState(initialPlayer);
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const mission = useMemo(() => missionFor(player), [player]);
  const progressWidth: '33%' | '66%' | '100%' = mission.complete || mission.step >= 3
    ? '100%'
    : mission.step === 2
      ? '66%'
      : '33%';

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setPlayer(await getPlayerSummary(playerId));
    } catch {
      // The game itself already surfaces API connectivity errors.
    } finally {
      setRefreshing(false);
    }
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
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>{mission.complete ? 'ПЕРВЫЙ ЭТАП ЗАВЕРШЁН' : `ПЕРВАЯ МИССИЯ · ${mission.step}/3`}</Text>
            <Text style={styles.title}>{mission.title}</Text>
          </View>
          <Pressable onPress={() => setHidden(true)} style={styles.closeButton}>
            <Text style={styles.close}>×</Text>
          </Pressable>
        </View>

        <Text style={styles.body}>{mission.body}</Text>

        <View style={styles.footer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          {!mission.complete ? (
            <Pressable disabled={refreshing} onPress={() => void refresh()} style={styles.refreshButton}>
              <Text style={styles.refreshText}>{refreshing ? '…' : 'ОБНОВИТЬ'}</Text>
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
    top: 118,
    left: 12,
    right: 12,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: 'rgba(8, 20, 28, 0.96)',
    borderWidth: 1,
    borderColor: '#34505a',
    borderRadius: 14,
    padding: 13,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  cardComplete: { borderColor: '#617542' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  flex: { flex: 1 },
  eyebrow: { color: '#77b39d', fontSize: 9, fontWeight: '900', letterSpacing: 1.25 },
  title: { color: '#f3cf76', fontSize: 16, fontWeight: '900', marginTop: 2 },
  closeButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  close: { color: '#7e929c', fontSize: 24, lineHeight: 26 },
  body: { color: '#adbdc4', fontSize: 11, lineHeight: 16, marginTop: 7 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  progressTrack: { flex: 1, height: 4, borderRadius: 4, backgroundColor: '#1d3039', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 4, backgroundColor: '#d5a441' },
  refreshButton: { paddingHorizontal: 8, paddingVertical: 5 },
  refreshText: { color: '#7fb8a5', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
});
