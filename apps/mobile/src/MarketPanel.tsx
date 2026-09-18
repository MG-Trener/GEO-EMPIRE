import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { getMarket, sellResource } from './api';
import { gameAssets, resourceIconForCode } from './gameAssets';
import type { MarketCatalog, MarketOffer } from './types';

type Props = {
  onMessage?: (message: string) => void;
  onSold?: () => Promise<void> | void;
};

function formatNumber(value: number, maxDigits = 2): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: maxDigits }).format(value);
}

export function MarketPanel({ onMessage, onSold }: Props) {
  const [catalog, setCatalog] = useState<MarketCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [sellingId, setSellingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCatalog(await getMarket());
    } catch (error) {
      onMessage?.(`Рынок: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => { void refresh(); }, [refresh]);

  const sell = useCallback(async (offer: MarketOffer, share: 0.25 | 1) => {
    const quantity = Math.floor(offer.quantity * share * 10_000) / 10_000;
    if (quantity <= 0) return;
    setSellingId(offer.resourceId);
    try {
      const result = await sellResource({ resourceId: offer.resourceId, quantity });
      onMessage?.(`Продано ${formatNumber(result.quantity)} ${result.resource.unit} · ${result.resource.name} · +${formatNumber(result.proceeds, 0)} ₡`);
      await Promise.resolve(onSold?.());
      await refresh();
    } catch (error) {
      onMessage?.(`Продажа: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setSellingId(null);
    }
  }, [onMessage, onSold, refresh]);

  if (loading && !catalog) {
    return <View style={styles.loadingBox}><ActivityIndicator /><Text style={styles.muted}>Загрузка товарной биржи…</Text></View>;
  }
  if (!catalog) return null;

  const portfolio = catalog.offers.reduce((sum, offer) => sum + offer.totalValue, 0);

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headingLead}>
          <Image source={gameAssets.nav.trade} style={styles.headingIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>ТОВАРНАЯ БИРЖА</Text>
            <Text style={styles.title}>Продажа ресурсов</Text>
          </View>
        </View>
        <View style={styles.balanceBox}>
          <Text style={styles.balanceLabel}>БАЛАНС</Text>
          <Text style={styles.balance}>{catalog.wallet.soft.toLocaleString('ru-RU')} ₡</Text>
        </View>
      </View>

      <View style={styles.marketSummary}>
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryLabel}>ПОЗИЦИЙ</Text>
          <Text style={styles.summaryValue}>{catalog.offers.length}</Text>
        </View>
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryLabel}>ОЦЕНКА СКЛАДА</Text>
          <Text style={styles.summaryValue}>{formatNumber(portfolio, 0)} ₡</Text>
        </View>
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryLabel}>РЕЖИМ</Text>
          <Text style={[styles.summaryValue, styles.spot]}>СПОТ</Text>
        </View>
      </View>

      {catalog.offers.length ? catalog.offers.map((offer) => {
        const busy = sellingId === offer.resourceId;
        return (
          <View key={offer.resourceId} style={styles.offerCard}>
            <View style={styles.rowBetween}>
              <View style={styles.offerLead}>
                <View style={styles.resourceIconBox}>
                  <Image source={resourceIconForCode(offer.code)} style={styles.resourceIcon} resizeMode="contain" />
                </View>
                <View style={styles.flex}>
                  <View style={styles.nameRow}>
                    <Text style={styles.offerName}>{offer.name}</Text>
                    <Text style={styles.rarity}>R{offer.rarity}</Text>
                  </View>
                  <Text style={styles.stock}>На складе: {formatNumber(offer.quantity)} {offer.unit}</Text>
                </View>
              </View>
              <View style={styles.priceBox}>
                <Text style={styles.price}>{formatNumber(offer.pricePerUnit, 0)} ₡</Text>
                <Text style={styles.perUnit}>за {offer.unit}</Text>
              </View>
            </View>

            <View style={styles.valueBand}>
              <Text style={styles.valueBandLabel}>РЫНОЧНАЯ СТОИМОСТЬ ОСТАТКА</Text>
              <Text style={styles.valueBandValue}>{formatNumber(offer.totalValue, 0)} ₡</Text>
            </View>

            <View style={styles.buttonRow}>
              <SellButton disabled={busy || offer.quantity <= 0} busy={busy} label={`ПРОДАТЬ 25% · ≈${formatNumber(Math.floor(offer.totalValue * 0.25), 0)} ₡`} onPress={() => void sell(offer, 0.25)} />
              <SellButton disabled={busy || offer.quantity <= 0} busy={busy} primary label={`ПРОДАТЬ ВСЁ · ${formatNumber(offer.totalValue, 0)} ₡`} onPress={() => void sell(offer, 1)} />
            </View>
          </View>
        );
      }) : (
        <View style={styles.emptyBox}>
          <Image source={gameAssets.nav.trade} style={styles.emptyIcon} resizeMode="contain" />
          <Text style={styles.emptyTitle}>Склад пуст</Text>
          <Text style={styles.muted}>Сначала добудьте и заберите ресурсы, после этого они появятся на бирже.</Text>
        </View>
      )}

      <View style={styles.noteBox}>
        <Image source={gameAssets.utility.stats} style={styles.noteIcon} resizeMode="contain" />
        <Text style={styles.note}>Сейчас действует гарантированный спотовый покупатель. Динамика цен, региональные рынки и P2P-заявки станут отдельным экономическим слоем.</Text>
      </View>
    </View>
  );
}

