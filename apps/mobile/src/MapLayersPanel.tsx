import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { gameAssets } from './gameAssets';
import type { GameSettings } from './gameSettings';

type LayerKey =
  | 'showResourceOverlay'
  | 'showCellGrid'
  | 'showOwnedTerritories'
  | 'showRivals'
  | 'showIndustry'
  | 'showScanRange';

type Props = {
  visible: boolean;
  settings: GameSettings;
  onToggle: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  onClose: () => void;
};

const layerRows: Array<{ key: LayerKey; title: string; description: string }> = [
  { key: 'showResourceOverlay', title: 'Тепловая карта', description: 'Плотность найденных ресурсов' },
  { key: 'showCellGrid', title: 'Границы участков', description: 'Сетка H3 и выбранная ячейка' },
  { key: 'showOwnedTerritories', title: 'Мои территории', description: 'Арендованные компанией участки' },
  { key: 'showIndustry', title: 'Промышленные объекты', description: 'Шахты, карьеры и скважины' },
  { key: 'showRivals', title: 'Конкуренты', description: 'Чужие территории и объекты' },
  { key: 'showScanRange', title: 'Радиус разведки', description: 'Доступная зона сканирования' },
];

export function MapLayersPanel({ visible, settings, onToggle, onClose }: Props) {
  if (!visible) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>СЛОИ КАРТЫ</Text>
          <Text style={styles.title}>Что показывать</Text>
        </View>
        <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      {layerRows.map((row) => {
        const active = Boolean(settings[row.key]);
        return (
          <Pressable
            key={row.key}
            accessibilityRole="switch"
            accessibilityState={{ checked: active }}
            onPress={() => onToggle(row.key, !active)}
            style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.pressed]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, active && styles.rowTitleActive]}>{row.title}</Text>
              <Text style={styles.rowDescription}>{row.description}</Text>
            </View>
            <View style={[styles.switchTrack, active && styles.switchTrackActive]}>
              <View style={[styles.switchThumb, active && styles.switchThumbActive]} />
            </View>
          </Pressable>
        );
      })}

      <View style={styles.footer}>
        <Image source={gameAssets.utility.layers} style={styles.footerIcon} resizeMode="contain" />
        <Text style={styles.footerText}>Изменения применяются к карте сразу.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 98,
    right: 51,
    width: 224,
    padding: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(4,14,22,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.34)',
    shadowColor: '#000000',
    shadowOpacity: 0.42,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 14,
    zIndex: 80,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  headerText: { flex: 1 },
  eyebrow: { color: '#54d9f0', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#f1f8fb', fontSize: 11, fontWeight: '900', marginTop: 1 },
  closeButton: { width: 25, height: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  closeText: { color: '#b9ccd5', fontSize: 18, lineHeight: 20, fontWeight: '700' },
  row: {
    minHeight: 43,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.055)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  rowActive: { borderColor: 'rgba(56,216,255,0.24)', backgroundColor: 'rgba(25,112,134,0.12)' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: '#91a7b1', fontSize: 8.5, fontWeight: '900' },
  rowTitleActive: { color: '#e9fbff' },
  rowDescription: { color: '#637c88', fontSize: 6.5, lineHeight: 9, marginTop: 1 },
  switchTrack: { width: 31, height: 18, borderRadius: 10, padding: 2, backgroundColor: '#24353d', justifyContent: 'center' },
  switchTrackActive: { backgroundColor: '#147f8e' },
  switchThumb: { width: 14, height: 14, borderRadius: 8, backgroundColor: '#77909b' },
  switchThumbActive: { alignSelf: 'flex-end', backgroundColor: '#effcff' },
  footer: { marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerIcon: { width: 20, height: 20 },
  footerText: { flex: 1, color: '#6f8995', fontSize: 6.5, lineHeight: 9 },
  pressed: { opacity: 0.7 },
});
