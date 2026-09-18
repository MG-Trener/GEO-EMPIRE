import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { resourceIconForCode } from './gameAssets';
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

function formatNumber(value: number, maxDigits = 0): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: maxDigits }).format(value);
}

export function TerritoryPanel({
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
  const previewCellCount = scanCapabilities
    ? 1 + 3 * scanCapabilities.coverageRing * (scanCapabilities.coverageRing + 1)
    : 1;
  const canClaim = Boolean(selectedCell && !selectedCell.claim && scan && depositsInSelectedCell.length > 0);
  const canPlan = Boolean(selectedCell && ownedByPlayer && !selectedCell.building && depositsInSelectedCell.length > 0);

  return (
    <>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>ВЫБРАННЫЙ УЧАСТОК</Text>
          <Text style={styles.cellTitle} numberOfLines={1}>{selectedCell?.h3Index ?? 'Выберите ячейку на карте'}</Text>
        </View>
        <View style={[styles.badge, selectedCell?.occupied ? styles.badgeBusy : styles.badgeFree]}>
          <Text style={styles.badgeText}>{selectedCell?.occupied ? 'ЗАНЯТО' : 'СВОБОДНО'}</Text>
        </View>
      </View>

      {selectedCell?.building ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{selectedCell.building.name ?? selectedCell.building.code}</Text>
          <Text style={styles.infoText}>Уровень: {selectedCell.building.level ?? 1} · статус: {selectedCell.building.status ?? '—'}</Text>
        </View>
      ) : selectedCell?.claim ? (
        <Text style={styles.infoText}>
          {ownedByPlayer
            ? 'Участок вашей компании. Подготовьте проект разработки подтверждённой залежи.'
            : 'Территория принадлежит другой компании.'}
        </Text>
      ) : (
        <Text style={styles.infoText}>
          {scan
            ? 'Залежь найдена - теперь можно арендовать перспективный участок.'
            : 'Сначала проведите георазведку. Аренда участка открывается после обнаружения залежи.'}
        </Text>
      )}

      {selectedCell && scanCapabilities ? (
        <View style={styles.scanPreviewBox}>
          <Text style={styles.scanPreviewTitle}>ЗОНА ГЕОРАЗВЕДКИ</Text>
          <Text style={styles.scanPreviewText}>
            Цель: {formatNumber(scanCapabilities.rangeMeters)} м · охват: {previewCellCount} яч. · глубина: {formatNumber(scanCapabilities.maxDepthMeters)} м · точность: {Math.round((1 - scanCapabilities.accuracyError) * 100)}%
          </Text>
        </View>
      ) : null}

      <View style={styles.actionGrid}>
        <ActionButton
          busy={scanning}
          disabled={scanning || !selectedCell || action !== null}
          label="ПРОВЕСТИ ГЕОРАЗВЕДКУ"
          tone="cyan"
          onPress={onScan}
        />
        {canClaim ? (
          <ActionButton
            busy={action === 'claim'}
            disabled={action !== null}
            label={`АРЕНДОВАТЬ · ${formatNumber(claimCost)} ₡`}
            tone="green"
            onPress={onClaim}
          />
        ) : null}
        {canPlan ? (
          <ActionButton
            busy={false}
            disabled={action !== null}
            label="ПРОЕКТ РАЗРАБОТКИ"
            tone="amber"
            onPress={onOpenDevelopment}
          />
        ) : null}
      </View>

      {loadingExtraction ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator size="small" color="#38d8ff" />
          <Text style={styles.infoText}>Проверка добычи…</Text>
        </View>
      ) : null}

      {ownedByPlayer && isExtractionBuilding && extraction ? (
        <View style={styles.productionCard}>
          <View style={styles.rowBetween}>
            <View style={styles.productionTitleRow}>
              <Image source={resourceIconForCode(extraction.deposit.resource.code)} style={styles.depositIcon} resizeMode="contain" />
              <View>
                <Text style={styles.eyebrow}>ДОБЫЧА</Text>
                <Text style={styles.infoTitle}>{extraction.deposit.resource.name}</Text>
              </View>
            </View>
            <Text style={styles.productionRate}>{formatNumber(extraction.ratePerHour, 2)} {extraction.deposit.resource.unit}/ч</Text>
          </View>
          <Text style={styles.infoText}>Накоплено: {formatNumber(extraction.availableToCollect, 2)} {extraction.deposit.resource.unit}</Text>
          <Text style={styles.infoText}>Остаток: {formatNumber(extraction.deposit.quantityRemaining, 2)} {extraction.deposit.resource.unit}</Text>
          {extraction.economics?.source === 'development_project' ? (
            <Text style={styles.operatingCost}>OPEX к оплате: {formatNumber(extraction.economics.operatingCostDue ?? 0)} ₡</Text>
          ) : null}
          <ActionButton
            busy={action === 'collect'}
            disabled={action !== null || extraction.availableToCollect <= 0}
            label={`ЗАБРАТЬ · ${formatNumber(extraction.availableToCollect, 2)} ${extraction.deposit.resource.unit}`}
            tone="green"
            onPress={onCollect}
          />
        </View>
      ) : null}

      {scan ? (
        <View style={styles.scanResults}>
          <View style={styles.statsRow}>
            <Stat value={`${scan.capabilities.maxDepthMeters} м`} label="глубина" />
            <Stat value={`${scan.capabilities.scannedCellCount}`} label="ячеек" />
            <Stat value={`${Math.round(scan.capabilities.confidence * 100)}%`} label="достоверность" />
          </View>
          <Text style={styles.scanMeta}>Выберите ресурс в строке «Карта месторождений» над картой - цвет покажет насыщенность залежи.</Text>

          {scan.deposits.length ? scan.deposits.map((deposit) => {
            const canStartHere = ownedByPlayer
              && isExtractionBuilding
              && !extraction
              && deposit.h3Index === selectedCell?.h3Index;

            return (
              <View key={deposit.id} style={styles.depositCard}>
                <View style={styles.depositHeader}>
                  <Image source={resourceIconForCode(deposit.resource.code)} style={styles.depositIcon} resizeMode="contain" />
                  <View style={styles.flex}>
                    <Text style={styles.depositName}>{deposit.resource.name}</Text>
                    <Text style={styles.depositText}>Глубина: {formatNumber(deposit.estimates.depthFromMeters)}–{formatNumber(deposit.estimates.depthToMeters)} м</Text>
                    <Text style={styles.depositText}>Плотность: {Math.round(deposit.estimates.density.value * 100)}% · запасы: {formatNumber(deposit.estimates.quantity.min)}–{formatNumber(deposit.estimates.quantity.max)} {deposit.resource.unit}</Text>
                  </View>
                  <Text style={styles.rarity}>R{deposit.resource.rarity}</Text>
                </View>
                {canStartHere ? (
                  <ActionButton
                    busy={action === 'extract'}
                    disabled={action !== null}
                    label="ЗАПУСТИТЬ ДОБЫЧУ"
                    tone="amber"
                    onPress={() => onStartExtraction(deposit.id)}
                  />
                ) : null}
              </View>
            );
          }) : (
            <Text style={styles.emptyText}>Данные по залежам на текущей глубине не получены. Улучшите глубину или чувствительность.</Text>
          )}
        </View>
      ) : null}
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionButton({
  busy,
  disabled,
  label,
  tone = 'cyan',
  onPress,
}: {
  busy: boolean;
  disabled: boolean;
  label: string;
  tone?: 'cyan' | 'green' | 'amber';
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        tone === 'green' && styles.actionButtonGreen,
        tone === 'amber' && styles.actionButtonAmber,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.actionButtonText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  eyebrow: { color: '#6e91a8', fontSize: 8, letterSpacing: 1.1, fontWeight: '800' },
  cellTitle: { color: '#f4f9fc', fontSize: 11.5, fontWeight: '800', marginTop: 2 },
  badge: { borderRadius: 18, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1 },
  badgeBusy: { backgroundColor: 'rgba(184,58,58,0.18)', borderColor: 'rgba(243,95,95,0.45)' },
  badgeFree: { backgroundColor: 'rgba(28,123,110,0.18)', borderColor: 'rgba(33,215,168,0.42)' },
  badgeText: { color: '#f1f8fb', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  infoBox: { marginTop: 7, padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  infoTitle: { color: '#f4c957', fontSize: 12, fontWeight: '800' },
  infoText: { color: '#b6c3cc', fontSize: 9.5, lineHeight: 13, marginTop: 4 },
  scanPreviewBox: { marginTop: 7, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9, backgroundColor: 'rgba(20,93,113,0.17)', borderWidth: 1, borderColor: 'rgba(56,216,255,0.18)' },
  scanPreviewTitle: { color: '#45d9f2', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  scanPreviewText: { color: '#9eb8c3', fontSize: 8.5, lineHeight: 12, marginTop: 2 },
  actionGrid: { marginTop: 2 },
  actionButton: { marginTop: 6, minHeight: 38, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: '#08394a', borderWidth: 1, borderColor: '#27cce9' },
  actionButtonGreen: { backgroundColor: '#0b472e', borderColor: '#31df8b' },
  actionButtonAmber: { backgroundColor: '#4e350b', borderColor: '#f4b53c' },
  actionButtonText: { color: '#f7fbfd', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.45 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
  inlineLoading: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  productionCard: { marginTop: 9, padding: 9, borderRadius: 11, backgroundColor: 'rgba(9,51,64,0.5)', borderWidth: 1, borderColor: 'rgba(56,216,255,0.26)' },
  productionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  productionRate: { color: '#47e5bc', fontSize: 9.5, fontWeight: '900' },
  operatingCost: { color: '#f5c451', fontSize: 8.5, fontWeight: '900', marginTop: 4 },
  scanResults: { marginTop: 9 },
  scanMeta: { color: '#75909d', fontSize: 8.5, lineHeight: 12, marginBottom: 4 },
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 7 },
  stat: { flex: 1, padding: 7, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(56,216,255,0.09)' },
  statValue: { color: '#38d8ff', fontSize: 11, fontWeight: '800' },
  statLabel: { color: '#879baa', fontSize: 7.5, marginTop: 2 },
  depositCard: { marginTop: 6, padding: 8, borderRadius: 10, backgroundColor: 'rgba(13,56,63,0.58)', borderWidth: 1, borderColor: 'rgba(33,215,168,0.24)' },
  depositHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  depositIcon: { width: 40, height: 40 },
  depositName: { color: '#f3f7fa', fontSize: 11, fontWeight: '800' },
  rarity: { color: '#f5c451', fontSize: 8.5, fontWeight: '900' },
  depositText: { color: '#aebcc6', fontSize: 8.5, marginTop: 2 },
  emptyText: { color: '#91a5b2', fontSize: 9.5, marginTop: 7 },
});
