import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { DEMO_PLAYER_ID, getApiUrl } from './api';
import type { ProjectFinancingOfferResponse, ProjectLoan } from './types';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн ₡`;
  if (value >= 1_000) return `${formatNumber(Math.round(value / 1_000))} тыс. ₡`;
  return `${formatNumber(value)} ₡`;
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

export function ProjectFinancingPanel({
  projectId,
  onMessage,
  onChanged,
}: {
  projectId: string;
  onMessage?: (message: string) => void;
  onChanged?: () => Promise<void> | void;
}) {
  const [data, setData] = useState<ProjectFinancingOfferResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestJson<ProjectFinancingOfferResponse>(
        `${getApiUrl()}/api/v1/financing/${encodeURIComponent(DEMO_PLAYER_ID)}/projects/${encodeURIComponent(projectId)}/offer`,
      );
      setData(result);
    } catch (error) {
      onMessage?.(`Финансирование: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [onMessage, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const accept = useCallback(async () => {
    if (!data?.offer.eligible) return;
    const amount = data.offer.recommendedLoan > 0
      ? data.offer.recommendedLoan
      : Math.min(data.offer.maxLoan, data.offer.recommendedWorkingCapital);
    if (amount < 10_000) return;

    setAccepting(true);
    try {
      const result = await requestJson<{ loan: ProjectLoan; wallet: { soft: number } }>(
        `${getApiUrl()}/api/v1/financing/loans`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ playerId: DEMO_PLAYER_ID, projectId, amount }),
        },
      );
      onMessage?.(`Проектный кредит получен · +${formatMoney(result.loan.principal)} · долг ${formatMoney(result.loan.totalDue)}`);
      await Promise.resolve(onChanged?.());
      await refresh();
    } catch (error) {
      onMessage?.(`Кредит: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setAccepting(false);
    }
  }, [data, onChanged, onMessage, projectId, refresh]);

  if (loading && !data) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" />
        <Text style={styles.muted}>Оценка проекта банком…</Text>
      </View>
    );
  }
  if (!data) return null;

  if (data.existingLoan) {
    const loan = data.existingLoan;
    return (
      <View style={styles.loanBox}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>ПРОЕКТНЫЙ КРЕДИТ</Text>
            <Text style={styles.title}>{loan.status === 'repaid' ? 'Кредит погашен' : 'Финансирование активно'}</Text>
          </View>
          <Text style={styles.outstanding}>{formatMoney(loan.outstanding)}</Text>
        </View>
        <Text style={styles.detail}>Получено: {formatMoney(loan.principal)} · всего к возврату: {formatMoney(loan.totalDue)}</Text>
        <Text style={styles.detail}>Автопогашение: {Math.round(loan.repaymentShare * 100)}% от продаж · ставка {Math.round(loan.annualInterestRate * 1000) / 10}%</Text>
      </View>
    );
  }

  const offer = data.offer;
  if (!offer.eligible) {
    return (
      <View style={styles.unavailableBox}>
        <Text style={styles.unavailableTitle}>Финансирование пока недоступно</Text>
        <Text style={styles.muted}>Банк требует актуальный план с достоверностью геологии от 85%, положительной ценностью и приемлемой окупаемостью.</Text>
      </View>
    );
  }

  const amount = offer.recommendedLoan > 0 ? offer.recommendedLoan : Math.min(offer.maxLoan, offer.recommendedWorkingCapital);
  return (
    <View style={styles.offerBox}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>БАНК · ПРОЕКТНОЕ ФИНАНСИРОВАНИЕ</Text>
          <Text style={styles.title}>Предложение для проекта</Text>
        </View>
        <Text style={styles.limit}>{Math.round(offer.coverageRatio * 100)}%</Text>
      </View>

      <View style={styles.metrics}>
        <Metric label="CAPEX" value={formatMoney(offer.capex)} />
        <Metric label="РЕЗЕРВ OPEX · 48Ч" value={formatMoney(offer.recommendedWorkingCapital)} />
        <Metric label="ЛИМИТ БАНКА" value={formatMoney(offer.maxLoan)} />
        <Metric label="РЕКОМЕНДОВАНО" value={formatMoney(amount)} />
        <Metric label="СТАВКА" value={`${Math.round(offer.annualInterestRate * 1000) / 10}%`} />
        <Metric label="С ПРОДАЖ" value={`${Math.round(offer.repaymentShare * 100)}%`} />
      </View>

      <Text style={styles.explanation}>
        В расчёт входит двухсуточный запас средств на эксплуатацию. Погашение будет автоматически удерживаться из выручки на товарной бирже.
      </Text>

      <Pressable
        disabled={accepting || amount < 10_000}
        onPress={() => void accept()}
        style={({ pressed }) => [styles.button, (accepting || amount < 10_000) && styles.disabled, pressed && styles.pressed]}
      >
        {accepting
          ? <ActivityIndicator color="#101317" />
          : <Text style={styles.buttonText}>ПОЛУЧИТЬ ФИНАНСИРОВАНИЕ · {formatMoney(amount)}</Text>}
      </Pressable>
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
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  flex: { flex: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  muted: { color: '#85939e', fontSize: 8, lineHeight: 12 },
  offerBox: { padding: 10, borderRadius: 11, backgroundColor: 'rgba(121,199,255,0.07)', borderWidth: 1, borderColor: 'rgba(121,199,255,0.2)' },
  loanBox: { padding: 10, borderRadius: 11, backgroundColor: 'rgba(105,169,149,0.08)', borderWidth: 1, borderColor: 'rgba(105,169,149,0.22)' },
  unavailableBox: { padding: 9, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.03)' },
  unavailableTitle: { color: '#c8d0d5', fontSize: 10, fontWeight: '800', marginBottom: 4 },
  eyebrow: { color: '#79c7ff', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  title: { color: '#edf2f4', fontSize: 12, fontWeight: '900', marginTop: 3 },
  limit: { color: '#f5c451', fontSize: 17, fontWeight: '900' },
  outstanding: { color: '#f5c451', fontSize: 13, fontWeight: '900' },
  detail: { color: '#91a0aa', fontSize: 8, lineHeight: 12, marginTop: 5 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9 },
  metric: { width: '48%', padding: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.035)' },
  metricLabel: { color: '#6f7e89', fontSize: 6, fontWeight: '800', letterSpacing: 0.45 },
  metricValue: { color: '#cfd7dc', fontSize: 9, fontWeight: '900', marginTop: 2 },
  explanation: { color: '#80909b', fontSize: 8, lineHeight: 12, marginTop: 8 },
  button: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#79c7ff', marginTop: 8, paddingHorizontal: 8 },
  buttonText: { color: '#101317', fontSize: 8, fontWeight: '900', textAlign: 'center', letterSpacing: 0.4 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.82 },
});
