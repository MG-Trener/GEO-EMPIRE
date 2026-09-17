import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { getMarket, sellResource } from './api';
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sell = useCallback(async (offer: MarketOffer, share: 0.25 | 1) => {
    const quantity = Math.floor(offer.quantity * share * 10_000) / 10_000;
    if (quantity <= 0) return;

    setSellingId(offer.resourceId);
    try {
      const result = await sellResource({ resourceId: offer.resourceId, quantity });
      onMessage?.(
        `Продано ${formatNumber(result.quantity)} ${result.resource.unit} · ${result.resource.name} · +${formatNumber(result.proceeds, 0)} ₡`,
      );
      await Promise.resolve(onSold?.());
      await refresh();
    } catch (error) {
      onMessage?.(`Продажа: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setSellingId(null);
    }
  }, [onMessage, onSold, refresh]);

  if (loading && !catalog) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator />
        <Text style={styles.muted}>Загрузка товарной биржи…</Text>
      </View>
    );
  }

  if (!catalog) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>ТОВАРНАЯ БИРЖА</Text>
          <Text style={styles.title}>Продажа ресурсов</Text>
          <Text style={styles.description}>Базовый спотовый рынок v1. Цены фиксированы и позже могут стать динамическими.</Text>
        </View>
        <Text style={styles.balance}>{catalog.wallet.soft.toLocaleString('ru-RU')} ₡</Text>
      </View>

      {catalog.offers.length ? catalog.offers.map((offer) => {
        const busy = sellingId === offer.resourceId;
        return (
          <View key={offer.resourceId} style={styles.offerCard}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text style={styles.offerName}>{offer.name}</Text>
                <Text style={styles.stock}>На складе: {formatNumber(offer.quantity)} {offer.unit} · R{offer.rarity}</Text>
              </View>
              <View style={styles.priceBox}>
                <Text style={styles.price}>{formatNumber(offer.pricePerUnit, 0)} ₡</Text>
                <Text style={styles.perUnit}>за {offer.unit}</Text>
              </View>
            </View>

            <Text style={styles.total}>Стоимость всего остатка: {formatNumber(offer.totalValue, 0)} ₡</Text>

            <View style={styles.buttonRow}>
              <SellButton
                disabled={busy || offer.quantity <= 0}
                busy={busy}
                label={`25% · ≈${formatNumber(Math.floor(offer.totalValue * 0.25), 0)} ₡`}
                onPress={() => void sell(offer, 0.25)}
              />
              <SellButton
                disabled={busy || offer.quantity <= 0}
                busy={busy}
                primary
                label={`ПРОДАТЬ ВСЁ · ${formatNumber(offer.totalValue, 0)} ₡`}
                onPress={() => void sell(offer, 1)}
              />
            </View>
          </View>
        );
      }) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Склад пуст</Text>
          <Text style={styles.muted}>Сначала добудьте и заберите ресурсы, после этого они появятся на бирже.</Text>
        </View>
      )}

      <Text style={styles.note}>
        На этом этапе рынок выступает гарантированным покупателем ресурсов. P2P-заявки, колебания цен и региональные рынки можно добавить отдельным экономическим слоем.
      </Text>
    </View>
  );
}

function SellButton({
  disabled,
  busy,
  label,
  primary = false,
  onPress,
}: {
  disabled: boolean;
  busy: boolean;
  label: string;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={primary ? '#11161d' : undefined} /> : <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 2, gap: 9 },
  loadingBox: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  flex: { flex: 1 },
  eyebrow: { color: '#8d99a8', fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  title: { color: '#f6f7f9', fontSize: 16, fontWeight: '900', marginTop: 3 },
  description: { color: '#8f9baa', fontSize: 10, lineHeight: 14, marginTop: 4 },
  balance: { color: '#f5c451', fontSize: 12, fontWeight: '900' },
  offerCard: { padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: 'rgba(28,123,110,0.32)' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  offerName: { color: '#f3f4f6', fontSize: 13, fontWeight: '900' },
  stock: { color: '#9ba5b2', fontSize: 10, marginTop: 4 },
  priceBox: { alignItems: 'flex-end' },
  price: { color: '#77d9bd', fontSize: 13, fontWeight: '900' },
  perUnit: { color: '#687586', fontSize: 9, marginTop: 2 },
  total: { color: '#c4ccd7', fontSize: 10, marginTop: 9 },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 9 },
  button: { flex: 1, minHeight: 38, borderRadius: 9, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(119,217,189,0.4)', backgroundColor: 'rgba(119,217,189,0.08)', paddingHorizontal: 6 },
  buttonPrimary: { backgroundColor: '#77d9bd', borderColor: '#77d9bd' },
  buttonText: { color: '#aeead9', fontSize: 9, fontWeight: '900', textAlign: 'center' },
  buttonTextPrimary: { color: '#11161d' },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.8 },
  emptyBox: { padding: 13, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)' },
  emptyTitle: { color: '#f3f4f6', fontSize: 13, fontWeight: '800' },
  muted: { color: '#9ba5b2', fontSize: 11, lineHeight: 15 },
  note: { color: '#687586', fontSize: 9, lineHeight: 13 },
});
