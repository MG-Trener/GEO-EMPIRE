import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { industrialIconForBuilding, resourceIconForCode } from './gameAssets';
import type { ExtractionStatus, GeologyCapabilities, GeologyScanResponse, WorldCell } from './types';

export type TerritoryAction = 'claim' | 'extract' | 'collect' | null;

type Props = {
  selectedCell: WorldCell | null;
  ownedByPlayer: boolean;
  isExtractionBuilding: boolean;
  action: TerritoryAction;
  scanning: boolean;
  loadingExtraction: boolean;
  extraction: ExtractionStatus | null;
  scan: GeologyScanResponse | null;
  scanCapabilities: GeologyCapabilities | null;
  depositsInSelectedCell: GeologyScanResponse['deposits'];
  claimCost: number;
  onClaim: () => void;
  onScan: () => void;
  onOpenDevelopment: () => void;
  onCollect: () => void;
  onStartExtraction: (depositId: string) => void;
};

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value: number, maxDigits = 0): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: maxDigits }).format(finiteNumber(value));
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(finiteNumber(seconds)));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function isConstructing(cell: WorldCell | null, now: number): boolean {
  const building = cell?.building;
  if (!building) return false;
  const normalized = String(building.status ?? '').toUpperCase();
  const constructionStatus = normalized.includes('CONSTRUCT')
    || normalized.includes('BUILD')
    || normalized.includes('PLANNED')
    || normalized.includes('СТРО');
  const end = building.completedAt ? new Date(building.completedAt).getTime() : Number.POSITIVE_INFINITY;
  return constructionStatus && end > now;
}

