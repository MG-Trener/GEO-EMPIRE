import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { resourceIconForCode } from './gameAssets';
import type { GeologyScanResponse } from './types';

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
    const map = new Map<string, { code: string; name: string }>();
    for (const deposit of scan?.deposits ?? []) {
      if (!map.has(deposit.resource.code)) {
        map.set(deposit.resource.code, {
          code: deposit.resource.code,
          name: deposit.resource.name,
        });
      }
    }
    return [...map.values()];
  }, [scan]);

  if (!options.length) return null;

  return (
    <View style={styles.root}>
      <Text style={styles.label}>ПЛОТНОСТЬ</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        {options.map((option) => {
          const active = option.code === selectedCode;
          return (
            <Pressable
              key={option.code}
              onPress={() => onSelect(option.code)}
              style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && styles.pressed]}
            >
              <Image source={resourceIconForCode(option.code)} style={styles.icon} resizeMode="contain" />
              <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>{option.name}</Text>
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
    maxWidth: '88%',
    minHeight: 32,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(5,16,25,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(73,195,218,0.22)',
    overflow: 'hidden',
  },
  label: { color: '#6b8b98', fontSize: 6.5, fontWeight: '900', letterSpacing: 0.8, marginRight: 5 },
  list: { gap: 3, paddingVertical: 3, paddingRight: 4 },
  item: {
    height: 25,
    maxWidth: 115,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  itemActive: { backgroundColor: 'rgba(56,216,255,0.13)', borderColor: 'rgba(56,216,255,0.58)' },
  icon: { width: 20, height: 20 },
  text: { color: '#8296a0', fontSize: 7, fontWeight: '800', maxWidth: 78 },
  textActive: { color: '#dff8ff' },
  pressed: { opacity: 0.72 },
});
