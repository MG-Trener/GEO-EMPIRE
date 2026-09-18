import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { getStore, purchaseStorePack } from './api';
import { gameAssets, resourceIconForCode } from './gameAssets';
import type { StoreCatalog, StorePack } from './types';

type Props = {
  onMessage?: (message: string) => void;
  onPurchased?: () => Promise<void> | void;
};

function contents(pack: StorePack): string[] {
  const rows: string[] = [];
  if (pack.softGrant > 0) rows.push(`+${pack.softGrant.toLocaleString('ru-RU')} ₡`);
  for (const grant of pack.resourceGrants) rows.push(`${grant.resourceCode} × ${grant.quantity.toLocaleString('ru-RU')}`);
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

  useEffect(() => { void refresh(); }, [refresh]);

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
    return <View style={styles.loadingBox}><ActivityIndicator /><Text style={styles.muted}>Загрузка магазина…</Text></View>;
  }
  if (!catalog) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headerLead}>
          <Image source={gameAssets.nav.development} style={styles.headerIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>СНАБЖЕНИЕ КОМПАНИИ</Text>
            <Text style={styles.title}>Ускорение развития</Text>
            <Text style={styles.description}>Платные наборы ускоряют прогресс, но не открывают эксклюзивные ресурсы или территории.</Text>
          </View>
        </View>
        <View style={styles.wallet}>
          <Text style={styles.walletLabel}>БАЛАНС</Text>
          <Text style={styles.soft}>{catalog.wallet.soft.toLocaleString('ru-RU')} ₡</Text>
          <Text style={styles.premium}>{catalog.wallet.premium.toLocaleString('ru-RU')} ◆</Text>
        </View>
      </View>

      {catalog.packs.map((pack, index) => {
        const buying = buyingCode === pack.code;
        const disabled = buyingCode !== null || catalog.wallet.premium < pack.premiumPrice;
        return (
          <View key={pack.code} style={[styles.packCard, index === 0 && styles.packFeatured]}>
            <View style={styles.packTop}>
              <View style={styles.packIconBox}>
                <Image source={index % 2 === 0 ? gameAssets.nav.development : gameAssets.nav.trade} style={styles.packIcon} resizeMode="contain" />
              </View>
              <View style={styles.flex}>
                {pack.badge ? <Text style={styles.badge}>{pack.badge}</Text> : null}
                <Text style={styles.packName}>{pack.name}</Text>
                <Text style={styles.packDescription}>{pack.description}</Text>
              </View>
              <View style={styles.priceBox}>
                <Text style={styles.price}>{pack.premiumPrice}</Text>
                <Text style={styles.priceUnit}>◆</Text>
              </View>
            </View>

            <View style={styles.contentsGrid}>
              {pack.softGrant > 0 ? (
                <View style={styles.grantChip}>
                  <Image source={gameAssets.actions.sell} style={styles.grantIcon} resizeMode="contain" />
                  <View><Text style={styles.grantLabel}>КРЕДИТЫ</Text><Text style={styles.grantValue}>+{pack.softGrant.toLocaleString('ru-RU')} ₡</Text></View>
                </View>
              ) : null}
              {pack.resourceGrants.map((grant) => (
                <View key={`${pack.code}-${grant.resourceCode}`} style={styles.grantChip}>
                  <Image source={resourceIconForCode(grant.resourceCode)} style={styles.grantIcon} resizeMode="contain" />
                  <View><Text style={styles.grantLabel}>{grant.resourceCode}</Text><Text style={styles.grantValue}>× {grant.quantity.toLocaleString('ru-RU')}</Text></View>
                </View>
              ))}
            </View>

            <Pressable disabled={disabled} onPress={() => void buy(pack)} style={({ pressed }) => [styles.buyButton, disabled && styles.disabled, pressed && styles.pressed]}>
              {buying ? <ActivityIndicator color="#071116" /> : <>
                <Image source={gameAssets.utility.upgrade} style={styles.buyIcon} resizeMode="contain" />
                <Text style={styles.buyButtonText}>{catalog.wallet.premium < pack.premiumPrice ? 'НЕДОСТАТОЧНО ◆' : `ПОЛУЧИТЬ НАБОР · ${pack.premiumPrice} ◆`}</Text>
              </>}
            </Pressable>
          </View>
        );
      })}

      <View style={styles.infoBox}>
        <Image source={gameAssets.actions.info} style={styles.infoIcon} resizeMode="contain" />
        <View style={styles.flex}>
          <Text style={styles.infoTitle}>РЕАЛЬНЫЕ ПЛАТЕЖИ ПОКА НЕ ПОДКЛЮЧЕНЫ</Text>
          <Text style={styles.muted}>Сейчас магазин расходует тестовую премиум-валюту. Позже Google Play Billing будет только пополнять баланс ◆ на сервере.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10 },
  loadingBox: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { color: '#81939e', fontSize: 9, lineHeight: 13 },
  headerRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  headerLead: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center' },
  headerIcon: { width: 48, height: 48 },
  flex: { flex: 1 },
  eyebrow: { color: '#d7a94b', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#edf5f7', fontSize: 16, fontWeight: '900', marginTop: 2 },
  description: { color: '#8396a1', fontSize: 9, lineHeight: 13, marginTop: 3 },
  wallet: { alignItems: 'flex-end', padding: 8, borderRadius: 9, backgroundColor: 'rgba(11,25,33,0.9)', borderWidth: 1, borderColor: 'rgba(211,161,70,0.18)' },
  walletLabel: { color: '#667b86', fontSize: 6, fontWeight: '900' },
  soft: { color: '#e7c66c', fontSize: 10, fontWeight: '900', marginTop: 2 },
  premium: { color: '#bb8de0', fontSize: 12, fontWeight: '900', marginTop: 1 },
  packCard: { backgroundColor: 'rgba(8,20,28,0.95)', borderRadius: 13, borderWidth: 1, borderColor: 'rgba(127,151,164,0.17)', padding: 10 },
  packFeatured: { borderColor: 'rgba(215,169,75,0.34)', backgroundColor: 'rgba(30,26,18,0.92)' },
  packTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  packIconBox: { width: 54, height: 54, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,10,14,0.55)' },
  packIcon: { width: 50, height: 50 },
  badge: { color: '#d6aa4f', fontSize: 7, fontWeight: '900', letterSpacing: 1, marginBottom: 1 },
  packName: { color: '#edf3f5', fontSize: 13, fontWeight: '900' },
  packDescription: { color: '#83949f', fontSize: 9, lineHeight: 13, marginTop: 2 },
  priceBox: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(110,63,133,0.26)' },
  price: { color: '#c99bea', fontSize: 16, fontWeight: '900' },
  priceUnit: { color: '#c99bea', fontSize: 10, fontWeight: '900', marginLeft: 2 },
  contentsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  grantChip: { minWidth: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 7, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.035)' },
  grantIcon: { width: 30, height: 30 },
  grantLabel: { color: '#6f838f', fontSize: 6, fontWeight: '900' },
  grantValue: { color: '#d5e0e4', fontSize: 9, fontWeight: '900', marginTop: 1 },
  buyButton: { marginTop: 9, minHeight: 39, flexDirection: 'row', gap: 6, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#d7a94b' },
  buyIcon: { width: 26, height: 26 },
  buyButtonText: { color: '#071116', fontSize: 9, fontWeight: '900', letterSpacing: 0.45 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.78 },
  infoBox: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(61,86,98,0.45)', padding: 9, backgroundColor: 'rgba(7,18,25,0.88)' },
  infoIcon: { width: 34, height: 34 },
  infoTitle: { color: '#a8b8c0', fontSize: 7, fontWeight: '900', letterSpacing: 0.85, marginBottom: 3 },
});
