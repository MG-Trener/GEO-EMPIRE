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
            <View>
              <Text style={styles.dropdownTitle}>СКЛАД РЕСУРСОВ</Text>
              <Text style={styles.dropdownHint}>5 колонок · прокрутка по вертикали</Text>
            </View>
            <View style={styles.productionBadge}>
              <Text style={styles.productionBadgeValue}>{activeProduction}</Text>
              <Text style={styles.productionBadgeLabel}>В ДОБЫЧЕ</Text>
            </View>
          </View>

          <ScrollView
            style={styles.gridScroll}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {sorted.length ? sorted.map((item) => (
              <View key={item.resourceId} style={styles.gridCellWrap}>
                <View style={[styles.gridCell, item.ratePerHour > 0 && styles.gridCellActive]}>
                  <View style={styles.iconStage}>
                    <Image source={resourceIconForCode(item.code || item.name)} style={styles.gridIcon} resizeMode="contain" />
                    {item.ratePerHour > 0 ? <View style={styles.liveDot} /> : null}
                  </View>
                  <Text style={styles.gridName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.gridQuantity} numberOfLines={1}>{formatCompact(item.quantity)}</Text>
                  <Text style={[styles.gridRate, item.ratePerHour > 0 && styles.gridRateActive]} numberOfLines={1}>
                    {item.ratePerHour > 0 ? `+${formatCompact(item.ratePerHour)}/ч` : item.unit}
                  </Text>
                </View>
              </View>
            )) : (
              <View style={styles.emptyBox}>
                <Text style={styles.empty}>После первой добычи ресурсы появятся здесь.</Text>
              </View>
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
    maxHeight: 356,
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
  dropdownHeader: {
    minHeight: 47,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  dropdownTitle: { color: '#6fdbea', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  dropdownHint: { color: '#607984', fontSize: 7, marginTop: 2 },
  productionBadge: { alignItems: 'flex-end' },
  productionBadgeValue: { color: '#47ddb5', fontSize: 12, fontWeight: '900' },
  productionBadgeLabel: { color: '#607984', fontSize: 6, fontWeight: '800', letterSpacing: 0.6 },
  gridScroll: { maxHeight: 300 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4, paddingVertical: 5 },
  gridCellWrap: { width: '20%', padding: 2 },
  gridCell: {
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(12,28,38,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(111,160,178,0.13)',
  },
  gridCellActive: { backgroundColor: 'rgba(10,50,49,0.92)', borderColor: 'rgba(71,221,181,0.26)' },
  iconStage: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  gridIcon: { width: 33, height: 33 },
  liveDot: { position: 'absolute', right: 0, top: 1, width: 6, height: 6, borderRadius: 4, backgroundColor: '#47ddb5', borderWidth: 1, borderColor: '#dffff6' },
  gridName: { maxWidth: '100%', color: '#9eb0ba', fontSize: 6.4, fontWeight: '800', marginTop: 2, textAlign: 'center' },
  gridQuantity: { color: '#eef7fa', fontSize: 8, fontWeight: '900', marginTop: 1 },
  gridRate: { color: '#5f7480', fontSize: 6.2, marginTop: 1 },
  gridRateActive: { color: '#47ddb5', fontWeight: '800' },
  emptyBox: { width: '100%', padding: 12 },
  empty: { color: '#80949f', fontSize: 9, textAlign: 'center' },
  pressed: { opacity: 0.78 },
});
