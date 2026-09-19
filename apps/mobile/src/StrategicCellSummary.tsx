import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { gameAssets, industrialIconForBuilding, resourceIconForCode } from './gameAssets';
import type { ExtractionStatus, GeologyScanResponse, WorldCell } from './types';

type Props = {
  cell: WorldCell | null;
  playerId: string;
  deposits: GeologyScanResponse['deposits'];
  extraction: ExtractionStatus | null;
  scanning: boolean;
  busy: boolean;
  claimCost: number;
  onScan: () => void;
  onClaim: () => void;
  onDevelop: () => void;
  onCollect?: () => void;
  onStartExtraction?: (depositId: string) => void;
  onExpand: () => void;
};

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shortNumber(value: number): string {
  const safeValue = finiteNumber(value);
  const absolute = Math.abs(safeValue);
  if (absolute >= 1_000_000_000) return `${(safeValue / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${(safeValue / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${(safeValue / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(safeValue);
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(finiteNumber(seconds)));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function isExtractionBuilding(code?: string | null): boolean {
  return ['MINE', 'OIL_WELL', 'GAS_WELL'].includes(String(code ?? '').toUpperCase());
}

function constructionState(cell: WorldCell, now: number) {
  const building = cell.building;
  if (!building) return { underConstruction: false, remainingSeconds: 0, progress: 0 };
  const normalized = String(building.status ?? '').toUpperCase();
  const statusSaysConstruction = normalized.includes('CONSTRUCT') || normalized.includes('BUILD') || normalized.includes('PLANNED') || normalized.includes('СТРО');
  const start = building.startedAt ? new Date(building.startedAt).getTime() : null;
  const end = building.completedAt ? new Date(building.completedAt).getTime() : null;
  const underConstruction = Boolean(statusSaysConstruction && (!end || end > now));
  const remainingSeconds = underConstruction && end ? Math.max(0, (end - now) / 1000) : 0;
  const progress = underConstruction && start && end && end > start
    ? Math.max(0, Math.min(1, (now - start) / (end - start)))
    : underConstruction ? 0 : 1;
  return { underConstruction, remainingSeconds, progress };
}

export function StrategicCellSummary({
  cell,
  playerId,
  deposits,
  extraction,
  scanning,
  busy,
  claimCost,
  onScan,
  onClaim,
  onDevelop,
  onCollect,
  onStartExtraction,
  onExpand,
}: Props) {
  const [now, setNow] = useState(Date.now());
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (scanning && scanStartedAt === null) setScanStartedAt(Date.now());
    if (!scanning && scanStartedAt !== null) setScanStartedAt(null);
  }, [scanStartedAt, scanning]);

  useEffect(() => {
    const needsClock = scanning || Boolean(cell?.building?.completedAt) || extraction?.status === 'running';
    if (!needsClock) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cell?.building?.completedAt, extraction?.status, scanning]);

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
    const remaining = Math.max(0, capacity - available);
    const fullInSeconds = ratePerHour > 0 ? remaining / ratePerHour * 3600 : 0;
    return { available, capacity, fill, fullInSeconds };
  }, [extraction, now]);

  if (!cell) return null;

  const owned = cell.claim?.ownerId === playerId;
  const rival = Boolean(cell.claim && !owned);
  const primaryDeposit = deposits[0] ?? null;
  const construction = constructionState(cell, now);
  const extractionCapable = isExtractionBuilding(cell.building?.code);
  const buildingReady = Boolean(cell.building && !construction.underConstruction);
  const canClaim = !cell.claim && deposits.length > 0;
  const canDevelop = owned && !cell.building && deposits.length > 0;
  const canStartExtraction = Boolean(
    owned
    && cell.building
    && extractionCapable
    && buildingReady
    && !extraction
    && primaryDeposit,
  );

  const status = construction.underConstruction
    ? 'СТРОИТЕЛЬСТВО'
    : extraction?.status === 'running'
      ? 'ДОБЫЧА АКТИВНА'
      : cell.building
        ? 'ПРОМЫШЛЕННЫЙ ОБЪЕКТ'
        : owned
          ? 'ВАША ТЕРРИТОРИЯ'
          : rival
            ? 'КОНКУРЕНТ'
            : deposits.length
              ? 'МЕСТОРОЖДЕНИЕ НАЙДЕНО'
              : 'НЕИССЛЕДОВАННЫЙ УЧАСТОК';

  const subtitle = cell.building
    ? `${cell.building.name ?? cell.building.code ?? 'Объект'} · LV ${cell.building.level ?? 1}`
    : primaryDeposit
      ? `${primaryDeposit.resource.name} · плотность ${Math.round(finiteNumber(primaryDeposit.estimates.density.value) * 100)}%`
      : rival
        ? (cell.claim?.ownerName ?? 'Чужая компания')
        : `H3 ${cell.h3Index.slice(-8)}`;

  const scanElapsed = scanning && scanStartedAt ? Math.max(0, (now - scanStartedAt) / 1000) : 0;

  let primaryAction: {
    label: string;
    source: ReturnType<typeof resourceIconForCode>;
    accent: 'cyan' | 'green' | 'amber';
    disabled: boolean;
    busy?: boolean;
    onPress: () => void;
  };

  if (rival) {
    primaryAction = {
      label: 'ПОДРОБНЕЕ',
      source: gameAssets.actions.info,
      accent: 'cyan',
      disabled: false,
      onPress: onExpand,
    };
  } else if (construction.underConstruction) {
    primaryAction = {
      label: `СТРОИТСЯ · ${formatClock(construction.remainingSeconds)}`,
      source: gameAssets.nav.construction,
      accent: 'amber',
      disabled: true,
      onPress: onExpand,
    };
  } else if (extraction?.status === 'running' && liveExtraction) {
    primaryAction = {
      label: liveExtraction.available > 0.001
        ? `ЗАБРАТЬ ${shortNumber(liveExtraction.available)} ${extraction.deposit.resource.unit}`
        : `ДОБЫЧА · ${formatClock(liveExtraction.fullInSeconds)}`,
      source: gameAssets.actions.collect,
      accent: 'green',
      disabled: busy || liveExtraction.available <= 0.001,
      onPress: onCollect ?? onExpand,
    };
  } else if (canStartExtraction && primaryDeposit) {
    primaryAction = {
      label: 'ЗАПУСТИТЬ ДОБЫЧУ',
      source: gameAssets.actions.extract,
      accent: 'green',
      disabled: busy,
      onPress: () => onStartExtraction?.(primaryDeposit.id),
    };
  } else if (canDevelop) {
    primaryAction = {
      label: 'НАЧАТЬ РАЗРАБОТКУ',
      source: gameAssets.nav.development,
      accent: 'amber',
      disabled: busy,
      onPress: onDevelop,
    };
  } else if (canClaim) {
    primaryAction = {
      label: `ВЗЯТЬ УЧАСТОК · ${shortNumber(claimCost)} ₡`,
      source: gameAssets.actions.place,
      accent: 'green',
      disabled: busy,
      onPress: onClaim,
    };
  } else if (!cell.building && !owned) {
    primaryAction = {
      label: scanning ? `РАЗВЕДКА · ${formatClock(scanElapsed)}` : 'ПРОВЕСТИ РАЗВЕДКУ',
      source: gameAssets.actions.research,
      accent: 'cyan',
      disabled: scanning || busy,
      busy: scanning,
      onPress: onScan,
    };
  } else {
    primaryAction = {
      label: 'ПОДРОБНЕЕ',
      source: gameAssets.actions.info,
      accent: 'cyan',
      disabled: false,
      onPress: onExpand,
    };
  }

  return (
    <View style={styles.card} pointerEvents="auto">
      <Pressable onPress={onExpand} style={({ pressed }) => [styles.identity, pressed && styles.pressed]}>
        <View style={[
          styles.statusRail,
          owned && styles.statusOwned,
          rival && styles.statusRival,
          cell.building && styles.statusIndustry,
        ]} />

        <View style={styles.iconFrame}>
          <Image
            source={primaryDeposit
              ? resourceIconForCode(primaryDeposit.resource.code)
              : cell.building
                ? industrialIconForBuilding(cell.building.code, construction.underConstruction ? 'constructing' : cell.building.status)
                : owned
                  ? gameAssets.utility.territories
                  : gameAssets.utility.marker}
            style={cell.building ? styles.industryIcon : styles.icon}
            resizeMode="contain"
          />
        </View>

        <View style={styles.textBlock}>
          <Text style={styles.status}>{status}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          {construction.underConstruction ? (
            <Text style={styles.timerText}>До завершения: {formatClock(construction.remainingSeconds)}</Text>
          ) : extraction && liveExtraction ? (
            <Text style={styles.production} numberOfLines={1}>
              {shortNumber(extraction.ratePerHour)} {extraction.deposit.resource.unit}/ч · склад {Math.round(liveExtraction.fill * 100)}%
            </Text>
          ) : primaryDeposit && !cell.claim ? (
            <Text style={styles.nextStep}>Следующий шаг: взять участок</Text>
          ) : canDevelop ? (
            <Text style={styles.nextStep}>Следующий шаг: начать разработку</Text>
          ) : canStartExtraction ? (
            <Text style={styles.nextStep}>Объект готов: запустите добычу</Text>
          ) : null}
        </View>

        <Image source={gameAssets.actions.info} style={styles.infoIcon} resizeMode="contain" />
      </Pressable>

      {construction.underConstruction ? (
        <ProgressBar progress={construction.progress} tone="amber" />
      ) : extraction?.status === 'running' && liveExtraction ? (
        <ProgressBar progress={liveExtraction.fill} tone="green" />
      ) : null}

      <View style={styles.actions}>
        <QuickAction {...primaryAction} />
        {!rival && primaryAction.onPress !== onScan ? (
          <QuickAction
            source={gameAssets.actions.research}
            label={scanning ? `РАЗВЕДКА · ${formatClock(scanElapsed)}` : 'РАЗВЕДКА'}
            busy={scanning}
            disabled={scanning || busy}
            onPress={onScan}
          />
        ) : null}
        {primaryAction.onPress !== onExpand ? (
          <QuickAction
            source={gameAssets.utility.list}
            label="ДЕТАЛИ"
            disabled={false}
            onPress={onExpand}
          />
        ) : null}
      </View>
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
          tone === 'amber' ? styles.progressAmber : styles.progressGreen,
          { width: `${Math.round(safeProgress * 100)}%` },
        ]}
      />
    </View>
  );
}

function QuickAction({
  source,
  label,
  busy = false,
  disabled,
  accent = 'cyan',
  onPress,
}: {
  source: ReturnType<typeof resourceIconForCode>;
  label: string;
  busy?: boolean;
  disabled: boolean;
  accent?: 'cyan' | 'green' | 'amber';
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        accent === 'green' && styles.actionGreen,
        accent === 'amber' && styles.actionAmber,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color="#dffaff" /> : <Image source={source} style={styles.actionIcon} resizeMode="contain" />}
      <Text style={styles.actionText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    width: '94%',
    padding: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(4,14,22,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(58,195,221,0.3)',
    shadowColor: '#000000',
    shadowOpacity: 0.36,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 9,
  },
  identity: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: 4 },
  statusRail: { width: 3, alignSelf: 'stretch', borderRadius: 3, backgroundColor: '#47bcd1' },
  statusOwned: { backgroundColor: '#35df9e' },
  statusRival: { backgroundColor: '#f05f65' },
  statusIndustry: { backgroundColor: '#f4bd42' },
  iconFrame: { width: 43, height: 43, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.035)', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  icon: { width: 39, height: 39 },
  industryIcon: { width: 43, height: 43 },
  textBlock: { flex: 1, minWidth: 0 },
  status: { color: '#6f96a7', fontSize: 6.6, fontWeight: '900', letterSpacing: 0.9 },
  subtitle: { color: '#eef8fb', fontSize: 10.5, fontWeight: '900', marginTop: 2 },
  production: { color: '#45ddb2', fontSize: 7, fontWeight: '800', marginTop: 2 },
  timerText: { color: '#f4c75b', fontSize: 7.2, fontWeight: '900', marginTop: 2 },
  nextStep: { color: '#69dff2', fontSize: 7, fontWeight: '800', marginTop: 2 },
  infoIcon: { width: 28, height: 28, opacity: 0.76 },
  progressTrack: { height: 4, marginTop: 2, marginHorizontal: 2, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressGreen: { backgroundColor: '#35df9e' },
  progressAmber: { backgroundColor: '#f4bd42' },
  actions: { flexDirection: 'row', gap: 4, marginTop: 5 },
  action: {
    flex: 1,
    height: 34,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    borderRadius: 9,
    backgroundColor: 'rgba(18,82,104,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.34)',
  },
  actionGreen: { backgroundColor: 'rgba(20,104,72,0.32)', borderColor: 'rgba(53,223,158,0.4)' },
  actionAmber: { backgroundColor: 'rgba(118,79,16,0.34)', borderColor: 'rgba(244,189,66,0.45)' },
  actionIcon: { width: 21, height: 21 },
  actionText: { color: '#e9f7fa', fontSize: 6.1, fontWeight: '900', letterSpacing: 0.18 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.73, transform: [{ scale: 0.985 }] },
});
