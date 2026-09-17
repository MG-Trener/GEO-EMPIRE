import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { DEMO_PLAYER_ID, getApiUrl } from './api';
import { DepositInvestigationPanel } from './DepositInvestigationPanel';
import { DevelopmentProjectPanel } from './DevelopmentProjectPanel';

type InvestmentRisk = 'low' | 'moderate' | 'elevated' | 'high';

type KnownDeposit = {
  id: string;
  h3Index: string;
  resource: { code: string; name: string; rarity: number; unit: string };
  confidence: number;
  estimatedQuantity: { min: number; max: number };
  investment: {
    marketPricePerUnit: number | null;
    grossValue: { min: number; max: number } | null;
    uncertainty: number;
    risk: InvestmentRisk;
    recommendation: string;
  };
  completedStudies: number;
  activeStudy: null | { method: string; completesAt: string | null };
  updatedAt: string;
};

type Response = { playerId: string; deposits: KnownDeposit[] };

const riskLabels: Record<InvestmentRisk, string> = {
  low: 'НИЗКИЙ РИСК',
  moderate: 'УМЕРЕННЫЙ РИСК',
  elevated: 'ПОВЫШЕННЫЙ РИСК',
  high: 'ВЫСОКИЙ РИСК',
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} млрд ₡`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн ₡`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} тыс. ₡`;
  return `${formatNumber(value)} ₡`;
}

async function loadDeposits(): Promise<KnownDeposit[]> {
  const response = await fetch(
    `${getApiUrl()}/api/v1/geology/${encodeURIComponent(DEMO_PLAYER_ID)}/deposits`,
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body
      ? String(body.error)
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return (body as Response).deposits;
}

export function KnownDepositsPanel({ onMessage }: { onMessage?: (message: string) => void }) {
  const [deposits, setDeposits] = useState<KnownDeposit[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadDeposits();
      setDeposits(next);
      setSelectedId((current) => current && next.some((item) => item.id === current)
        ? current
        : next[0]?.id ?? null);
    } catch (error) {
      onMessage?.(`Месторождения: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && !deposits.length) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator />
        <Text style={styles.muted}>Загрузка изученных месторождений…</Text>
      </View>
    );
  }

  if (!deposits.length) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>Пока нет известных месторождений</Text>
        <Text style={styles.muted}>Проведите георазведку на карте. Найденные залежи появятся здесь для углублённого исследования.</Text>
      </View>
    );
  }

  const selected = deposits.find((item) => item.id === selectedId) ?? deposits[0];

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>ГЕОЛОГИЧЕСКИЙ ЦЕНТР</Text>
          <Text style={styles.title}>Известные месторождения</Text>
        </View>
        <Pressable onPress={() => void refresh()} style={styles.refreshButton}>
          <Text style={styles.refreshText}>ОБНОВИТЬ</Text>
        </Pressable>
      </View>

      <View style={styles.list}>
        {deposits.map((deposit) => {
          const active = deposit.id === selected.id;
          return (
            <Pressable
              key={deposit.id}
              onPress={() => setSelectedId(deposit.id)}
              style={({ pressed }) => [
                styles.depositRow,
                active && styles.depositRowActive,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.flex}>
                <View style={styles.nameRow}>
                  <Text style={styles.depositName}>{deposit.resource.name}</Text>
                  <Text style={styles.rarity}>R{deposit.resource.rarity}</Text>
                </View>
                <Text style={styles.depositMeta} numberOfLines={1}>{deposit.h3Index}</Text>
                <Text style={styles.depositMeta}>
                  {formatNumber(deposit.estimatedQuantity.min)}–{formatNumber(deposit.estimatedQuantity.max)} {deposit.resource.unit}
                </Text>
              </View>
              <View style={styles.rightCol}>
                <Text style={styles.confidence}>{Math.round(deposit.confidence * 100)}%</Text>
                <Text style={styles.stage}>{deposit.completedStudies}/4</Text>
                {deposit.activeStudy ? <Text style={styles.running}>В РАБОТЕ</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <InvestmentCard deposit={selected} />

      <DepositInvestigationPanel
        key={`study-${selected.id}`}
        depositId={selected.id}
        onMessage={(message) => {
          onMessage?.(message);
          void refresh();
        }}
      />

      <DevelopmentProjectPanel
        key={`development-${selected.id}-${selected.updatedAt}`}
        depositId={selected.id}
        onMessage={onMessage}
      />
    </View>
  );
}

function InvestmentCard({ deposit }: { deposit: KnownDeposit }) {
  const gross = deposit.investment.grossValue;
  return (
    <View style={styles.investmentCard}>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <Text style={styles.investmentEyebrow}>ИНВЕСТИЦИОННЫЙ ПРОФИЛЬ</Text>
          <Text style={styles.investmentTitle}>{deposit.resource.name}</Text>
        </View>
        <View style={[styles.riskBadge, styles[`risk_${deposit.investment.risk}`]]}>
          <Text style={styles.riskText}>{riskLabels[deposit.investment.risk]}</Text>
        </View>
      </View>

      {gross ? (
        <>
          <Text style={styles.valueLabel}>ПОТЕНЦИАЛЬНАЯ ВАЛОВАЯ СТОИМОСТЬ</Text>
          <Text style={styles.valueRange}>{formatMoney(gross.min)} – {formatMoney(gross.max)}</Text>
          <Text style={styles.valueMeta}>
            Рыночная цена: {formatNumber(deposit.investment.marketPricePerUnit ?? 0)} ₡/{deposit.resource.unit} · неопределённость {Math.round(deposit.investment.uncertainty * 100)}%
          </Text>
        </>
      ) : (
        <Text style={styles.valueMeta}>Для этого ресурса пока нет рыночной котировки.</Text>
      )}

      <Text style={styles.recommendation}>{deposit.investment.recommendation}</Text>
      <Text style={styles.disclaimer}>Оценка показывает валовой потенциал запасов до затрат на строительство, добычу, энергетику и переработку.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  flex: { flex: 1 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12 },
  emptyBox: { padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)' },
  emptyTitle: { color: '#eef3f4', fontSize: 13, fontWeight: '800', marginBottom: 5 },
  muted: { color: '#8d99a7', fontSize: 10, lineHeight: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  eyebrow: { color: '#71a896', fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: '#f2f4f6', fontSize: 15, fontWeight: '900', marginTop: 3 },
  refreshButton: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(121,199,255,0.09)' },
  refreshText: { color: '#79c7ff', fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  list: { gap: 6 },
  depositRow: { flexDirection: 'row', gap: 10, padding: 9, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  depositRowActive: { backgroundColor: 'rgba(28,123,110,0.11)', borderColor: 'rgba(105,169,149,0.34)' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  depositName: { color: '#f3f5f6', fontSize: 11, fontWeight: '800' },
  rarity: { color: '#f5c451', fontSize: 8, fontWeight: '900' },
  depositMeta: { color: '#7f8b98', fontSize: 8, marginTop: 2 },
  rightCol: { alignItems: 'flex-end', minWidth: 48 },
  confidence: { color: '#f5c451', fontSize: 12, fontWeight: '900' },
  stage: { color: '#8fa0ad', fontSize: 8, marginTop: 2 },
  running: { color: '#79c7ff', fontSize: 7, fontWeight: '900', marginTop: 3 },
  investmentCard: { padding: 11, borderRadius: 12, backgroundColor: 'rgba(245,196,81,0.065)', borderWidth: 1, borderColor: 'rgba(245,196,81,0.2)' },
  investmentEyebrow: { color: '#a88745', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  investmentTitle: { color: '#f2f4f6', fontSize: 13, fontWeight: '900', marginTop: 2 },
  riskBadge: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8 },
  risk_low: { backgroundColor: 'rgba(85,166,122,0.2)' },
  risk_moderate: { backgroundColor: 'rgba(214,155,55,0.18)' },
  risk_elevated: { backgroundColor: 'rgba(220,124,56,0.18)' },
  risk_high: { backgroundColor: 'rgba(196,77,77,0.2)' },
  riskText: { color: '#e6e9eb', fontSize: 7, fontWeight: '900' },
  valueLabel: { color: '#7d8995', fontSize: 7, fontWeight: '700', letterSpacing: 0.7, marginTop: 10 },
  valueRange: { color: '#f5c451', fontSize: 18, fontWeight: '900', marginTop: 3 },
  valueMeta: { color: '#86939f', fontSize: 8, lineHeight: 12, marginTop: 3 },
  recommendation: { color: '#cbd2d7', fontSize: 9, lineHeight: 13, marginTop: 8 },
  disclaimer: { color: '#65717d', fontSize: 7, lineHeight: 10, marginTop: 6 },
  pressed: { opacity: 0.82 },
});
