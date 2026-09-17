import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { DEMO_PLAYER_ID, getApiUrl } from './api';

type DevelopmentMethod = 'open_pit' | 'underground_mine' | 'oil_well' | 'gas_well';

type DevelopmentOption = {
  method: DevelopmentMethod;
  name: string;
  description: string;
  buildingCode: string;
  capex: number;
  marketPricePerUnit: number;
  opexPerUnit: number;
  recoveryRate: number;
  plannedDailyOutput: number;
  estimatedMineLifeDays: number;
  expectedDailyRevenue: number;
  expectedDailyOperatingMargin: number;
  paybackDays: number | null;
  projectValue: number;
  geologyConfidence: number;
  approvalReady: boolean;
  recommended: boolean;
};

type SelectedProject = {
  id: string;
  method: DevelopmentMethod;
  status: string;
  capex: number;
  opexPerUnit: number;
  plannedDailyOutput: number;
  expectedDailyOperatingMargin: number;
  paybackDays: number | null;
  estimatedMineLifeDays: number;
  projectValue: number;
  geologyConfidence: number;
  geologySnapshotAt: string;
  outdated: boolean;
  building: null | {
    id: string;
    status: string | null;
    completesAt: string | null;
    constructionComplete: boolean;
  };
};

type ApprovalState = {
  confidenceReady: boolean;
  territoryOwned: boolean;
  walletSoft: number;
  sufficientFunds: boolean;
  projectFresh: boolean;
  canApprove: boolean;
};

type DevelopmentResponse = {
  playerId: string;
  deposit: {
    id: string;
    resource: { code: string; name: string; unit: string; rarity: number };
    estimates: { confidence: number };
  };
  approvalRule: { minimumGeologyConfidence: number; message: string };
  approvalState: ApprovalState;
  options: DevelopmentOption[];
  selectedProject: SelectedProject | null;
};

type ApprovalResponse = {
  status: 'constructing';
  projectId: string;
  charged: number;
  wallet: { soft: number };
  building: {
    id: string;
    code: string;
    name: string;
    h3Index: string;
    completesAt: string;
    constructionSeconds: number;
  };
};

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
}

function formatMoney(value: number): string {
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)} млрд ₡`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} млн ₡`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)} тыс. ₡`;
  return `${sign}${formatNumber(abs)} ₡`;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'завершено';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes} мин ${rest} сек` : `${rest} сек`;
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

