import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { resourceIconForCode } from './gameAssets';
import type { GeologyScanResponse } from './types';

type ResourceOption = {
  code: string;
  name: string;
  cells: number;
  maxDensity: number;
  rarity: number;
};

export function HeatmapResourceSelector({
  scan,
  selectedCode,
  onSelect,
}: {
  scan: GeologyScanResponse | null;
  selectedCode: string | null;
  onSelect: (resourceCode: string) => void;
}) {
  const options = useMemo(() => {
    const map = new Map<string, ResourceOption & { cellIds: Set<string> }>();

    for (const deposit of scan?.deposits ?? []) {
      const existing = map.get(deposit.resource.code) ?? {
        code: deposit.resource.code,
        name: deposit.resource.name,
        cells: 0,
        maxDensity: 0,
        rarity: 1,
        cellIds: new Set<string>(),
      };

      existing.cellIds.add(deposit.h3Index);
      existing.cells = existing.cellIds.size;
      existing.maxDensity = Math.max(existing.maxDensity, Number(deposit.estimates.density?.value ?? 0));
      existing.rarity = Math.max(existing.rarity, Number(deposit.resource.rarity ?? 1));
      map.set(deposit.resource.code, existing);
    }

    return [...map.values()]
      .map(({ cellIds: _cellIds, ...option }) => option)
      .sort((a, b) => b.maxDensity - a.maxDensity || b.rarity - a.rarity);
  }, [scan]);

  if (!options.length) return null;

  const active = options.find((option) => option.code === selectedCode) ?? options[0];

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.label}>КАРТА МЕСТОРОЖДЕНИЙ</Text>
          <Text style={styles.summary}>
            {active.name} · {active.cells} яч. · пик {Math.round(active.maxDensity * 100)}% · R{active.rarity}
          </Text>
        </View>
        <View style={styles.legend}>
          <View style={[styles.legendDot, styles.legendCommon]} />
          <Text style={styles.legendText}>R1-2</Text>
          <View style={[styles.legendDot, styles.legendRare]} />
          <Text style={styles.legendText}>R3-4</Text>
          <View style={[styles.legendDot, styles.legendStrategic]} />
          <Text style={styles.legendText}>R5+</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        {options.map((option) => {
          const isActive = option.code === selectedCode;
          return (
            <Pressable
              key={option.code}
              onPress={() => onSelect(option.code)}
              style={({ pressed }) => [styles.item, isActive && styles.itemActive, pressed && styles.pressed]}
            >
              <Image source={resourceIconForCode(option.code)} style={styles.icon} resizeMode="contain" />
              <View style={styles.itemText}>
                <Text style={[styles.text, isActive && styles.textActive]} numberOfLines={1}>{option.name}</Text>
                <Text style={styles.meta}>{option.cells} яч. · {Math.round(option.maxDensity * 100)}%</Text>
              </View>
              <View style={[
                styles.rarity,
                option.rarity >= 5 ? styles.rarityStrategic : option.rarity >= 3 ? styles.rarityRare : styles.rarityCommon,
              ]}>
                <Text style={styles.rarityText}>R{option.rarity}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'flex-start',
    width: '91%',
    marginTop: 4,
    paddingHorizontal: 7,
    paddingTop: 6,
    paddingBottom: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(5,16,25,0.93)',
    borderWidth: 1,
    borderColor: 'rgba(73,195,218,0.24)',
    overflow: 'hidden',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { color: '#84dff0', fontSize: 6.7, fontWeight: '900', letterSpacing: 0.9 },
  summary: { color: '#8ca4af', fontSize: 6.7, fontWeight: '700', marginTop: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendDot: { width: 6, height: 6, borderRadius: 6 },
  legendCommon: { backgroundColor: '#38d8ff' },
  legendRare: { backgroundColor: '#f4bd42' },
  legendStrategic: { backgroundColor: '#b96cff' },
  legendText: { color: '#708792', fontSize: 5.7, fontWeight: '800' },
  list: { gap: 4, paddingTop: 5, paddingRight: 2 },
  item: {
    height: 34,
    maxWidth: 155,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  itemActive: { backgroundColor: 'rgba(56,216,255,0.13)', borderColor: 'rgba(56,216,255,0.58)' },
  icon: { width: 26, height: 26 },
  itemText: { flex: 1, minWidth: 58 },
  text: { color: '#8296a0', fontSize: 7.2, fontWeight: '900', maxWidth: 88 },
  textActive: { color: '#dff8ff' },
  meta: { color: '#667f8b', fontSize: 5.9, fontWeight: '800', marginTop: 1 },
  rarity: { minWidth: 24, height: 18, paddingHorizontal: 4, borderRadius: 7, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  rarityCommon: { backgroundColor: 'rgba(56,216,255,0.12)', borderColor: 'rgba(56,216,255,0.38)' },
  rarityRare: { backgroundColor: 'rgba(244,189,66,0.12)', borderColor: 'rgba(244,189,66,0.4)' },
  rarityStrategic: { backgroundColor: 'rgba(185,108,255,0.12)', borderColor: 'rgba(185,108,255,0.4)' },
  rarityText: { color: '#ecf8fb', fontSize: 6, fontWeight: '900' },
  pressed: { opacity: 0.72 },
});