function SellButton({ disabled, busy, label, primary = false, onPress }: { disabled: boolean; busy: boolean; label: string; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, primary && styles.buttonPrimary, disabled && styles.disabled, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator size="small" color={primary ? '#071116' : undefined} /> : <>
        <Image source={gameAssets.actions.sell} style={styles.buttonIcon} resizeMode="contain" />
        <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
      </>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 2, gap: 9 },
  loadingBox: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  headingLead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headingIcon: { width: 46, height: 46 },
  flex: { flex: 1 },
  eyebrow: { color: '#58dca4', fontSize: 8, letterSpacing: 1.3, fontWeight: '900' },
  title: { color: '#f3f8fa', fontSize: 16, fontWeight: '900', marginTop: 2 },
  balanceBox: { alignItems: 'flex-end', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(9,26,34,0.92)', borderWidth: 1, borderColor: 'rgba(88,220,164,0.18)' },
  balanceLabel: { color: '#69818d', fontSize: 6, fontWeight: '900' },
  balance: { color: '#f0bc47', fontSize: 12, fontWeight: '900', marginTop: 2 },
  marketSummary: { flexDirection: 'row', gap: 6 },
  summaryMetric: { flex: 1, padding: 8, borderRadius: 10, backgroundColor: 'rgba(7,19,27,0.9)', borderWidth: 1, borderColor: 'rgba(104,145,159,0.13)' },
  summaryLabel: { color: '#637987', fontSize: 6, fontWeight: '800' },
  summaryValue: { color: '#dce8ec', fontSize: 10, fontWeight: '900', marginTop: 2 },
  spot: { color: '#58dca4' },
  offerCard: { padding: 10, borderRadius: 13, backgroundColor: 'rgba(8,21,29,0.94)', borderWidth: 1, borderColor: 'rgba(47,168,133,0.28)' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  offerLead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  resourceIconBox: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: 'rgba(2,10,14,0.6)' },
  resourceIcon: { width: 42, height: 42 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  offerName: { color: '#f3f7f8', fontSize: 12, fontWeight: '900' },
  rarity: { color: '#f0bc47', fontSize: 7, fontWeight: '900' },
  stock: { color: '#8798a3', fontSize: 9, marginTop: 3 },
  priceBox: { alignItems: 'flex-end' },
  price: { color: '#58dca4', fontSize: 13, fontWeight: '900' },
  perUnit: { color: '#637681', fontSize: 8, marginTop: 1 },
  valueBand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(25,67,64,0.25)' },
  valueBandLabel: { color: '#71928f', fontSize: 6, fontWeight: '900' },
  valueBandValue: { color: '#cde8df', fontSize: 9, fontWeight: '900' },
  buttonRow: { flexDirection: 'row', gap: 7, marginTop: 8 },
  button: { flex: 1, minHeight: 38, flexDirection: 'row', gap: 5, borderRadius: 9, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(88,220,164,0.32)', backgroundColor: 'rgba(25,75,62,0.38)', paddingHorizontal: 5 },
  buttonPrimary: { backgroundColor: '#48d69c', borderColor: '#48d69c' },
  buttonIcon: { width: 22, height: 22 },
  buttonText: { color: '#b9ead7', fontSize: 8, fontWeight: '900', textAlign: 'center', flexShrink: 1 },
  buttonTextPrimary: { color: '#071116' },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.78 },
  emptyBox: { padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(8,21,29,0.9)' },
  emptyIcon: { width: 62, height: 62, marginBottom: 6 },
  emptyTitle: { color: '#f3f4f6', fontSize: 13, fontWeight: '900', marginBottom: 3 },
  muted: { color: '#8697a2', fontSize: 10, lineHeight: 14 },
  noteBox: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 8, borderRadius: 9, backgroundColor: 'rgba(10,22,30,0.75)' },
  noteIcon: { width: 28, height: 28 },
  note: { flex: 1, color: '#637681', fontSize: 8, lineHeight: 11 },
});
