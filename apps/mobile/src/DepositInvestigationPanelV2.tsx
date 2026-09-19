import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { DEMO_PLAYER_ID, getApiUrl } from './api';
import { countdownParts, formatResearchClock } from './apiTime';
import { gameAssets, resourceIconForCode } from './gameAssets';

type Method = 'geophysics' | 'seismic' | 'drilling' | 'assessment';

type InvestigationState = {
  deposit: {
    id: string;
    h3Index: string;
    resource: { code: string; name: string; unit: string; rarity: number };
  };
  estimates: {
    quantity: { min: number; max: number };
    depth: { fromMeters: number; toMeters: number };
    quality: { min: number; max: number };
    density: { min: number; max: number } | null;
    confidence: number;
  };
  completedStudies: Array<{ method: Method; name: string; completedAt: string }>;
  activeStudy: null | {
    id: string;
    method: Method;
    name: string;
    startedAt: string;
    completesAt: string;
    durationSeconds: number;
  };
  nextStudy: null | {
    method: Method;
    name: string;
    description: string;
    cost: number;
    durationSeconds: number;
  };
  wallet: { soft: number; premium: number };
  stage: { completed: number; total: number; label: string };
};

type StartResponse = {
  status: 'running';
  investigation: NonNullable<InvestigationState['activeStudy']>;
  charged: number;
};

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} сек`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} мин`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  return `${hours} ч ${minutes} мин`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export function DepositInvestigationPanel({ depositId, onMessage }: { depositId: string; onMessage: (message: string) => void }) {
  const [state, setState] = useState<InvestigationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const next = await requestJson<InvestigationState>(
        `${getApiUrl()}/api/v1/geology/${encodeURIComponent(DEMO_PLAYER_ID)}/deposits/${encodeURIComponent(depositId)}/investigation`,
      );
      setState(next);
      setNow(Date.now());
    } catch (error) {
      onMessage(`Исследование месторождения: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [depositId, onMessage]);

  useEffect(() => { setLoading(true); void refresh(); }, [refresh]);

  useEffect(() => {
    if (!state?.activeStudy) return undefined;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => void refresh(), 4000);
    return () => { clearInterval(clock); clearInterval(poll); };
  }, [refresh, state?.activeStudy]);

  const timing = useMemo(() => {
    const active = state?.activeStudy;
    return active ? countdownParts(active.startedAt, active.completesAt, now) : null;
  }, [now, state?.activeStudy]);

  useEffect(() => {
    if (!state?.activeStudy || !timing?.valid || timing.remainingSeconds > 0) return;
    const timer = setTimeout(() => void refresh(), 500);
    return () => clearTimeout(timer);
  }, [refresh, state?.activeStudy, timing?.remainingSeconds, timing?.valid]);

  const startNext = useCallback(async () => {
    if (!state?.nextStudy || state.activeStudy) return;
    setStarting(true);
    try {
      const result = await requestJson<StartResponse>(`${getApiUrl()}/api/v1/geology/investigations/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          playerId: DEMO_PLAYER_ID,
          depositId,
          method: state.nextStudy.method,
        }),
      });
      onMessage(`${result.investigation.name}: исследование запущено · ${formatResearchClock(result.investigation.durationSeconds)}`);
      await refresh();
    } catch (error) {
      onMessage(`Исследование: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setStarting(false);
    }
  }, [depositId, onMessage, refresh, state]);

  if (loading && !state) {
    return <View style={styles.loading}><ActivityIndicator color="#38d8ff" /><Text style={styles.muted}>Загрузка геологической модели…</Text></View>;
  }
  if (!state) return null;

  const active = state.activeStudy;
  const next = state.nextStudy;
  const confidence = Math.round(state.estimates.confidence * 100);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Image source={resourceIconForCode(state.deposit.resource.code)} style={styles.resourceIcon} resizeMode="contain" />
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>МОДЕЛЬ МЕСТОРОЖДЕНИЯ</Text>
          <Text style={styles.title}>{state.deposit.resource.name}</Text>
          <Text style={styles.h3} numberOfLines={1}>{state.deposit.h3Index}</Text>
        </View>
        <View style={styles.confidence}><Text style={styles.confidenceValue}>{confidence}%</Text><Text style={styles.confidenceLabel}>достоверность</Text></View>
      </View>

      <View style={styles.stageHeader}>
        <Text style={styles.stageText}>ИССЛЕДОВАНО {state.stage.completed}/{state.stage.total}</Text>
        <Text style={styles.stageText}>{state.stage.label}</Text>
      </View>
      <View style={styles.stageRow}>
        {Array.from({ length: state.stage.total }, (_, index) => (
          <View key={index} style={[styles.stageDot, index < state.stage.completed && styles.stageDone]} />
        ))}
      </View>

      <View style={styles.grid}>
        <Metric label="ЗАПАСЫ" value={`${formatNumber(state.estimates.quantity.min)}–${formatNumber(state.estimates.quantity.max)} ${state.deposit.resource.unit}`} />
        <Metric label="ГЛУБИНА" value={`${formatNumber(state.estimates.depth.fromMeters)}–${formatNumber(state.estimates.depth.toMeters)} м`} />
        <Metric label="КАЧЕСТВО" value={`${formatNumber(state.estimates.quality.min, 2)}–${formatNumber(state.estimates.quality.max, 2)}`} />
        <Metric label="ПЛОТНОСТЬ" value={state.estimates.density ? `${formatNumber(state.estimates.density.min, 2)}–${formatNumber(state.estimates.density.max, 2)}` : 'нужны данные'} />
      </View>

      {active ? (
        <View style={styles.activeBox}>
          <Image source={gameAssets.actions.researchSection} style={styles.studyIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <View style={styles.activeHeader}>
              <View style={styles.flex}>
                <Text style={styles.activeLabel}>ИССЛЕДОВАНИЕ ИДЁТ</Text>
                <Text style={styles.activeTitle}>{active.name}</Text>
              </View>
              <Text style={styles.clock}>{timing?.valid ? formatResearchClock(timing.remainingSeconds) : 'СИНХР.'}</Text>
            </View>
            <View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.round((timing?.progress ?? 0) * 100)}%` }]} /></View>
            <Text style={styles.activeHint}>{timing?.valid ? `Готово ${Math.round(timing.progress * 100)}% · новый результат появится после окончания таймера` : 'Синхронизация времени с сервером…'}</Text>
          </View>
        </View>
      ) : next ? (
        <View style={styles.nextBox}>
          <View style={styles.nextHeader}>
            <Image source={gameAssets.actions.research} style={styles.studyIcon} resizeMode="contain" />
            <View style={styles.flex}><Text style={styles.nextLabel}>СЛЕДУЮЩЕЕ ИССЛЕДОВАНИЕ</Text><Text style={styles.nextTitle}>{next.name}</Text></View>
          </View>
          <Text style={styles.description}>{next.description}</Text>
          <View style={styles.costRow}>
            <View><Text style={styles.smallLabel}>СТОИМОСТЬ</Text><Text style={styles.price}>{formatNumber(next.cost)} ₡</Text></View>
            <View style={styles.right}><Text style={styles.smallLabel}>ВРЕМЯ</Text><Text style={styles.duration}>{formatDuration(next.durationSeconds)}</Text></View>
          </View>
          <Pressable disabled={starting || state.wallet.soft < next.cost} onPress={() => void startNext()} style={[styles.button, (starting || state.wallet.soft < next.cost) && styles.disabled]}>
            {starting ? <ActivityIndicator color="#071116" /> : <Text style={styles.buttonText}>НАЧАТЬ ИССЛЕДОВАНИЕ</Text>}
          </Pressable>
        </View>
      ) : (
        <View style={styles.completeBox}>
          <Image source={gameAssets.utility.select} style={styles.completeIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <Text style={styles.completeTitle}>ИССЛЕДОВАНИЕ 4/4 ЗАВЕРШЕНО</Text>
            <Text style={styles.description}>Геологическая модель готова. Следующий шаг — проверить право на участок и только после этого запускать промышленный проект.</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.smallLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 9, padding: 10, borderRadius: 13, backgroundColor: 'rgba(8,22,30,0.96)', borderWidth: 1, borderColor: 'rgba(78,205,218,0.22)' },
  loading: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  muted: { color: '#8697a1', fontSize: 10 },
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resourceIcon: { width: 44, height: 44 },
  eyebrow: { color: '#4ed3df', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#eef5f7', fontSize: 12, fontWeight: '900' },
  h3: { color: '#687c87', fontSize: 6.5, marginTop: 1 },
  confidence: { minWidth: 62, padding: 7, borderRadius: 10, backgroundColor: 'rgba(37,82,92,0.42)', alignItems: 'center' },
  confidenceValue: { color: '#5ee2ec', fontWeight: '900', fontSize: 14 },
  confidenceLabel: { color: '#768b95', fontSize: 6 },
  stageHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  stageText: { color: '#687c87', fontSize: 6, fontWeight: '900' },
  stageRow: { flexDirection: 'row', gap: 5, marginTop: 4 },
  stageDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#263943' },
  stageDone: { backgroundColor: '#4fd4ad' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  metric: { width: '48%', padding: 7, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.035)' },
  smallLabel: { color: '#71858f', fontSize: 6, fontWeight: '900' },
  metricValue: { color: '#d0dce0', fontSize: 9, fontWeight: '800', marginTop: 3 },
  studyIcon: { width: 42, height: 42 },
  activeBox: { marginTop: 9, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: 'rgba(32,75,94,0.45)', borderWidth: 1, borderColor: 'rgba(89,196,242,0.28)' },
  activeHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  activeLabel: { color: '#75bde2', fontSize: 7, fontWeight: '900' },
  activeTitle: { color: '#d0efff', fontSize: 11, fontWeight: '900', marginTop: 2 },
  clock: { color: '#6fe1ff', fontSize: 15, fontWeight: '900' },
  progress: { height: 6, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 6 },
  progressFill: { height: '100%', backgroundColor: '#55d7f2' },
  activeHint: { color: '#86c8e9', fontSize: 7.5, marginTop: 4 },
  nextBox: { marginTop: 9, padding: 9, borderRadius: 10, backgroundColor: 'rgba(51,38,15,0.72)', borderWidth: 1, borderColor: 'rgba(235,180,64,0.22)' },
  nextHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nextLabel: { color: '#a98339', fontSize: 7, fontWeight: '900' },
  nextTitle: { color: '#efb943', fontSize: 12, fontWeight: '900', marginTop: 2 },
  description: { color: '#96a5ad', fontSize: 9, lineHeight: 13, marginTop: 3 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  right: { alignItems: 'flex-end' },
  price: { color: '#efb943', fontSize: 11, fontWeight: '900' },
  duration: { color: '#d9e2e6', fontSize: 10, fontWeight: '900' },
  button: { minHeight: 38, marginTop: 8, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#efb943' },
  buttonText: { color: '#071116', fontSize: 8, fontWeight: '900' },
  disabled: { opacity: 0.42 },
  completeBox: { marginTop: 9, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: 'rgba(35,91,64,0.35)', borderWidth: 1, borderColor: 'rgba(77,214,157,0.22)' },
  completeIcon: { width: 38, height: 38 },
  completeTitle: { color: '#65d9aa', fontSize: 9, fontWeight: '900' },
});
