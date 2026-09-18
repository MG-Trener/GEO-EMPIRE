import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { DEMO_PLAYER_ID, getApiUrl } from './api';
import { DepositInvestigationPanel } from './DepositInvestigationPanel';
import { DevelopmentProjectPanel } from './DevelopmentProjectPanel';
import { gameAssets, resourceIconForCode } from './gameAssets';

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
  const response = await fetch(`${getApiUrl()}/api/v1/geology/${encodeURIComponent(DEMO_PLAYER_ID)}/deposits`);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${response.status}`;
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
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
    } catch (error) {
      onMessage?.(`Месторождения: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading && !deposits.length) {
    return <View style={styles.loadingRow}><ActivityIndicator /><Text style={styles.muted}>Загрузка изученных месторождений…</Text></View>;
  }

  if (!deposits.length) {
    return (
      <View style={styles.emptyBox}>
        <Image source={gameAssets.nav.exploration} style={styles.emptyIcon} resizeMode="contain" />
        <Text style={styles.emptyTitle}>Пока нет известных месторождений</Text>
        <Text style={styles.muted}>Проведите георазведку на карте. Найденные залежи появятся здесь для углублённого исследования.</Text>
      </View>
    );
  }

  const selected = deposits.find((item) => item.id === selectedId) ?? deposits[0];

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleRow}>
          <Image source={gameAssets.nav.exploration} style={styles.headerIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>ГЕОЛОГИЧЕСКИЙ ЦЕНТР</Text>
            <Text style={styles.title}>Известные месторождения</Text>
          </View>
        </View>
        <Pressable onPress={() => void refresh()} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}>
          <Image source={gameAssets.utility.center} style={styles.refreshIcon} resizeMode="contain" />
        </Pressable>
      </View>

      <View style={styles.summaryStrip}>
        <Text style={styles.summaryStrong}>{deposits.length}</Text>
        <Text style={styles.summaryText}>объектов в базе</Text>
        <View style={styles.summaryDivider} />
        <Text style={styles.summaryStrong}>{deposits.filter((item) => item.confidence >= 0.85).length}</Text>
        <Text style={styles.summaryText}>готовы к инвестрешению</Text>
      </View>

      <View style={styles.list}>
        {deposits.map((deposit) => {
          const active = deposit.id === selected.id;
          return (
            <Pressable key={deposit.id} onPress={() => setSelectedId(deposit.id)} style={({ pressed }) => [styles.depositRow, active && styles.depositRowActive, pressed && styles.pressed]}>
              <View style={styles.resourceIconBox}>
                <Image source={resourceIconForCode(deposit.resource.code)} style={styles.resourceIcon} resizeMode="contain" />
              </View>
              <View style={styles.flex}>
                <View style={styles.nameRow}>
                  <Text style={styles.depositName}>{deposit.resource.name}</Text>
                  <Text style={styles.rarity}>R{deposit.resource.rarity}</Text>
                </View>
                <Text style={styles.depositMeta} numberOfLines={1}>{deposit.h3Index}</Text>
                <Text style={styles.depositQuantity}>{formatNumber(deposit.estimatedQuantity.min)}–{formatNumber(deposit.estimatedQuantity.max)} {deposit.resource.unit}</Text>
              </View>
              <View style={styles.rightCol}>
                <Text style={styles.confidence}>{Math.round(deposit.confidence * 100)}%</Text>
                <View style={styles.confidenceTrack}><View style={[styles.confidenceFill, { width: `${Math.max(6, Math.round(deposit.confidence * 100))}%` }]} /></View>
                <Text style={styles.stage}>{deposit.completedStudies}/4 исследований</Text>
                {deposit.activeStudy ? <Text style={styles.running}>В РАБОТЕ</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <InvestmentCard deposit={selected} />
      <DepositInvestigationPanel key={`study-${selected.id}`} depositId={selected.id} onMessage={(message) => { onMessage?.(message); void refresh(); }} />
      <DevelopmentProjectPanel key={`development-${selected.id}-${selected.updatedAt}`} depositId={selected.id} onMessage={onMessage} />
    </View>
  );
}

function InvestmentCard({ deposit }: { deposit: KnownDeposit }) {
  const gross = deposit.investment.grossValue;
  return (
    <View style={styles.investmentCard}>
      <View style={styles.headerRow}>
        <View style={styles.investmentLead}>
          <Image source={resourceIconForCode(deposit.resource.code)} style={styles.investmentIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <Text style={styles.investmentEyebrow}>ИНВЕСТИЦИОННЫЙ ПРОФИЛЬ</Text>
            <Text style={styles.investmentTitle}>{deposit.resource.name}</Text>
          </View>
        </View>
        <View style={[styles.riskBadge, styles[`risk_${deposit.investment.risk}`]]}>
          <Text style={styles.riskText}>{riskLabels[deposit.investment.risk]}</Text>
        </View>
      </View>

      {gross ? (
        <>
          <Text style={styles.valueLabel}>ПОТЕНЦИАЛЬНАЯ ВАЛОВАЯ СТОИМОСТЬ</Text>
          <Text style={styles.valueRange}>{formatMoney(gross.min)} – {formatMoney(gross.max)}</Text>
          <View style={styles.marketRow}>
            <Text style={styles.marketLabel}>Рынок</Text>
            <Text style={styles.marketValue}>{formatNumber(deposit.investment.marketPricePerUnit ?? 0)} ₡/{deposit.resource.unit}</Text>
            <View style={styles.marketSpacer} />
            <Text style={styles.marketLabel}>Неопределённость</Text>
            <Text style={styles.marketValue}>{Math.round(deposit.investment.uncertainty * 100)}%</Text>
          </View>
        </>
      ) : <Text style={styles.valueMeta}>Для этого ресурса пока нет рыночной котировки.</Text>}

      <Text style={styles.recommendation}>{deposit.investment.recommendation}</Text>
      <Text style={styles.disclaimer}>Оценка показывает валовой потенциал запасов до CAPEX, OPEX, энергетики, логистики и переработки.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 9 },
  flex: { flex: 1 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12 },
  emptyBox: { padding: 14, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(10,24,34,0.88)', borderWidth: 1, borderColor: 'rgba(62,196,220,0.18)' },
  emptyIcon: { width: 62, height: 62, marginBottom: 8 },
  emptyTitle: { color: '#edf7fa', fontSize: 14, fontWeight: '900', marginBottom: 5 },
  muted: { color: '#82939f', fontSize: 10, lineHeight: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  headerTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { width: 46, height: 46 },
  eyebrow: { color: '#52d9e7', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: '#f3f8fa', fontSize: 15, fontWeight: '900', marginTop: 2 },
  refreshButton: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(17,46,60,0.9)', borderWidth: 1, borderColor: 'rgba(82,217,231,0.25)' },
  refreshIcon: { width: 32, height: 32 },
  summaryStrip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(8,20,29,0.9)' },
  summaryStrong: { color: '#64e3ef', fontSize: 12, fontWeight: '900' },
  summaryText: { color: '#8799a5', fontSize: 8 },
  summaryDivider: { width: 1, height: 15, backgroundColor: 'rgba(120,170,185,0.2)', marginHorizontal: 3 },
  list: { gap: 6 },
  depositRow: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 8, borderRadius: 12, backgroundColor: 'rgba(8,20,29,0.9)', borderWidth: 1, borderColor: 'rgba(103,137,151,0.14)' },
  depositRowActive: { backgroundColor: 'rgba(18,62,73,0.92)', borderColor: 'rgba(82,217,231,0.55)' },
  resourceIconBox: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(3,11,16,0.55)' },
  resourceIcon: { width: 42, height: 42 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  depositName: { color: '#f2f7f9', fontSize: 11, fontWeight: '900' },
  rarity: { color: '#f3b640', fontSize: 8, fontWeight: '900' },
  depositMeta: { color: '#667986', fontSize: 7, marginTop: 2 },
  depositQuantity: { color: '#c7d5db', fontSize: 9, fontWeight: '700', marginTop: 2 },
  rightCol: { alignItems: 'flex-end', minWidth: 70 },
  confidence: { color: '#64e3ef', fontSize: 12, fontWeight: '900' },
  confidenceTrack: { width: 64, height: 3, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 3 },
  confidenceFill: { height: 3, backgroundColor: '#45d7b4' },
  stage: { color: '#778a96', fontSize: 7, marginTop: 3 },
  running: { color: '#f3b640', fontSize: 7, fontWeight: '900', marginTop: 2 },
  investmentCard: { padding: 11, borderRadius: 13, backgroundColor: 'rgba(9,25,34,0.94)', borderWidth: 1, borderColor: 'rgba(243,182,64,0.28)' },
  investmentLead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  investmentIcon: { width: 38, height: 38 },
  investmentEyebrow: { color: '#b68b38', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  investmentTitle: { color: '#f2f7f9', fontSize: 13, fontWeight: '900', marginTop: 1 },
  riskBadge: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7 },
  risk_low: { backgroundColor: 'rgba(57,189,119,0.18)' },
  risk_moderate: { backgroundColor: 'rgba(235,167,56,0.18)' },
  risk_elevated: { backgroundColor: 'rgba(229,118,50,0.18)' },
  risk_high: { backgroundColor: 'rgba(224,68,68,0.2)' },
  riskText: { color: '#eef4f6', fontSize: 6, fontWeight: '900' },
  valueLabel: { color: '#738793', fontSize: 7, fontWeight: '800', letterSpacing: 0.7, marginTop: 9 },
  valueRange: { color: '#f3b640', fontSize: 17, fontWeight: '900', marginTop: 2 },
  marketRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  marketLabel: { color: '#728591', fontSize: 7 },
  marketValue: { color: '#d4e0e4', fontSize: 8, fontWeight: '800', marginLeft: 4 },
  marketSpacer: { flex: 1 },
  valueMeta: { color: '#86939f', fontSize: 8, lineHeight: 12, marginTop: 6 },
  recommendation: { color: '#c9d5da', fontSize: 9, lineHeight: 13, marginTop: 8 },
  disclaimer: { color: '#5f707a', fontSize: 7, lineHeight: 10, marginTop: 6 },
  pressed: { opacity: 0.78 },
});
