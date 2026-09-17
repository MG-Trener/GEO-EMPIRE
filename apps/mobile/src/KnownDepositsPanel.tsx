import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { DEMO_PLAYER_ID, getApiUrl } from './api';
import { DepositInvestigationPanel } from './DepositInvestigationPanel';

type KnownDeposit = {
  id: string;
  h3Index: string;
  resource: { code: string; name: string; rarity: number; unit: string };
  confidence: number;
  estimatedQuantity: { min: number; max: number };
  completedStudies: number;
  activeStudy: null | { method: string; completesAt: string | null };
  updatedAt: string;
};

type Response = { playerId: string; deposits: KnownDeposit[] };

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
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

      <DepositInvestigationPanel
        key={selected.id}
        depositId={selected.id}
        onMessage={(message) => {
          onMessage?.(message);
          void refresh();
        }}
      />
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
  pressed: { opacity: 0.82 },
});
