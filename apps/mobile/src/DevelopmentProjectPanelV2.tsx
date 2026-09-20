import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { claimTerritory, DEMO_PLAYER_ID, getApiUrl } from './api';
import { formatResearchClock, parseApiTimestamp } from './apiTime';
import { gameAssets, resourceIconForCode } from './gameAssets';

const BUILD_RADIUS_METERS = 75;

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

type DevelopmentResponse = {
  playerId: string;
  deposit: {
    id: string;
    h3Index: string;
    resource: { code: string; name: string; unit: string; rarity: number };
    estimates: { confidence: number };
  };
  approvalRule: { minimumGeologyConfidence: number; message: string };
  approvalState: {
    confidenceReady: boolean;
    territoryOwned: boolean;
    walletSoft: number;
    sufficientFunds: boolean;
    projectFresh: boolean;
    canApprove: boolean;
  };
  options: DevelopmentOption[];
  selectedProject: SelectedProject | null;
};

type ParcelState = {
  playerId: string;
  depositId: string;
  h3Index: string;
  status: 'free' | 'owned' | 'rival';
  ownerId: string | null;
  ownerName: string | null;
  leaseUntil: string | null;
  claimCost: number;
  baseClaimCost: number;
  technologyDiscountPercent: number;
};

type ApprovalResponse = {
  status: 'constructing';
  charged: number;
  building: { id: string; code: string; name: string; h3Index: string; completesAt: string; constructionSeconds: number };
};

function money(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} млн ₡`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} тыс. ₡`;
  return `${sign}${Math.round(abs).toLocaleString('ru-RU')} ₡`;
}