export function FirstMiningTerritoryPanel({
  selectedCell,
  ownedByPlayer,
  isExtractionBuilding,
  action,
  scanning,
  loadingExtraction,
  extraction,
  scan,
  scanCapabilities,
  depositsInSelectedCell,
  claimCost,
  onClaim,
  onScan,
  onOpenDevelopment,
  onCollect,
  onStartExtraction,
}: Props) {
  const [now, setNow] = useState(Date.now());
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (scanning && scanStartedAt === null) setScanStartedAt(Date.now());
    if (!scanning && scanStartedAt !== null) setScanStartedAt(null);
  }, [scanStartedAt, scanning]);

  const constructing = isConstructing(selectedCell, now);
  const needsClock = scanning || constructing || extraction?.status === 'running';

  useEffect(() => {
    if (!needsClock) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [needsClock]);

  const construction = useMemo(() => {
    const building = selectedCell?.building;
    if (!building || !constructing) return null;
    const start = building.startedAt ? new Date(building.startedAt).getTime() : null;
    const end = building.completedAt ? new Date(building.completedAt).getTime() : null;
    const remainingSeconds = end ? Math.max(0, (end - now) / 1000) : 0;
    const progress = start && end && end > start
      ? Math.max(0, Math.min(1, (now - start) / (end - start)))
      : 0;
    return { remainingSeconds, progress };
  }, [constructing, now, selectedCell?.building]);

  const liveExtraction = useMemo(() => {
    if (!extraction) return null;

    const ratePerHour = Math.max(0, finiteNumber(extraction.ratePerHour));
    const maxBufferHours = Math.max(0, finiteNumber(extraction.maxBufferHours));
    const capacity = Math.max(0.01, ratePerHour * maxBufferHours);
    const reportedAvailable = Math.max(0, finiteNumber(extraction.availableToCollect));
    const depositRemaining = Math.max(0, finiteNumber(extraction.deposit.quantityRemaining));

    if (extraction.status !== 'running') {
      const available = Math.min(depositRemaining, capacity, reportedAvailable);
      return {
        available,
        capacity,
        fill: Math.max(0, Math.min(1, available / capacity)),
        fullInSeconds: 0,
      };
    }

    const collectedAtMs = Date.parse(String(extraction.lastCollectedAt ?? ''));
    const elapsedHours = Number.isFinite(collectedAtMs)
      ? Math.max(0, (now - collectedAtMs) / 3_600_000)
      : 0;
    const available = Math.min(
      depositRemaining,
      capacity,
      Math.max(reportedAvailable, ratePerHour * elapsedHours),
    );
    const fill = Math.max(0, Math.min(1, available / capacity));
    const fullInSeconds = ratePerHour > 0
      ? Math.max(0, capacity - available) / ratePerHour * 3600
      : 0;
    return { available, capacity, fill, fullInSeconds };
  }, [extraction, now]);

  if (!selectedCell) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>Выберите участок на карте</Text>
        <Text style={styles.infoText}>Первый шаг - выбрать свободную H3-ячейку рядом с вашей геопозицией.</Text>
      </View>
    );
  }

  const rival = Boolean(selectedCell.claim && !ownedByPlayer);
  const primaryDeposit = depositsInSelectedCell[0] ?? null;
  const canClaim = !selectedCell.claim && depositsInSelectedCell.length > 0;
  const canDevelop = ownedByPlayer && !selectedCell.building && depositsInSelectedCell.length > 0;
  const buildingReady = Boolean(selectedCell.building && !constructing);
  const canStartExtraction = Boolean(
    ownedByPlayer
      && isExtractionBuilding
      && buildingReady
      && !extraction
      && primaryDeposit,
  );
  const scanElapsed = scanning && scanStartedAt ? Math.max(0, (now - scanStartedAt) / 1000) : 0;

  const stateTitle = constructing
    ? 'Строительство объекта'
    : extraction?.status === 'running'
      ? 'Добыча активна'
      : canStartExtraction
        ? 'Объект готов к работе'
        : canDevelop
          ? 'Участок готов к разработке'
          : canClaim
            ? 'Месторождение найдено'
            : rival
              ? 'Территория конкурента'
              : depositsInSelectedCell.length
                ? 'Залежь изучена'
                : 'Нужна георазведка';

  const nextStep = constructing
    ? `Дождитесь завершения: ${formatClock(construction?.remainingSeconds ?? 0)}`
    : extraction?.status === 'running'
      ? 'Добыча идёт автоматически. Забирайте накопленный ресурс со склада.'
      : canStartExtraction
        ? 'Следующий шаг - запустить добычу.'
        : canDevelop
          ? 'Следующий шаг - выбрать проект разработки и построить объект.'
          : canClaim
            ? 'Следующий шаг - взять этот участок в аренду.'
            : rival
              ? 'Участок уже принадлежит другой компании.'
              : depositsInSelectedCell.length
                ? 'Залежь уже известна. Продолжайте по доступному действию.'
                : 'Проведите георазведку, чтобы найти промышленную залежь.';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>ТЕКУЩИЙ ШАГ</Text>
          <Text style={styles.title}>{stateTitle}</Text>
          <Text style={styles.cell} numberOfLines={1}>H3 {selectedCell.h3Index}</Text>
        </View>
        <View style={[styles.badge, rival ? styles.badgeRival : ownedByPlayer ? styles.badgeOwned : styles.badgeFree]}>
          <Text style={styles.badgeText}>{rival ? 'КОНКУРЕНТ' : ownedByPlayer ? 'НАШ' : 'СВОБОДЕН'}</Text>
        </View>
      </View>

      <View style={styles.nextBox}>
        <Text style={styles.nextLabel}>ЧТО ДЕЛАТЬ ДАЛЬШЕ</Text>
        <Text style={styles.nextText}>{nextStep}</Text>
      </View>

      {selectedCell.building ? (
        <View style={styles.objectCard}>
          <Image
            source={industrialIconForBuilding(
              selectedCell.building.code,
              constructing ? 'constructing' : selectedCell.building.status,
            )}
            style={styles.objectIcon}
            resizeMode="contain"
          />
          <View style={styles.flex}>
            <Text style={styles.objectTitle}>{selectedCell.building.name ?? selectedCell.building.code ?? 'Промышленный объект'} · LV {selectedCell.building.level ?? 1}</Text>
            <Text style={styles.infoText}>{constructing ? 'Строительство' : extraction?.status === 'running' ? 'Работает' : 'Готов к запуску'}</Text>
          </View>
        </View>
      ) : primaryDeposit ? (
        <View style={styles.depositCard}>
          <Image source={resourceIconForCode(primaryDeposit.resource.code)} style={styles.depositIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <Text style={styles.objectTitle}>{primaryDeposit.resource.name}</Text>
            <Text style={styles.infoText}>Плотность {Math.round(finiteNumber(primaryDeposit.estimates.density.value) * 100)}% · достоверность {Math.round(finiteNumber(primaryDeposit.estimates.confidence) * 100)}%</Text>
            <Text style={styles.infoText}>Глубина {formatNumber(primaryDeposit.estimates.depthFromMeters)}–{formatNumber(primaryDeposit.estimates.depthToMeters)} м</Text>
          </View>
          <Text style={styles.rarity}>R{primaryDeposit.resource.rarity}</Text>
        </View>
      ) : null}

      {construction ? (
        <View style={styles.progressBox}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>СТРОИТЕЛЬСТВО</Text>
            <Text style={styles.timer}>{formatClock(construction.remainingSeconds)}</Text>
          </View>
          <ProgressBar progress={construction.progress} tone="amber" />
          <Text style={styles.progressPercent}>{Math.round(finiteNumber(construction.progress) * 100)}%</Text>
        </View>
      ) : null}

      {loadingExtraction ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#38d8ff" />
          <Text style={styles.infoText}>Проверяю состояние добычи…</Text>
        </View>
      ) : null}

      {extraction && liveExtraction ? (
        <View style={styles.productionCard}>
          <View style={styles.productionHeader}>
            <Image source={resourceIconForCode(extraction.deposit.resource.code)} style={styles.depositIcon} resizeMode="contain" />
            <View style={styles.flex}>
              <Text style={styles.objectTitle}>{extraction.deposit.resource.name}</Text>
              <Text style={styles.productionRate}>{formatNumber(extraction.ratePerHour, 2)} {extraction.deposit.resource.unit}/ч</Text>
            </View>
            <Text style={styles.timer}>{Math.round(finiteNumber(liveExtraction.fill) * 100)}%</Text>
          </View>
          <ProgressBar progress={liveExtraction.fill} tone="green" />
          <Text style={styles.infoText}>Склад: {formatNumber(liveExtraction.available, 2)} / {formatNumber(liveExtraction.capacity, 2)} {extraction.deposit.resource.unit}</Text>
          {extraction.status === 'running' && liveExtraction.fill < 1 ? (
            <Text style={styles.infoText}>До заполнения: {formatClock(liveExtraction.fullInSeconds)}</Text>
          ) : null}
          {extraction.economics?.source === 'development_project' ? (
            <Text style={styles.opex}>OPEX к оплате: {formatNumber(extraction.economics.operatingCostDue ?? 0)} ₡</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actionArea}>
        {rival ? (
          <View style={styles.disabledMessage}><Text style={styles.disabledMessageText}>Действия на чужой территории недоступны.</Text></View>
        ) : constructing ? (
          <ActionButton label={`СТРОИТСЯ · ${formatClock(construction?.remainingSeconds ?? 0)}`} disabled busy={false} tone="amber" onPress={() => {}} />
        ) : extraction?.status === 'running' && liveExtraction ? (
          <ActionButton
            label={`ЗАБРАТЬ · ${formatNumber(liveExtraction.available, 2)} ${extraction.deposit.resource.unit}`}
            disabled={action !== null || liveExtraction.available <= 0.001}
            busy={action === 'collect'}
            tone="green"
            onPress={onCollect}
          />
        ) : canStartExtraction && primaryDeposit ? (
          <ActionButton
            label="ЗАПУСТИТЬ ДОБЫЧУ"
            disabled={action !== null}
            busy={action === 'extract'}
            tone="green"
            onPress={() => onStartExtraction(primaryDeposit.id)}
          />
        ) : canDevelop ? (
          <ActionButton label="НАЧАТЬ РАЗРАБОТКУ" disabled={action !== null} busy={false} tone="amber" onPress={onOpenDevelopment} />
        ) : canClaim ? (
          <ActionButton
            label={`ВЗЯТЬ УЧАСТОК · ${formatNumber(claimCost)} ₡`}
            disabled={action !== null}
            busy={action === 'claim'}
            tone="green"
            onPress={onClaim}
          />
        ) : !selectedCell.building ? (
          <ActionButton
            label={scanning ? `РАЗВЕДКА · ${formatClock(scanElapsed)}` : 'ПРОВЕСТИ ГЕОРАЗВЕДКУ'}
            disabled={scanning || action !== null}
            busy={scanning}
            tone="cyan"
            onPress={onScan}
          />
        ) : null}
      </View>

      {!rival && (Boolean(selectedCell.building) || ownedByPlayer || depositsInSelectedCell.length > 0) ? (
        <View style={styles.secondaryActionArea}>
          <ActionButton
            label={scanning ? `РАЗВЕДКА · ${formatClock(scanElapsed)}` : 'ГЕОРАЗВЕДКА'}
            disabled={scanning || action !== null}
            busy={scanning}
            tone="cyan"
            onPress={onScan}
          />
        </View>
      ) : null}

      {scanCapabilities ? (
        <View style={styles.scanInfo}>
          <Text style={styles.scanInfoTitle}>ВОЗМОЖНОСТИ РАЗВЕДКИ</Text>
          <Text style={styles.scanInfoText}>
            Радиус {formatNumber(scanCapabilities.rangeMeters)} м · глубина {formatNumber(scanCapabilities.maxDepthMeters)} м · точность {Math.round((1 - finiteNumber(scanCapabilities.accuracyError)) * 100)}%
          </Text>
          {scan ? <Text style={styles.scanInfoText}>Последний проход: {scan.capabilities.scannedCellCount} яч. · найдено {scan.deposits.length}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function ProgressBar({ progress, tone }: { progress: number; tone: 'green' | 'amber' }) {
  const safeProgress = Math.max(0, Math.min(1, finiteNumber(progress)));
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          tone === 'green' ? styles.progressGreen : styles.progressAmber,
          { width: `${Math.round(safeProgress * 100)}%` },
        ]}
      />
    </View>
  );
}

function ActionButton({
  label,
  disabled,
  busy,
  tone,
  onPress,
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  tone: 'cyan' | 'green' | 'amber';
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        tone === 'green' && styles.actionGreen,
        tone === 'amber' && styles.actionAmber,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.actionText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: 5 },
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { color: '#65cce0', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#f4f9fc', fontSize: 13, fontWeight: '900', marginTop: 2 },
  cell: { color: '#647f8c', fontSize: 7, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, borderWidth: 1 },
  badgeFree: { backgroundColor: 'rgba(38,170,151,0.12)', borderColor: 'rgba(53,223,158,0.4)' },
  badgeOwned: { backgroundColor: 'rgba(53,223,158,0.18)', borderColor: '#35df9e' },
  badgeRival: { backgroundColor: 'rgba(240,95,101,0.16)', borderColor: '#f05f65' },
  badgeText: { color: '#eaf7fa', fontSize: 6.5, fontWeight: '900' },
  nextBox: { marginTop: 8, padding: 8, borderRadius: 10, backgroundColor: 'rgba(22,107,130,0.14)', borderWidth: 1, borderColor: 'rgba(56,216,255,0.22)' },
  nextLabel: { color: '#48d9f0', fontSize: 6.6, fontWeight: '900', letterSpacing: 0.8 },
  nextText: { color: '#d9e8ed', fontSize: 9, lineHeight: 12, fontWeight: '700', marginTop: 3 },
  objectCard: { marginTop: 8, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.035)' },
  objectIcon: { width: 48, height: 48 },
  depositCard: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 7, padding: 8, borderRadius: 10, backgroundColor: 'rgba(12,61,69,0.54)', borderWidth: 1, borderColor: 'rgba(55,218,178,0.22)' },
  depositIcon: { width: 38, height: 38 },
  objectTitle: { color: '#f5f9fb', fontSize: 10.5, fontWeight: '900' },
  infoText: { color: '#9fb2bc', fontSize: 8, lineHeight: 11, marginTop: 2 },
  rarity: { color: '#f4c65b', fontSize: 8, fontWeight: '900' },
  progressBox: { marginTop: 8, padding: 8, borderRadius: 10, backgroundColor: 'rgba(115,77,18,0.18)', borderWidth: 1, borderColor: 'rgba(244,189,66,0.28)' },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel: { color: '#e8bc53', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  timer: { color: '#f6d776', fontSize: 9, fontWeight: '900' },
  progressTrack: { height: 6, marginTop: 6, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' },
  progressFill: { height: '100%', borderRadius: 6 },
  progressGreen: { backgroundColor: '#35df9e' },
  progressAmber: { backgroundColor: '#f4bd42' },
  progressPercent: { color: '#8e9fa6', fontSize: 7, textAlign: 'right', marginTop: 2 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  productionCard: { marginTop: 8, padding: 8, borderRadius: 10, backgroundColor: 'rgba(17,92,72,0.18)', borderWidth: 1, borderColor: 'rgba(53,223,158,0.25)' },
  productionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  productionRate: { color: '#41dfa8', fontSize: 8.5, fontWeight: '900', marginTop: 2 },
  opex: { color: '#f4c65b', fontSize: 7.5, fontWeight: '800', marginTop: 3 },
  actionArea: { marginTop: 8 },
  secondaryActionArea: { marginTop: 5 },
  actionButton: { minHeight: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a4052', borderWidth: 1, borderColor: '#32cce7' },
  actionGreen: { backgroundColor: '#0b4d34', borderColor: '#35df9e' },
  actionAmber: { backgroundColor: '#51370c', borderColor: '#f4bd42' },
  actionText: { color: '#f5fbfd', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.45 },
  disabled: { opacity: 0.52 },
  disabledMessage: { padding: 9, borderRadius: 9, backgroundColor: 'rgba(240,95,101,0.08)' },
  disabledMessageText: { color: '#cb8c91', fontSize: 8.5, textAlign: 'center' },
  scanInfo: { marginTop: 8, paddingTop: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  scanInfoTitle: { color: '#6f93a2', fontSize: 6.5, fontWeight: '900', letterSpacing: 0.7 },
  scanInfoText: { color: '#718994', fontSize: 7.5, lineHeight: 10, marginTop: 2 },
  emptyBox: { paddingVertical: 14, alignItems: 'center' },
  emptyTitle: { color: '#f1f8fb', fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
