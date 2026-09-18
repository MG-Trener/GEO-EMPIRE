import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { getStore, purchaseStorePack } from './api';
import { Artwork } from './Artwork';
import type { StoreCatalog, StorePack } from './types';
import { packArtworkUri } from './visualAssets';

type Props = {
  onMessage?: (message: string) => void;
  onPurchased?: () => Promise<void> | void;
};

function contents(pack: StorePack): string[] {
  const rows: string[] = [];
  if (pack.softGrant > 0) rows.push(`+${pack.softGrant.toLocaleString('ru-RU')} ₡`);
  for (const grant of pack.resourceGrants) {
    rows.push(`${grant.resourceCode} × ${grant.quantity.toLocaleString('ru-RU')}`);
  }
  return rows;
}

export function StorePanel({ onMessage, onPurchased }: Props) {
  const [catalog, setCatalog] = useState<StoreCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyingCode, setBuyingCode] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCatalog(await getStore());
    } catch (error) {
      onMessage?.(`Магазин: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const buy = useCallback(async (pack: StorePack) => {
    setBuyingCode(pack.code);
    try {
      const result = await purchaseStorePack({ packCode: pack.code });
      const resourceText = result.grantedResources.length
        ? ` · ${result.grantedResources.map((item) => `${item.name} ${item.quantity} ${item.unit}`).join(', ')}`
        : '';
      onMessage?.(`Получен набор «${result.pack.name}» · +${result.grantedSoft.toLocaleString('ru-RU')} ₡${resourceText}`);
      await Promise.resolve(onPurchased?.());
      await refresh();
    } catch (error) {
      onMessage?.(`Покупка: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setBuyingCode(null);
    }
  }, [onMessage, onPurchased, refresh]);

  if (loading && !catalog) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator />
        <Text style={styles.muted}>Загрузка магазина…</Text>
      </View>
    );
  }

  if (!catalog) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>СНАБЖЕНИЕ КОМПАНИИ</Text>
          <Text style={styles.title}>Ускорение развития</Text>
          <Text style={styles.description}>
            Все наборы имеют фиксированное содержимое. Премиум ускоряет прогресс, но основные ресурсы можно получить бесплатно в игре.
          </Text>
        </View>
        <View style={styles.wallet}>
          <Text style={styles.soft}>{catalog.wallet.soft.toLocaleString('ru-RU')} ₡</Text>
          <Text style={styles.premium}>{catalog.wallet.premium.toLocaleString('ru-RU')} ◆</Text>
        </View>
      </View>

      {catalog.packs.map((pack) => {
        const buying = buyingCode === pack.code;
        const disabled = buyingCode !== null || catalog.wallet.premium < pack.premiumPrice;
        return (
          <View key={pack.code} style={styles.packCard}>
            <View style={styles.packHeader}>
              <Artwork
                uri={packArtworkUri(pack.code)}
                label={pack.name}
                size={64}
                radius={12}
              />
              <View style={styles.flex}>
                {pack.badge ? <Text style={styles.badge}>{pack.badge}</Text> : null}
                <Text style={styles.packName}>{pack.name}</Text>
                <Text style={styles.packDescription}>{pack.description}</Text>
              </View>
              <Text style={styles.price}>{pack.premiumPrice} ◆</Text>
            </View>

            <View style={styles.contents}>
              {contents(pack).map((line) => (
                <Text key={line} style={styles.contentLine}>• {line}</Text>
              ))}
            </View>

            <Pressable
              disabled={disabled}
              onPress={() => void buy(pack)}
              style={({ pressed }) => [
                styles.buyButton,
                disabled && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.buyButtonText}>
                {buying ? 'ПОКУПКА…' : catalog.wallet.premium < pack.premiumPrice ? 'НЕДОСТАТОЧНО ◆' : `ПОЛУЧИТЬ · ${pack.premiumPrice} ◆`}
              </Text>
            </Pressable>
          </View>
        );
      })}

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>РЕАЛЬНЫЕ ПЛАТЕЖИ ПОКА НЕ ПОДКЛЮЧЕНЫ</Text>
        <Text style={styles.muted}>
          На этом этапе магазин расходует тестовую премиум-валюту. Позже Google Play Billing будет только пополнять баланс ◆ на сервере.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  loadingBox: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { color: '#8396a1', fontSize: 11, lineHeight: 16 },
  headerRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  flex: { flex: 1 },
  eyebrow: { color: '#b68bd4', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: '#edf3f4', fontSize: 20, fontWeight: '900', marginTop: 2 },
  description: { color: '#8fa0aa', fontSize: 11, lineHeight: 16, marginTop: 4 },
  wallet: { alignItems: 'flex-end', gap: 2 },
  soft: { color: '#e7c66c', fontSize: 11, fontWeight: '800' },
  premium: { color: '#b88add', fontSize: 14, fontWeight: '900' },
  packCard: { backgroundColor: '#101922', borderRadius: 12, borderWidth: 1, borderColor: '#2a3541', padding: 12 },
  packHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  badge: { color: '#c79ce5', fontSize: 8, fontWeight: '900', letterSpacing: 1.1, marginBottom: 3 },
  packName: { color: '#edf2f4', fontSize: 15, fontWeight: '900' },
  packDescription: { color: '#8395a0', fontSize: 10, lineHeight: 15, marginTop: 4 },
  price: { color: '#c694e6', fontSize: 18, fontWeight: '900' },
  contents: { marginTop: 10, gap: 3 },
  contentLine: { color: '#c6d0d5', fontSize: 10, fontWeight: '700' },
  buyButton: { marginTop: 11, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6b3f85' },
  buyButtonText: { color: '#f6ebfa', fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.78 },
  infoBox: { borderRadius: 10, borderWidth: 1, borderColor: '#33434d', padding: 10, backgroundColor: '#0c151c' },
  infoTitle: { color: '#a8b8c0', fontSize: 8, fontWeight: '900', letterSpacing: 1.05, marginBottom: 4 },
});
