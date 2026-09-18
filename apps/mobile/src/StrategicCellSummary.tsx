import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { gameAssets, resourceIconForCode } from './gameAssets';
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
  onExpand: () => void;
};

function shortNumber(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
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
  onExpand,
}: Props) {
  if (!cell) return null;

  const owned = cell.claim?.ownerId === playerId;
  const rival = Boolean(cell.claim && !owned);
  const primaryDeposit = deposits[0] ?? null;
  const canClaim = !cell.claim && deposits.length > 0;
  const canDevelop = owned && !cell.building && deposits.length > 0;

  const status = cell.building
    ? 'ПРОМЫШЛЕННЫЙ ОБЪЕКТ'
    : owned
      ? 'ВАША ТЕРРИТОРИЯ'
      : rival
        ? 'КОНКУРЕНТ'
        : deposits.length
          ? 'ПЕРСПЕКТИВНЫЙ УЧАСТОК'
          : 'СВОБОДНЫЙ УЧАСТОК';

  const subtitle = cell.building
    ? `${cell.building.name ?? cell.building.code ?? 'Объект'} · LV ${cell.building.level ?? 1}`
    : primaryDeposit
      ? `${primaryDeposit.resource.name} · плотность ${Math.round(primaryDeposit.estimates.density.value * 100)}%`
      : rival
        ? (cell.claim?.ownerName ?? 'Чужая компания')
        : `H3 ${cell.h3Index.slice(-8)}`;

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
                ? gameAssets.utility.build
                : owned
                  ? gameAssets.utility.territories
                  : gameAssets.utility.marker}
            style={styles.icon}
            resizeMode="contain"
          />
        </View>

        <View style={styles.textBlock}>
          <Text style={styles.status}>{status}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          {extraction ? (
            <Text style={styles.production} numberOfLines={1}>
              {shortNumber(extraction.ratePerHour)} {extraction.deposit.resource.unit}/ч · накоплено {shortNumber(extraction.availableToCollect)}
            </Text>
          ) : null}
        </View>

        <Image source={gameAssets.actions.info} style={styles.infoIcon} resizeMode="contain" />
      </Pressable>

      <View style={styles.actions}>
        <QuickAction
          source={gameAssets.actions.research}
          label={scanning ? 'СКАНИРУЕМ' : 'РАЗВЕДКА'}
          busy={scanning}
          disabled={scanning || busy || rival}
          onPress={onScan}
        />

        {canClaim ? (
          <QuickAction
            source={gameAssets.actions.place}
            label={`АРЕНДА ${shortNumber(claimCost)} ₡`}
            disabled={busy}
            onPress={onClaim}
            accent="green"
          />
        ) : canDevelop ? (
          <QuickAction
            source={gameAssets.nav.development}
            label="РАЗРАБОТКА"
            disabled={busy}
            onPress={onDevelop}
            accent="amber"
          />
        ) : (
          <QuickAction
            source={gameAssets.utility.list}
            label="ПОДРОБНЕЕ"
            disabled={false}
            onPress={onExpand}
          />
        )}
      </View>
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
  iconFrame: { width: 43, height: 43, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.035)', justifyContent: 'center', alignItems: 'center' },
  icon: { width: 39, height: 39 },
  textBlock: { flex: 1, minWidth: 0 },
  status: { color: '#6f96a7', fontSize: 6.6, fontWeight: '900', letterSpacing: 0.9 },
  subtitle: { color: '#eef8fb', fontSize: 10.5, fontWeight: '900', marginTop: 2 },
  production: { color: '#45ddb2', fontSize: 7, fontWeight: '800', marginTop: 2 },
  infoIcon: { width: 28, height: 28, opacity: 0.76 },
  actions: { flexDirection: 'row', gap: 5, marginTop: 4 },
  action: {
    flex: 1,
    height: 32,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
    borderRadius: 9,
    backgroundColor: 'rgba(18,82,104,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.34)',
  },
  actionGreen: { backgroundColor: 'rgba(20,104,72,0.32)', borderColor: 'rgba(53,223,158,0.4)' },
  actionAmber: { backgroundColor: 'rgba(118,79,16,0.34)', borderColor: 'rgba(244,189,66,0.45)' },
  actionIcon: { width: 24, height: 24 },
  actionText: { color: '#e9f7fa', fontSize: 6.7, fontWeight: '900', letterSpacing: 0.25 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.73, transform: [{ scale: 0.985 }] },
});