export function DevelopmentProjectPanel({
  depositId,
  onMessage,
}: {
  depositId: string;
  onMessage?: (message: string) => void;
}) {
  const [data, setData] = useState<DevelopmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<DevelopmentMethod | null>(null);
  const [approving, setApproving] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestJson<DevelopmentResponse>(
        `${getApiUrl()}/api/v1/development/${encodeURIComponent(DEMO_PLAYER_ID)}/deposits/${encodeURIComponent(depositId)}/options`,
      );
      setData(result);
    } catch (error) {
      onMessage?.(`Проект разработки: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [depositId, onMessage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const completesAt = data?.selectedProject?.building?.completesAt;
    if (!completesAt) return undefined;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (new Date(completesAt).getTime() <= Date.now()) void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [data?.selectedProject?.building?.completesAt, refresh]);

  const constructionRemaining = useMemo(() => {
    const completesAt = data?.selectedProject?.building?.completesAt;
    if (!completesAt) return 0;
    return Math.max(0, Math.ceil((new Date(completesAt).getTime() - now) / 1000));
  }, [data?.selectedProject?.building?.completesAt, now]);

  useEffect(() => {
    if (!data?.selectedProject?.building?.completesAt || constructionRemaining <= 0) return undefined;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [constructionRemaining, data?.selectedProject?.building?.completesAt]);

  const saveProject = useCallback(async (method: DevelopmentMethod) => {
    setSaving(method);
    try {
      await requestJson(`${getApiUrl()}/api/v1/development/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: DEMO_PLAYER_ID, depositId, method }),
      });
      onMessage?.('Проект разработки сохранён. CAPEX пока не списан.');
      await refresh();
    } catch (error) {
      onMessage?.(`Выбор проекта: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setSaving(null);
    }
  }, [depositId, onMessage, refresh]);

  const approveProject = useCallback(async () => {
    const project = data?.selectedProject;
    if (!project) return;
    setApproving(true);
    try {
      const result = await requestJson<ApprovalResponse>(
        `${getApiUrl()}/api/v1/development/projects/${encodeURIComponent(project.id)}/approve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ playerId: DEMO_PLAYER_ID }),
        },
      );
      onMessage?.(`Проект утверждён · списано ${formatMoney(result.charged)} · строительство запущено`);
      await refresh();
    } catch (error) {
      onMessage?.(`Утверждение проекта: ${error instanceof Error ? error.message : 'ошибка'}`);
      await refresh();
    } finally {
      setApproving(false);
    }
  }, [data?.selectedProject, onMessage, refresh]);

  if (loading && !data) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" />
        <Text style={styles.muted}>Расчёт вариантов разработки…</Text>
      </View>
    );
  }

  if (!data) return null;

  const projectLocked = Boolean(data.selectedProject && data.selectedProject.status !== 'planned');

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>ПРОЕКТ РАЗРАБОТКИ</Text>
          <Text style={styles.title}>{data.deposit.resource.name}</Text>
        </View>
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceValue}>{Math.round(data.deposit.estimates.confidence * 100)}%</Text>
          <Text style={styles.confidenceLabel}>геология</Text>
        </View>
      </View>

      {data.selectedProject ? (
        <View style={[styles.selectedBox, data.selectedProject.outdated && styles.selectedOutdated]}>
          <Text style={styles.selectedLabel}>
            {data.selectedProject.status === 'constructing'
              ? 'ПРОЕКТ УТВЕРЖДЁН'
              : data.selectedProject.outdated
                ? 'ПРОЕКТ ТРЕБУЕТ ПЕРЕСЧЁТА'
                : 'ВЫБРАННЫЙ ПРОЕКТ'}
          </Text>
          <Text style={styles.selectedText}>
            {data.options.find((item) => item.method === data.selectedProject?.method)?.name ?? data.selectedProject.method}
            {' · '}{formatMoney(data.selectedProject.capex)}
          </Text>
        </View>
      ) : null}

      {data.selectedProject?.status === 'constructing' && data.selectedProject.building ? (
        <View style={styles.constructionBox}>
          <Text style={styles.constructionLabel}>СТРОИТЕЛЬСТВО</Text>
          <Text style={styles.constructionTitle}>
            {constructionRemaining > 0 ? `До завершения: ${formatCountdown(constructionRemaining)}` : 'Объект построен'}
          </Text>
          <Text style={styles.description}>
            {constructionRemaining > 0
              ? 'CAPEX уже списан. После завершения объект будет готов к настройке добычи.'
              : 'Строительство завершено. Откройте объект на карте и запустите добычу найденного ресурса.'}
          </Text>
        </View>
      ) : null}

      {data.options.map((option) => {
        const selected = data.selectedProject?.method === option.method;
        const sameAndFresh = selected && !data.selectedProject?.outdated;
        return (
          <View key={option.method} style={[styles.optionCard, option.recommended && styles.optionRecommended]}>
            <View style={styles.headerRow}>
              <View style={styles.flex}>
                <Text style={styles.optionTitle}>{option.name}</Text>
                <Text style={styles.description}>{option.description}</Text>
              </View>
              {option.recommended ? (
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedText}>РЕКОМЕНДОВАНО</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.metrics}>
              <Metric label="CAPEX" value={formatMoney(option.capex)} />
              <Metric label="OPEX" value={`${formatNumber(option.opexPerUnit, 2)} ₡/${data.deposit.resource.unit}`} />
              <Metric label="ДОБЫЧА/СУТ" value={`${formatNumber(option.plannedDailyOutput, 1)} ${data.deposit.resource.unit}`} />
              <Metric label="ИЗВЛЕЧЕНИЕ" value={`${Math.round(option.recoveryRate * 100)}%`} />
              <Metric label="МАРЖА/СУТ" value={formatMoney(option.expectedDailyOperatingMargin)} />
              <Metric label="ОКУПАЕМОСТЬ" value={option.paybackDays === null ? '—' : `${formatNumber(option.paybackDays, 1)} дн.`} />
              <Metric label="СРОК РАЗРАБОТКИ" value={`${formatNumber(option.estimatedMineLifeDays)} дн.`} />
              <Metric label="ЦЕННОСТЬ ПРОЕКТА" value={formatMoney(option.projectValue)} />
            </View>

            {!option.approvalReady ? (
              <Text style={styles.warning}>Для утверждения CAPEX нужно повысить достоверность геологии до 85%.</Text>
            ) : null}

            {!projectLocked ? (
              <Pressable
                disabled={saving !== null || sameAndFresh}
                onPress={() => void saveProject(option.method)}
                style={({ pressed }) => [
                  styles.button,
                  sameAndFresh && styles.buttonSelected,
                  saving !== null && styles.buttonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                {saving === option.method
                  ? <ActivityIndicator color="#101317" />
                  : <Text style={styles.buttonText}>{sameAndFresh ? 'ПРОЕКТ ВЫБРАН' : selected ? 'ПЕРЕСЧИТАТЬ ПРОЕКТ' : 'ВЫБРАТЬ ПРОЕКТ'}</Text>}
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {data.selectedProject?.status === 'planned' ? (
        <View style={styles.approvalBox}>
          <Text style={styles.approvalTitle}>ГОТОВНОСТЬ К ИНВЕСТИЦИИ</Text>
          <CheckRow ok={data.approvalState.confidenceReady} label={`Геология ≥ ${Math.round(data.approvalRule.minimumGeologyConfidence * 100)}%`} />
          <CheckRow ok={data.approvalState.territoryOwned} label="Участок принадлежит компании" />
          <CheckRow ok={data.approvalState.projectFresh} label="Расчёт проекта актуален" />
          <CheckRow
            ok={data.approvalState.sufficientFunds}
            label={`Средства: ${formatMoney(data.approvalState.walletSoft)} / CAPEX ${formatMoney(data.selectedProject.capex)}`}
          />

          <Pressable
            disabled={!data.approvalState.canApprove || approving}
            onPress={() => void approveProject()}
            style={({ pressed }) => [
              styles.approveButton,
              (!data.approvalState.canApprove || approving) && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {approving
              ? <ActivityIndicator color="#101317" />
              : <Text style={styles.approveButtonText}>УТВЕРДИТЬ И СТРОИТЬ · {formatMoney(data.selectedProject.capex)}</Text>}
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.note}>
        Выбор проекта бесплатный. CAPEX списывается только при утверждении и запуске строительства.
      </Text>
    </View>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.checkRow}>
      <Text style={[styles.checkMark, ok ? styles.checkOk : styles.checkFail]}>{ok ? '✓' : '×'}</Text>
      <Text style={styles.checkText}>{label}</Text>
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
  root: { marginTop: 2, gap: 8 },
  flex: { flex: 1 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  muted: { color: '#8d99a7', fontSize: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 9 },
  eyebrow: { color: '#79c7ff', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#f2f4f6', fontSize: 14, fontWeight: '900', marginTop: 2 },
  confidenceBadge: { minWidth: 56, alignItems: 'center', padding: 7, borderRadius: 9, backgroundColor: 'rgba(121,199,255,0.1)' },
  confidenceValue: { color: '#79c7ff', fontSize: 13, fontWeight: '900' },
  confidenceLabel: { color: '#72828d', fontSize: 7, marginTop: 1 },
  selectedBox: { padding: 9, borderRadius: 10, backgroundColor: 'rgba(105,169,149,0.1)', borderWidth: 1, borderColor: 'rgba(105,169,149,0.24)' },
  selectedOutdated: { backgroundColor: 'rgba(214,155,55,0.08)', borderColor: 'rgba(214,155,55,0.28)' },
  selectedLabel: { color: '#82bca7', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  selectedText: { color: '#dce4e7', fontSize: 10, fontWeight: '800', marginTop: 3 },
  constructionBox: { padding: 10, borderRadius: 11, backgroundColor: 'rgba(121,199,255,0.08)', borderWidth: 1, borderColor: 'rgba(121,199,255,0.22)' },
  constructionLabel: { color: '#79c7ff', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  constructionTitle: { color: '#d5f0ff', fontSize: 13, fontWeight: '900', marginTop: 3 },
  optionCard: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  optionRecommended: { borderColor: 'rgba(245,196,81,0.32)', backgroundColor: 'rgba(245,196,81,0.055)' },
  optionTitle: { color: '#f1f3f4', fontSize: 12, fontWeight: '900' },
  description: { color: '#8d99a5', fontSize: 8, lineHeight: 12, marginTop: 3 },
  recommendedBadge: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 7, backgroundColor: 'rgba(245,196,81,0.14)' },
  recommendedText: { color: '#f5c451', fontSize: 6, fontWeight: '900', letterSpacing: 0.4 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9 },
  metric: { width: '48%', padding: 7, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.035)' },
  metricLabel: { color: '#6f7d88', fontSize: 6, fontWeight: '800', letterSpacing: 0.5 },
  metricValue: { color: '#cbd3d8', fontSize: 9, fontWeight: '800', marginTop: 2 },
  warning: { color: '#d99b62', fontSize: 8, lineHeight: 11, marginTop: 7 },
  button: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#f5c451', marginTop: 8 },
  buttonSelected: { backgroundColor: '#5c7d70' },
  buttonDisabled: { opacity: 0.42 },
  buttonText: { color: '#101317', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  approvalBox: { padding: 10, borderRadius: 11, backgroundColor: 'rgba(245,196,81,0.055)', borderWidth: 1, borderColor: 'rgba(245,196,81,0.18)' },
  approvalTitle: { color: '#f5c451', fontSize: 8, fontWeight: '900', letterSpacing: 0.8, marginBottom: 5 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  checkMark: { width: 16, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  checkOk: { color: '#77d9bd' },
  checkFail: { color: '#db806e' },
  checkText: { flex: 1, color: '#aeb8c0', fontSize: 8, lineHeight: 11 },
  approveButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#d69b37', marginTop: 9 },
  approveButtonText: { color: '#101317', fontSize: 8, fontWeight: '900', letterSpacing: 0.45 },
  note: { color: '#67747f', fontSize: 7, lineHeight: 10 },
  pressed: { opacity: 0.82 },
});
