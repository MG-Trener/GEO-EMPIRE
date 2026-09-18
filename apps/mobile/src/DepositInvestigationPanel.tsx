import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { DEMO_PLAYER_ID, getApiUrl } from './api';
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
  investigation: {
    id: string;
    method: Method;
    name: string;
    startedAt: string;
    completesAt: string;
    durationSeconds: number;
  };
  charged: number;
  wallet: { soft: number; premium: number };
};

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} сек`;
  return `${Math.ceil(seconds / 60)} мин`;
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

export function DepositInvestigationPanel({ depositId, onMessage }: { depositId: string; onMessage: (message: string) => void }) {
  const [state, setState] = useState<InvestigationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const result = await readJson<InvestigationState>(`${getApiUrl()}/api/v1/geology/${encodeURIComponent(DEMO_PLAYER_ID)}/deposits/${encodeURIComponent(depositId)}/investigation`);
      setState(result);
    } catch (error) {
      onMessage(`Изучение месторождения: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [depositId, onMessage]);

  useEffect(() => { setLoading(true); void refresh(); }, [refresh]);

  useEffect(() => {
    if (!state?.activeStudy) return undefined;
    const timer = setInterval(() => { setNow(Date.now()); void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [refresh, state?.activeStudy]);

  useEffect(() => {
    if (!state?.activeStudy) return undefined;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [state?.activeStudy]);

  const secondsRemaining = useMemo(() => {
    if (!state?.activeStudy) return 0;
    return Math.max(0, Math.ceil((new Date(state.activeStudy.completesAt).getTime() - now) / 1000));
  }, [now, state?.activeStudy]);

  const startNext = useCallback(async () => {
    if (!state?.nextStudy || state.activeStudy) return;
    setStarting(true);
    try {
      const result = await readJson<StartResponse>(`${getApiUrl()}/api/v1/geology/investigations/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: DEMO_PLAYER_ID, depositId, method: state.nextStudy.method }),
      });
      onMessage(`${result.investigation.name} запущена · списано ${formatNumber(result.charged)} ₡`);
      await refresh();
    } catch (error) {
      onMessage(`Исследование: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setStarting(false);
    }
  }, [depositId, onMessage, refresh, state]);

  if (loading && !state) {
    return <View style={styles.loadingRow}><ActivityIndicator size="small" /><Text style={styles.muted}>Загрузка геологической модели…</Text></View>;
  }
  if (!state) return null;

  const confidencePercent = Math.round(state.estimates.confidence * 100);
  const nextStudy = state.nextStudy;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLead}>
          <Image source={resourceIconForCode(state.deposit.resource.code)} style={styles.resourceIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>МОДЕЛЬ МЕСТОРОЖДЕНИЯ</Text>
            <Text style={styles.title}>{state.stage.label}</Text>
          </View>
        </View>
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceValue}>{confidencePercent}%</Text>
          <Text style={styles.confidenceLabel}>достоверность</Text>
        </View>
      </View>

      <View style={styles.stageHeader}>
        <Text style={styles.stageText}>ЭТАП {state.stage.completed}/{state.stage.total}</Text>
        <Text style={styles.stageText}>{state.deposit.resource.name}</Text>
      </View>
      <View style={styles.stageRow}>
        {Array.from({ length: state.stage.total }, (_, index) => <View key={index} style={[styles.stageDot, index < state.stage.completed && styles.stageDotDone]} />)}
      </View>

      <View style={styles.grid}>
        <Metric label="ЗАПАСЫ" value={`${formatNumber(state.estimates.quantity.min)}–${formatNumber(state.estimates.quantity.max)} ${state.deposit.resource.unit}`} />
        <Metric label="ГЛУБИНА" value={`${formatNumber(state.estimates.depth.fromMeters)}–${formatNumber(state.estimates.depth.toMeters)} м`} />
        <Metric label="КАЧЕСТВО" value={`${formatNumber(state.estimates.quality.min, 2)}–${formatNumber(state.estimates.quality.max, 2)}`} />
        <Metric label="ПЛОТНОСТЬ" value={state.estimates.density ? `${formatNumber(state.estimates.density.min, 2)}–${formatNumber(state.estimates.density.max, 2)}` : 'нужны полевые данные'} />
      </View>

      {state.completedStudies.length ? (
        <View style={styles.completedWrap}>
          {state.completedStudies.map((study) => <View key={study.method} style={styles.completedChip}><Text style={styles.completedText}>✓ {study.name}</Text></View>)}
        </View>
      ) : null}

      {state.activeStudy ? (
        <View style={styles.activeBox}>
          <Image source={gameAssets.actions.researchSection} style={styles.studyIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <Text style={styles.activeLabel}>ИССЛЕДОВАНИЕ В РАБОТЕ</Text>
            <Text style={styles.activeTitle}>{state.activeStudy.name}</Text>
            <Text style={styles.activeTime}>{secondsRemaining > 0 ? `Осталось ${formatDuration(secondsRemaining)}` : 'Обработка результатов…'}</Text>
          </View>
        </View>
      ) : nextStudy ? (
        <View style={styles.nextBox}>
          <View style={styles.nextHeader}>
            <Image source={gameAssets.actions.research} style={styles.studyIcon} resizeMode="contain" />
            <View style={styles.flex}>
              <Text style={styles.nextLabel}>СЛЕДУЮЩИЙ ЭТАП</Text>
              <Text style={styles.nextTitle}>{nextStudy.name}</Text>
            </View>
          </View>
          <Text style={styles.description}>{nextStudy.description}</Text>
          <View style={styles.costRow}>
            <View><Text style={styles.costLabel}>СТОИМОСТЬ</Text><Text style={styles.price}>{formatNumber(nextStudy.cost)} ₡</Text></View>
            <View style={styles.costRight}><Text style={styles.costLabel}>ВРЕМЯ</Text><Text style={styles.duration}>{formatDuration(nextStudy.durationSeconds)}</Text></View>
          </View>
          <Pressable disabled={starting || state.wallet.soft < nextStudy.cost} onPress={() => void startNext()} style={({ pressed }) => [styles.button, (starting || state.wallet.soft < nextStudy.cost) && styles.buttonDisabled, pressed && styles.buttonPressed]}>
            {starting ? <ActivityIndicator color="#071116" /> : <><Image source={gameAssets.actions.research} style={styles.buttonIcon} resizeMode="contain" /><Text style={styles.buttonText}>НАЧАТЬ ИССЛЕДОВАНИЕ</Text></>}
          </Pressable>
          {state.wallet.soft < nextStudy.cost ? <Text style={styles.warning}>Недостаточно средств. Баланс: {formatNumber(state.wallet.soft)} ₡</Text> : null}
        </View>
      ) : (
        <View style={styles.finalBox}>
          <Image source={gameAssets.utility.select} style={styles.finalIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <Text style={styles.finalTitle}>МЕСТОРОЖДЕНИЕ ОЦЕНЕНО</Text>
            <Text style={styles.description}>Геологическая модель готова для инвестиционного решения и промышленной разработки.</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 9, padding: 10, borderRadius: 13, backgroundColor: 'rgba(8,22,30,0.94)', borderWidth: 1, borderColor: 'rgba(78,205,218,0.22)' },
  loadingRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  headerLead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  resourceIcon: { width: 44, height: 44 },
  eyebrow: { color: '#4ed3df', fontSize: 8, fontWeight: '900', letterSpacing: 1.05 },
  title: { color: '#eef5f7', fontSize: 12, fontWeight: '900', marginTop: 1 },
  muted: { color: '#8697a1', fontSize: 10 },
  confidenceBadge: { minWidth: 62, padding: 7, borderRadius: 10, backgroundColor: 'rgba(37,82,92,0.42)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(78,211,223,0.18)' },
  confidenceValue: { color: '#5ee2ec', fontWeight: '900', fontSize: 14 },
  confidenceLabel: { color: '#768b95', fontSize: 6, marginTop: 1 },
  stageHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  stageText: { color: '#687c87', fontSize: 6, fontWeight: '900' },
  stageRow: { flexDirection: 'row', gap: 5, marginTop: 4 },
  stageDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#263943' },
  stageDotDone: { backgroundColor: '#4fd4ad' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  metric: { width: '48%', padding: 7, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.035)' },
  metricLabel: { color: '#71858f', fontSize: 6, fontWeight: '800', letterSpacing: 0.65 },
  metricValue: { color: '#d0dce0', fontSize: 9, fontWeight: '800', marginTop: 3 },
  completedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  completedChip: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 9, backgroundColor: 'rgba(61,150,112,0.16)' },
  completedText: { color: '#82d4b2', fontSize: 7, fontWeight: '800' },
  activeBox: { marginTop: 9, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: 'rgba(32,75,94,0.42)', borderWidth: 1, borderColor: 'rgba(89,196,242,0.2)' },
  studyIcon: { width: 42, height: 42 },
  activeLabel: { color: '#75bde2', fontSize: 7, fontWeight: '900', letterSpacing: 0.75 },
  activeTitle: { color: '#d0efff', fontSize: 11, fontWeight: '900', marginTop: 2 },
  activeTime: { color: '#86c8e9', fontSize: 9, marginTop: 2 },
  nextBox: { marginTop: 9, padding: 9, borderRadius: 10, backgroundColor: 'rgba(51,38,15,0.7)', borderWidth: 1, borderColor: 'rgba(235,180,64,0.2)' },
  nextHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nextLabel: { color: '#a98339', fontSize: 7, fontWeight: '900', letterSpacing: 0.75 },
  nextTitle: { color: '#efb943', fontSize: 12, fontWeight: '900', marginTop: 2 },
  description: { color: '#96a5ad', fontSize: 9, lineHeight: 13, marginTop: 3 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  costRight: { alignItems: 'flex-end' },
  costLabel: { color: '#6c7e87', fontSize: 6, fontWeight: '900' },
  price: { color: '#efb943', fontSize: 11, fontWeight: '900', marginTop: 1 },
  duration: { color: '#bac7cc', fontSize: 10, fontWeight: '800', marginTop: 1 },
  button: { minHeight: 37, flexDirection: 'row', gap: 6, borderRadius: 9, backgroundColor: '#efb943', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonIcon: { width: 28, height: 28 },
  buttonText: { color: '#071116', fontSize: 9, fontWeight: '900', letterSpacing: 0.45 },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.8 },
  warning: { color: '#dc8e68', fontSize: 8, marginTop: 5 },
  finalBox: { marginTop: 9, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: 'rgba(56,138,103,0.18)' },
  finalIcon: { width: 34, height: 34 },
  finalTitle: { color: '#80d4ae', fontSize: 9, fontWeight: '900', letterSpacing: 0.45 },
});