function number(value: number, digits = 0): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${response.status}`;
    throw new Error(error);
  }
  return body as T;
}

function methodIcon(method: DevelopmentMethod, resourceCode: string) {
  if (method === 'oil_well' || method === 'gas_well') return resourceIconForCode(resourceCode);
  return gameAssets.industry.mineTruck;
}

export function DevelopmentProjectPanel({ depositId, onMessage }: { depositId: string; onMessage?: (message: string) => void }) {
  const [data, setData] = useState<DevelopmentResponse | null>(null);
  const [parcel, setParcel] = useState<ParcelState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<DevelopmentMethod | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [approving, setApproving] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const [project, land] = await Promise.all([
        requestJson<DevelopmentResponse>(`${getApiUrl()}/api/v1/development/${encodeURIComponent(DEMO_PLAYER_ID)}/deposits/${encodeURIComponent(depositId)}/options`),
        requestJson<ParcelState>(`${getApiUrl()}/api/v1/development-assist/${encodeURIComponent(DEMO_PLAYER_ID)}/deposits/${encodeURIComponent(depositId)}/parcel`),
      ]);
      setData(project);
      setParcel(land);
      setNow(Date.now());
    } catch (error) {
      onMessage?.(`Проект разработки: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [depositId, onMessage]);

  useEffect(() => { setLoading(true); void refresh(); }, [refresh]);

  const buildingCompletesAt = data?.selectedProject?.building?.completesAt ?? null;
  const buildingEnd = parseApiTimestamp(buildingCompletesAt);
  const constructionRemaining = Number.isFinite(buildingEnd) ? Math.max(0, (buildingEnd - now) / 1000) : 0;

  useEffect(() => {
    if (!buildingCompletesAt || constructionRemaining <= 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => void refresh(), 5000);
    return () => { clearInterval(timer); clearInterval(poll); };
  }, [buildingCompletesAt, constructionRemaining, refresh]);

  const selectProject = useCallback(async (method: DevelopmentMethod) => {
    setSaving(method);
    try {
      await requestJson(`${getApiUrl()}/api/v1/development/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: DEMO_PLAYER_ID, depositId, method }),
      });
      onMessage?.('Проект рассчитан и сохранён. CAPEX пока не списан.');
      await refresh();
    } catch (error) {
      onMessage?.(`Выбор проекта: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setSaving(null);
    }
  }, [depositId, onMessage, refresh]);

  const claimParcel = useCallback(async () => {
    if (!parcel || parcel.status !== 'free') return;
    setClaiming(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('location_permission_required');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const result = await claimTerritory({
        playerId: DEMO_PLAYER_ID,
        playerLat: current.coords.latitude,
        playerLng: current.coords.longitude,
        h3Index: parcel.h3Index,
      });
      onMessage?.(result.status === 'already_owned' ? 'Участок уже принадлежит компании' : `Участок арендован · списано ${money(result.charged)}`);
      await refresh();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'ошибка';
      onMessage?.(
        reason === 'territory_out_of_range'
          ? `Для аренды нужно находиться в радиусе ${BUILD_RADIUS_METERS} м от участка.`
          : reason === 'location_permission_required'
            ? 'Для аренды нужен доступ к геолокации.'
            : `Аренда участка: ${reason}`,
      );
    } finally {
      setClaiming(false);
    }
  }, [onMessage, parcel, refresh]);

  const approve = useCallback(async () => {
    if (!data?.selectedProject) return;
    setApproving(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('location_permission_required');
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });
      const result = await requestJson<ApprovalResponse>(`${getApiUrl()}/api/v1/development/projects/${encodeURIComponent(data.selectedProject.id)}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          playerId: DEMO_PLAYER_ID,
          playerLat: current.coords.latitude,
          playerLng: current.coords.longitude,
        }),
      });
      onMessage?.(`Проект утверждён · списано ${money(result.charged)} · строительство запущено`);
      await refresh();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'ошибка';
      onMessage?.(
        reason === 'construction_out_of_range'
          ? `Строительство доступно только в радиусе ${BUILD_RADIUS_METERS} м от вашей текущей геопозиции.`
          : reason === 'location_permission_required' || reason === 'location_required_for_construction'
            ? 'Для строительства нужен доступ к актуальной геопозиции.'
            : `Утверждение проекта: ${reason}`,
      );
      await refresh();
    } finally {
      setApproving(false);
    }
  }, [data?.selectedProject, onMessage, refresh]);

  if (loading && !data) {
    return <View style={styles.loading}><ActivityIndicator color="#38d8ff" /><Text style={styles.muted}>Расчёт промышленного проекта…</Text></View>;
  }
  if (!data || !parcel) return null;

  const confidence = Math.round(data.deposit.estimates.confidence * 100);
  const projectLocked = Boolean(data.selectedProject && data.selectedProject.status !== 'planned');
  const selectedOption = data.options.find((item) => item.method === data.selectedProject?.method) ?? null;
  const geologyReady = data.approvalState.confidenceReady;
  const landReady = parcel.status === 'owned';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Image source={resourceIconForCode(data.deposit.resource.code)} style={styles.resourceIcon} resizeMode="contain" />
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>ПРОМЫШЛЕННОЕ ОСВОЕНИЕ</Text>
          <Text style={styles.title}>{data.deposit.resource.name}</Text>
          <Text style={styles.h3} numberOfLines={1}>H3 {parcel.h3Index}</Text>
        </View>
        <View style={styles.confidence}><Text style={styles.confidenceValue}>{confidence}%</Text><Text style={styles.confidenceLabel}>геология</Text></View>
      </View>

      <View style={styles.steps}>
        <Step ok={geologyReady} number="1" title="ГЕОЛОГИЯ" />
        <Text style={styles.stepArrow}>›</Text>
        <Step ok={landReady} number="2" title="УЧАСТОК" />
        <Text style={styles.stepArrow}>›</Text>
        <Step ok={Boolean(data.selectedProject)} number="3" title="ПРОЕКТ" />
        <Text style={styles.stepArrow}>›</Text>
        <Step ok={projectLocked} number="4" title="СТРОЙКА" />
      </View>

      <ParcelCard parcel={parcel} claiming={claiming} onClaim={() => void claimParcel()} />

      {data.selectedProject?.status === 'constructing' && data.selectedProject.building ? (
        <View style={styles.construction}>
          <Image source={gameAssets.nav.construction} style={styles.constructionIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <Text style={styles.constructionLabel}>СТРОИТЕЛЬСТВО ИДЁТ</Text>
            <Text style={styles.constructionTitle}>{constructionRemaining > 0 ? `Осталось ${formatResearchClock(constructionRemaining)}` : 'Объект построен'}</Text>
            <View style={styles.constructionTrack}><View style={[styles.constructionFill, { width: data.selectedProject.building.constructionComplete ? '100%' : '70%' }]} /></View>
          </View>
        </View>
      ) : null}

      {!projectLocked ? data.options.map((option) => {
        const selected = data.selectedProject?.method === option.method && !data.selectedProject.outdated;
        return (
          <View key={option.method} style={[styles.option, option.recommended && styles.optionRecommended, selected && styles.optionSelected]}>
            <View style={styles.optionHeader}>
              <View style={styles.methodIconFrame}><Image source={methodIcon(option.method, data.deposit.resource.code)} style={styles.methodIcon} resizeMode="contain" /></View>
              <View style={styles.flex}>
                <Text style={styles.optionTitle}>{option.name}</Text>
                <Text style={styles.description}>{option.description}</Text>
              </View>
              {option.recommended ? <Text style={styles.recommended}>РЕКОМЕНДОВАНО</Text> : null}
            </View>
            <View style={styles.metrics}>
              <Metric label="CAPEX" value={money(option.capex)} />
              <Metric label="OPEX" value={`${number(option.opexPerUnit, 2)} ₡/${data.deposit.resource.unit}`} />
              <Metric label="ДОБЫЧА/СУТ" value={`${number(option.plannedDailyOutput, 1)} ${data.deposit.resource.unit}`} />
              <Metric label="ИЗВЛЕЧЕНИЕ" value={`${Math.round(option.recoveryRate * 100)}%`} />
              <Metric label="МАРЖА/СУТ" value={money(option.expectedDailyOperatingMargin)} />
              <Metric label="ОКУПАЕМОСТЬ" value={option.paybackDays === null ? '—' : `${number(option.paybackDays, 1)} дн.`} />
              <Metric label="СРОК" value={`${number(option.estimatedMineLifeDays)} дн.`} />
              <Metric label="ЦЕННОСТЬ" value={money(option.projectValue)} />
            </View>
            <Pressable disabled={saving !== null || selected} onPress={() => void selectProject(option.method)} style={[styles.selectButton, selected && styles.selectButtonDone, saving !== null && styles.disabled]}>
              {saving === option.method ? <ActivityIndicator color="#071116" /> : <Text style={styles.selectText}>{selected ? 'ПРОЕКТ ВЫБРАН' : 'ВЫБРАТЬ ПРОЕКТ'}</Text>}
            </Pressable>
          </View>
        );
      }) : null}

      {data.selectedProject?.status === 'planned' ? (
        <View style={styles.approval}>
          <Text style={styles.approvalTitle}>ГОТОВНОСТЬ К ИНВЕСТИЦИИ</Text>
          <Check ok={data.approvalState.confidenceReady} text={`Геология ≥ ${Math.round(data.approvalRule.minimumGeologyConfidence * 100)}%`} />
          <Check ok={landReady} text={landReady ? 'Участок арендован компанией' : parcel.status === 'free' ? 'Участок свободен — требуется аренда' : 'Участок занят другой компанией'} />
          <Check ok={data.approvalState.projectFresh} text="Расчёт проекта актуален" />
          <Check ok={data.approvalState.sufficientFunds} text={`Средства ${money(data.approvalState.walletSoft)} / CAPEX ${money(data.selectedProject.capex)}`} />
          <Check ok={true} text={`Физическое строительство: находиться ≤ ${BUILD_RADIUS_METERS} м от участка`} />

          {!landReady && parcel.status === 'free' ? (
            <Pressable disabled={claiming} onPress={() => void claimParcel()} style={[styles.claimButton, claiming && styles.disabled]}>
              {claiming ? <ActivityIndicator color="#071116" /> : <Text style={styles.claimButtonText}>СНАЧАЛА АРЕНДОВАТЬ УЧАСТОК · {money(parcel.claimCost)}</Text>}
            </Pressable>
          ) : (
            <Pressable disabled={!data.approvalState.canApprove || approving} onPress={() => void approve()} style={[styles.approveButton, (!data.approvalState.canApprove || approving) && styles.disabled]}>
              {approving ? <ActivityIndicator color="#071116" /> : <Text style={styles.approveText}>УТВЕРДИТЬ И СТРОИТЬ · {money(data.selectedProject.capex)}</Text>}
            </Pressable>
          )}
          {selectedOption ? <Text style={styles.footerHint}>Выбран проект: {selectedOption.name}. Право на ресурс и право на земельный участок — разные этапы. Финальная команда строительства всегда подтверждается актуальной GPS-позицией.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function ParcelCard({ parcel, claiming, onClaim }: { parcel: ParcelState; claiming: boolean; onClaim: () => void }) {
  if (parcel.status === 'owned') {
    return (
      <View style={[styles.parcel, styles.parcelOwned]}>
        <Image source={gameAssets.utility.select} style={styles.parcelIcon} resizeMode="contain" />
        <View style={styles.flex}><Text style={styles.parcelOwnedTitle}>УЧАСТОК АРЕНДОВАН ВАШЕЙ КОМПАНИЕЙ</Text><Text style={styles.parcelText}>Можно готовить проект. Для фактического строительства нужно находиться рядом с участком.</Text></View>
      </View>
    );
  }
  if (parcel.status === 'rival') {
    return (
      <View style={[styles.parcel, styles.parcelRival]}>
        <Image source={gameAssets.utility.marker} style={styles.parcelIcon} resizeMode="contain" />
        <View style={styles.flex}><Text style={styles.parcelRivalTitle}>УЧАСТОК ЗАНЯТ</Text><Text style={styles.parcelText}>Владелец: {parcel.ownerName ?? 'другая компания'}. Строительство здесь недоступно.</Text></View>
      </View>
    );
  }
  return (
    <View style={[styles.parcel, styles.parcelFree]}>
      <Image source={gameAssets.utility.marker} style={styles.parcelIcon} resizeMode="contain" />
      <View style={styles.flex}>
        <Text style={styles.parcelFreeTitle}>УЧАСТОК СВОБОДЕН — НО ЕЩЁ НЕ ВАШ</Text>
        <Text style={styles.parcelText}>Исследование подтверждает месторождение, но не оформляет право на землю. Аренда доступна только когда вы физически находитесь в радиусе {BUILD_RADIUS_METERS} м.</Text>
        <Pressable disabled={claiming} onPress={onClaim} style={[styles.inlineClaim, claiming && styles.disabled]}>
          {claiming ? <ActivityIndicator size="small" color="#071116" /> : <Text style={styles.inlineClaimText}>АРЕНДОВАТЬ · {money(parcel.claimCost)}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function Step({ ok, number: n, title }: { ok: boolean; number: string; title: string }) {
  return <View style={[styles.step, ok && styles.stepDone]}><Text style={styles.stepNumber}>{ok ? '✓' : n}</Text><Text style={styles.stepTitle}>{title}</Text></View>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return <View style={styles.check}><Text style={[styles.checkIcon, ok ? styles.checkOk : styles.checkBad]}>{ok ? '✓' : '×'}</Text><Text style={styles.checkText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  loading: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 8 },
  muted: { color: '#8296a0', fontSize: 9 },
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, borderRadius: 12, backgroundColor: 'rgba(8,24,31,0.96)', borderWidth: 1, borderColor: 'rgba(78,205,218,0.2)' },
  resourceIcon: { width: 46, height: 46 },
  eyebrow: { color: '#51d8e6', fontSize: 7, fontWeight: '900', letterSpacing: 0.9 },
  title: { color: '#eef6f8', fontSize: 13, fontWeight: '900' },
  h3: { color: '#6f838d', fontSize: 6.3 },
  confidence: { minWidth: 62, padding: 7, alignItems: 'center', borderRadius: 9, backgroundColor: 'rgba(34,78,86,0.45)' },
  confidenceValue: { color: '#5de1eb', fontSize: 14, fontWeight: '900' },
  confidenceLabel: { color: '#71868f', fontSize: 6 },
  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 6, borderRadius: 10, backgroundColor: 'rgba(5,18,25,0.9)' },
  step: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.03)' },
  stepDone: { backgroundColor: 'rgba(52,164,116,0.18)' },
  stepNumber: { color: '#e4bd58', fontSize: 9, fontWeight: '900' },
  stepTitle: { color: '#71858f', fontSize: 5.5, fontWeight: '900', marginTop: 1 },
  stepArrow: { color: '#4d626c', fontSize: 13 },
  parcel: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1 },
  parcelIcon: { width: 40, height: 40 },
  parcelOwned: { backgroundColor: 'rgba(32,92,64,0.42)', borderColor: 'rgba(76,221,154,0.32)' },
  parcelFree: { backgroundColor: 'rgba(77,55,18,0.72)', borderColor: 'rgba(241,184,61,0.42)' },
  parcelRival: { backgroundColor: 'rgba(91,34,38,0.52)', borderColor: 'rgba(238,91,99,0.38)' },
  parcelOwnedTitle: { color: '#64dca9', fontSize: 9, fontWeight: '900' },
  parcelFreeTitle: { color: '#f1be4e', fontSize: 9, fontWeight: '900' },
  parcelRivalTitle: { color: '#f4777e', fontSize: 9, fontWeight: '900' },
  parcelText: { color: '#a6b2b7', fontSize: 8, lineHeight: 12, marginTop: 2 },
  inlineClaim: { minHeight: 34, marginTop: 7, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e6b448' },
  inlineClaimText: { color: '#071116', fontSize: 8, fontWeight: '900' },
  construction: { flexDirection: 'row', gap: 8, padding: 9, borderRadius: 11, backgroundColor: 'rgba(37,72,89,0.48)', borderWidth: 1, borderColor: 'rgba(79,190,226,0.28)' },
  constructionIcon: { width: 43, height: 43 },
  constructionLabel: { color: '#6ec6e6', fontSize: 7, fontWeight: '900' },
  constructionTitle: { color: '#d9f3fc', fontSize: 11, fontWeight: '900', marginTop: 2 },
  constructionTrack: { height: 5, marginTop: 5, borderRadius: 5, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' },
  constructionFill: { height: '100%', backgroundColor: '#5ccde8' },
  option: { padding: 9, borderRadius: 12, backgroundColor: 'rgba(9,22,27,0.96)', borderWidth: 1, borderColor: 'rgba(155,122,47,0.2)' },
  optionRecommended: { borderColor: 'rgba(225,173,57,0.42)' },
  optionSelected: { backgroundColor: 'rgba(55,67,33,0.95)', borderColor: 'rgba(103,210,150,0.35)' },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  methodIconFrame: { width: 47, height: 47, borderRadius: 9, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.035)' },
  methodIcon: { width: 45, height: 45 },
  optionTitle: { color: '#f0f4f5', fontSize: 10.5, fontWeight: '900' },
  description: { color: '#8d9ba1', fontSize: 7.6, lineHeight: 11, marginTop: 2 },
  recommended: { color: '#e6b84d', fontSize: 5.5, fontWeight: '900' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  metric: { width: '48%', padding: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.025)' },
  metricLabel: { color: '#71838a', fontSize: 5.7, fontWeight: '900' },
  metricValue: { color: '#d9e1e4', fontSize: 8.8, fontWeight: '900', marginTop: 2 },
  selectButton: { minHeight: 37, marginTop: 7, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#5c9789' },
  selectButtonDone: { backgroundColor: 'rgba(68,159,119,0.65)' },
  selectText: { color: '#071116', fontSize: 8, fontWeight: '900' },
  approval: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(43,31,10,0.78)', borderWidth: 1, borderColor: 'rgba(223,168,47,0.3)' },
  approvalTitle: { color: '#e6b84c', fontSize: 9, fontWeight: '900', marginBottom: 5 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  checkIcon: { width: 16, fontSize: 12, fontWeight: '900' },
  checkOk: { color: '#4bd9a1' },
  checkBad: { color: '#f16b72' },
  checkText: { color: '#a4afb3', fontSize: 8 },
  claimButton: { minHeight: 43, marginTop: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e7b548' },
  claimButtonText: { color: '#071116', fontSize: 8, fontWeight: '900' },
  approveButton: { minHeight: 43, marginTop: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#d8a536' },
  approveText: { color: '#071116', fontSize: 8, fontWeight: '900' },
  footerHint: { color: '#756b51', fontSize: 6.5, lineHeight: 10, marginTop: 6 },
  disabled: { opacity: 0.4 },
});
