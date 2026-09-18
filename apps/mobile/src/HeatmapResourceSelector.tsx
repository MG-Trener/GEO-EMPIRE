import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getKnownDeposits } from './api';
import { resourceIconForCode } from './gameAssets';
import type { GeologyScanResponse, KnownDeposit } from './types';

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
  const [knownDeposits, setKnownDeposits] = useState<KnownDeposit[]>([]);

  useEffect(() => {
    let cancelled = false;
    getKnownDeposits()
      .then((result) => { if (!cancelled) setKnownDeposits(result.deposits); })
      .catch(() => { if (!cancelled) setKnownDeposits([]); });
    return () => { cancelled = true; };
  }, [scan?.scanId]);

  const options = useMemo(() => {
    const map = new Map<string, ResourceOption & { cellIds: Set<string> }>();

    const add = (deposit: { resource: { code: string; name: string; rarity: number }; h3Index: string; density: number }) => {
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
      existing.maxDensity = Math.max(existing.maxDensity, Number(deposit.density ?? 0));
      existing.rarity = Math.max(existing.rarity, Number(deposit.resource.rarity ?? 1));
      map.set(deposit.resource.code, existing);
    };

    for (const deposit of knownDeposits) {
      add({ resource: deposit.resource, h3Index: deposit.h3Index, density: deposit.estimates.density.value });
    }
    for (const deposit of scan?.deposits ?? []) {
      add({ resource: deposit.resource, h3Index: deposit.h3Index, density: deposit.estimates.density?.value ?? 0 });
    }

    return [...map.values()]
      .map(({ cellIds: _cellIds, ...option }) => option)
      .sort((a, b) => b.maxDensity - a.maxDensity || b.rarity - a.rarity || a.name.localeCompare(b.name, 'ru'));
  }, [knownDeposits, scan]);

  useEffect(() => {
    if (!options.length) return;
    if (!selectedCode || !options.some((option) => option.code === selectedCode)) {
      onSelect(options[0].code);
    }
  }, [onSelect, options, selectedCode]);

  if (!options.length) return null;

  const active = options.find((option) => option.code === selectedCode) ?? options[0];

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.label}>ТЕПЛОВАЯ КАРТА МЕСТОРОЖДЕНИЙ</Text>
          <Text style={styles.summary} numberOfLines={1}>
            {active.name} · {active.cells} яч. · пик {Math.round(active.maxDensity * 100)}% · R{active.rarity}
          </Text>
        </View>
        <View style={styles.legend}>
          <View style={[styles.heatDot, styles.heatLow]} />
          <Text style={styles.legendText}>низ.</Text>
          <View style={[styles.heatDot, styles.heatMedium]} />
          <Text style={styles.legendText}>сред.</Text>
          <View style={[styles.heatDot, styles.heatHigh]} />
          <Text style={styles.legendText}>выс.</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        {options.map((option) => {
          const isActive = option.code === active.code;
          return (
            <Pressable
              key={option.code}
              accessibilityRole="button"
              accessibilityLabel={`Показать тепловую карту ресурса ${option.name}`}
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 7 },
  headerText: { flex: 1, minWidth: 0 },
  label: { color: '#84dff0', fontSize: 6.7, fontWeight: '900', letterSpacing: 0.8 },
  summary: { color: '#8ca4af', fontSize: 6.7, fontWeight: '700', marginTop: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  heatDot: { width: 7, height: 7, borderRadius: 7 },
  heatLow: { backgroundColor: '#23d7ff' },
  heatMedium: { backgroundColor: '#f4da4b' },
  heatHigh: { backgroundColor: '#e73e33' },
  legendText: { color: '#708792', fontSize: 5.3, fontWeight: '800' },
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
