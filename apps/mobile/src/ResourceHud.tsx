import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { resourceIconForCode } from './gameAssets';
import type { InventoryItem } from './types';

function formatCompact(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
}

export function ResourceHud({ inventory }: { inventory: InventoryItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(
    () => [...inventory].sort((a, b) => {
      if ((b.ratePerHour > 0 ? 1 : 0) !== (a.ratePerHour > 0 ? 1 : 0)) {
        return Number(b.ratePerHour > 0) - Number(a.ratePerHour > 0);
      }
      return b.quantity - a.quantity;
    }),
    [inventory],
  );
  const activeProduction = sorted.filter((item) => item.ratePerHour > 0).length;
  const preview = sorted.slice(0, 3);

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Свернуть ресурсы' : 'Развернуть ресурсы'}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.title}>РЕСУРСЫ</Text>
          <Text style={styles.summary}>{sorted.length} видов · добывается {activeProduction}</Text>
        </View>

        <View style={styles.previewRow}>
          {preview.map((item) => (
            <View key={item.resourceId} style={styles.previewItem}>
              <Image source={resourceIconForCode(item.code || item.name)} style={styles.previewIcon} resizeMode="contain" />
              <Text style={styles.previewValue}>{formatCompact(item.quantity)}</Text>
            </View>
          ))}
          {!preview.length ? <Text style={styles.emptyPreview}>склад пуст</Text> : null}
        </View>

        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.dropdown}>
          <View style={styles.dropdownHeader}>
            <Text style={styles.dropdownTitle}>СКЛАД И ДОБЫЧА</Text>
            <Text style={styles.dropdownHint}>наличие · скорость в час</Text>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {sorted.length ? sorted.map((item) => (
              <View key={item.resourceId} style={styles.row}>
                <Image source={resourceIconForCode(item.code || item.name)} style={styles.icon} resizeMode="contain" />
                <View style={styles.nameBlock}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.unit}>{item.unit}</Text>
                </View>
                <View style={styles.values}>
                  <Text style={styles.quantity}>{formatCompact(item.quantity)} {item.unit}</Text>
                  <Text style={[styles.rate, item.ratePerHour > 0 && styles.rateActive]}>
                    +{formatCompact(item.ratePerHour)} {item.unit}/ч
                  </Text>
                </View>
              </View>
            )) : (
              <Text style={styles.empty}>После первой добычи ресурсы появятся здесь.</Text>
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minWidth: 0, position: 'relative', zIndex: 40 },
  header: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(5,16,25,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(73,170,210,0.26)',
  },
  titleBlock: { minWidth: 96 },
  title: { color: '#dbeaf0', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  summary: { color: '#718b99', fontSize: 7, marginTop: 2 },
  previewRow: { flex: 1, minWidth: 0, flexDirection: 'row', justifyContent: 'flex-end', gap: 5 },
  previewItem: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  previewIcon: { width: 20, height: 20 },
  previewValue: { color: '#d5e2e8', fontSize: 7.5, fontWeight: '800' },
  emptyPreview: { color: '#627783', fontSize: 7.5, alignSelf: 'center' },
  chevron: { color: '#71cfe2', fontSize: 8, marginLeft: 7 },
  dropdown: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 46,
    maxHeight: 285,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(4,14,22,0.985)',
    borderWidth: 1,
    borderColor: 'rgba(73,195,218,0.32)',
    shadowColor: '#000000',
    shadowOpacity: 0.48,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 20,
  },
  dropdownHeader: { paddingHorizontal: 11, paddingTop: 9, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  dropdownTitle: { color: '#6fdbea', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  dropdownHint: { color: '#607984', fontSize: 7, marginTop: 2 },
  list: { maxHeight: 235 },
  listContent: { paddingHorizontal: 8, paddingVertical: 5 },
  row: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  icon: { width: 31, height: 31 },
  nameBlock: { flex: 1, minWidth: 0 },
  name: { color: '#d9e5ea', fontSize: 9, fontWeight: '800' },
  unit: { color: '#607783', fontSize: 6.5, marginTop: 1 },
  values: { alignItems: 'flex-end', minWidth: 88 },
  quantity: { color: '#eef7fa', fontSize: 8.5, fontWeight: '900' },
  rate: { color: '#647983', fontSize: 7, marginTop: 2 },
  rateActive: { color: '#47ddb5' },
  empty: { color: '#80949f', fontSize: 9, padding: 14, textAlign: 'center' },
  pressed: { opacity: 0.78 },
});
