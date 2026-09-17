import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { DEMO_PLAYER_ID, getApiUrl } from './api';

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
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} мин`;
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body
      ? String(body.error)
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export function DepositInvestigationPanel({
  depositId,
  onMessage,
}: {
  depositId: string;
  onMessage: (message: string) => void;
}) {
  const [state, setState] = useState<InvestigationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const result = await readJson<InvestigationState>(
        `${getApiUrl()}/api/v1/geology/${encodeURIComponent(DEMO_PLAYER_ID)}/deposits/${encodeURIComponent(depositId)}/investigation`,
      );
      setState(result);
    } catch (error) {
      onMessage(`Изучение месторождения: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [depositId, onMessage]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!state?.activeStudy) return undefined;
    const timer = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 5000);
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
        body: JSON.stringify({
          playerId: DEMO_PLAYER_ID,
          depositId,
          method: state.nextStudy.method,
        }),
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
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" />
        <Text style={styles.muted}>Загрузка геологической модели…</Text>
      </View>
    );
  }

  if (!state) return null;

  const confidencePercent = Math.round(state.estimates.confidence * 100);

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>МОДЕЛЬ МЕСТОРОЖДЕНИЯ</Text>
          <Text style={styles.title}>{state.stage.label}</Text>
        </View>
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceValue}>{confidencePercent}%</Text>
          <Text style={styles.confidenceLabel}>доверие</Text>
        </View>
      </View>

      <View style={styles.stageRow}>
        {Array.from({ length: state.stage.total }, (_, index) => (
          <View
            key={index}
            style={[styles.stageDot, index < state.stage.completed && styles.stageDotDone]}
          />
        ))}
      </View>

      <View style={styles.grid}>
        <Metric
          label="ЗАПАСЫ"
          value={`${formatNumber(state.estimates.quantity.min)}–${formatNumber(state.estimates.quantity.max)} ${state.deposit.resource.unit}`}
        />
        <Metric
          label="ГЛУБИНА"
          value={`${formatNumber(state.estimates.depth.fromMeters)}–${formatNumber(state.estimates.depth.toMeters)} м`}
        />
        <Metric
          label="КАЧЕСТВО"
          value={`${formatNumber(state.estimates.quality.min, 2)}–${formatNumber(state.estimates.quality.max, 2)}`}
        />
        <Metric
          label="ПЛОТНОСТЬ"
          value={state.estimates.density
            ? `${formatNumber(state.estimates.density.min, 2)}–${formatNumber(state.estimates.density.max, 2)}`
            : 'нужны полевые данные'}
        />
      </View>

      {state.completedStudies.length ? (
        <View style={styles.completedWrap}>
          {state.completedStudies.map((study) => (
            <View key={study.method} style={styles.completedChip}>
              <Text style={styles.completedText}>✓ {study.name}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {state.activeStudy ? (
        <View style={styles.activeBox}>
          <Text style={styles.activeLabel}>ИССЛЕДОВАНИЕ В РАБОТЕ</Text>
          <Text style={styles.activeTitle}>{state.activeStudy.name}</Text>
          <Text style={styles.activeTime}>
            {secondsRemaining > 0 ? `Осталось ${formatDuration(secondsRemaining)}` : 'Обработка результатов…'}
          </Text>
        </View>
      ) : state.nextStudy ? (
        <View style={styles.nextBox}>
          <Text style={styles.nextLabel}>СЛЕДУЮЩИЙ ЭТАП</Text>
          <Text style={styles.nextTitle}>{state.nextStudy.name}</Text>
          <Text style={styles.description}>{state.nextStudy.description}</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.price}>{formatNumber(state.nextStudy.cost)} ₡</Text>
            <Text style={styles.duration}>{formatDuration(state.nextStudy.durationSeconds)}</Text>
          </View>
          <Pressable
            disabled={starting || state.wallet.soft < state.nextStudy.cost}
            onPress={() => void startNext()}
            style={({ pressed }) => [
              styles.button,
              (starting || state.wallet.soft < state.nextStudy.cost) && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            {starting
              ? <ActivityIndicator color="#11161d" />
              : <Text style={styles.buttonText}>НАЧАТЬ ИССЛЕДОВАНИЕ</Text>}
          </Pressable>
          {state.wallet.soft < state.nextStudy.cost ? (
            <Text style={styles.warning}>Недостаточно средств. Баланс: {formatNumber(state.wallet.soft)} ₡</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.finalBox}>
          <Text style={styles.finalTitle}>✓ МЕСТОРОЖДЕНИЕ ОЦЕНЕНО</Text>
          <Text style={styles.description}>Геологическая модель готова для инвестиционного решения и промышленной разработки.</Text>
        </View>
      )}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 9,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(105,169,149,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(105,169,149,0.24)',
  },
  loadingRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  flex: { flex: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  eyebrow: { color: '#71a896', fontSize: 8, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: '#eef3f4', fontSize: 12, fontWeight: '800', marginTop: 2 },
  muted: { color: '#8d99a7', fontSize: 10 },
  confidenceBadge: { minWidth: 58, padding: 7, borderRadius: 10, backgroundColor: 'rgba(245,196,81,0.1)', alignItems: 'center' },
  confidenceValue: { color: '#f5c451', fontWeight: '900', fontSize: 14 },
  confidenceLabel: { color: '#8f9aa7', fontSize: 7, marginTop: 1 },
  stageRow: { flexDirection: 'row', gap: 5, marginTop: 8 },
  stageDot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#33414b' },
  stageDotDone: { backgroundColor: '#d8a640' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  metric: { width: '48%', padding: 7, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.035)' },
  metricLabel: { color: '#788692', fontSize: 7, fontWeight: '700', letterSpacing: 0.7 },
  metricValue: { color: '#cbd3d8', fontSize: 9, fontWeight: '700', marginTop: 3 },
  completedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  completedChip: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 9, backgroundColor: 'rgba(81,155,120,0.14)' },
  completedText: { color: '#8fc8ad', fontSize: 8, fontWeight: '700' },
  activeBox: { marginTop: 9, padding: 9, borderRadius: 10, backgroundColor: 'rgba(121,199,255,0.08)', borderWidth: 1, borderColor: 'rgba(121,199,255,0.2)' },
  activeLabel: { color: '#6d9ab4', fontSize: 7, fontWeight: '800', letterSpacing: 0.8 },
  activeTitle: { color: '#ccecff', fontSize: 11, fontWeight: '800', marginTop: 3 },
  activeTime: { color: '#82c3e8', fontSize: 9, marginTop: 3 },
  nextBox: { marginTop: 9, padding: 9, borderRadius: 10, backgroundColor: 'rgba(245,196,81,0.07)', borderWidth: 1, borderColor: 'rgba(245,196,81,0.18)' },
  nextLabel: { color: '#a9843d', fontSize: 7, fontWeight: '800', letterSpacing: 0.8 },
  nextTitle: { color: '#f5c451', fontSize: 12, fontWeight: '900', marginTop: 3 },
  description: { color: '#9ca8b2', fontSize: 9, lineHeight: 13, marginTop: 3 },
  price: { color: '#f5c451', fontSize: 11, fontWeight: '900', marginTop: 7 },
  duration: { color: '#8d99a7', fontSize: 9, marginTop: 7 },
  button: { minHeight: 36, borderRadius: 9, backgroundColor: '#f5c451', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { color: '#11161d', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.82 },
  warning: { color: '#d99176', fontSize: 8, marginTop: 5 },
  finalBox: { marginTop: 9, padding: 9, borderRadius: 10, backgroundColor: 'rgba(81,155,120,0.12)' },
  finalTitle: { color: '#93d1b4', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
});
