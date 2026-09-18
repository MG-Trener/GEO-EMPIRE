import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { gameAssets } from './gameAssets';
import type { GameSettings } from './gameSettings';

type Props = {
  visible: boolean;
  settings: GameSettings;
  onChange: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  onReset: () => void;
  onClose: () => void;
};

export function GameSettingsPanel({ visible, settings, onChange, onReset, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.backdrop} edges={['top', 'bottom']}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Image source={gameAssets.nav.settings} style={styles.headerIcon} resizeMode="contain" />
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>ПАРАМЕТРЫ ИГРЫ</Text>
              <Text style={styles.title}>Настройки</Text>
            </View>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <SettingsToggle
              title="Звуки интерфейса"
              description="Промышленные сигналы разведки, строительства, добычи и торговли"
              value={settings.soundEnabled}
              onPress={() => onChange('soundEnabled', !settings.soundEnabled)}
            />

            <View style={styles.settingBlock}>
              <Text style={styles.settingTitle}>Громкость</Text>
              <Text style={styles.settingDescription}>Уровень игровых эффектов</Text>
              <View style={styles.segmentRow}>
                {[0.3, 0.6, 1].map((value) => (
                  <Pressable
                    key={value}
                    disabled={!settings.soundEnabled}
                    onPress={() => onChange('soundVolume', value)}
                    style={({ pressed }) => [
                      styles.segment,
                      Math.abs(settings.soundVolume - value) < 0.05 && styles.segmentActive,
                      !settings.soundEnabled && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.segmentText, Math.abs(settings.soundVolume - value) < 0.05 && styles.segmentTextActive]}>
                      {Math.round(value * 100)}%
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <SettingsToggle
              title="Сетка участков"
              description="Показывать игровые H3-ячейки поверх реальной карты"
              value={settings.showCellGrid}
              onPress={() => onChange('showCellGrid', !settings.showCellGrid)}
            />
            <SettingsToggle
              title="Найденные ресурсы"
              description="Подсвечивать разведанные ресурсные зоны на карте"
              value={settings.showResourceOverlay}
              onPress={() => onChange('showResourceOverlay', !settings.showResourceOverlay)}
            />
            <SettingsToggle
              title="Первая миссия"
              description="Показывать компактную подсказку по текущему этапу развития"
              value={settings.showMission}
              onPress={() => onChange('showMission', !settings.showMission)}
            />

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Интерфейс карты</Text>
              <Text style={styles.infoText}>Карта остаётся главным экраном. Системная информация API/GPS скрыта, а игровые панели сделаны компактнее.</Text>
            </View>

            <Pressable onPress={onReset} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}>
              <Text style={styles.resetText}>ВОССТАНОВИТЬ ПО УМОЛЧАНИЮ</Text>
            </Pressable>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function SettingsToggle({ title, description, value, onPress }: { title: string; description: string; value: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <View style={[styles.switchTrack, value && styles.switchTrackActive]}>
        <View style={[styles.switchThumb, value && styles.switchThumbActive]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: 'rgba(2,8,13,0.72)' },
  card: { maxHeight: '82%', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(71,202,217,0.34)', backgroundColor: '#07141d', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, elevation: 16 },
  header: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(92,194,205,0.13)', backgroundColor: '#0a1b26' },
  headerIcon: { width: 44, height: 44 },
  headerText: { flex: 1 },
  eyebrow: { color: '#62d9e5', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: '#eef6f7', fontSize: 20, fontWeight: '900', marginTop: 1 },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#102632' },
  closeText: { color: '#a8bac2', fontSize: 24, lineHeight: 26 },
  content: { padding: 12, gap: 9, paddingBottom: 18 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, padding: 11, borderRadius: 13, backgroundColor: '#0b202b', borderWidth: 1, borderColor: 'rgba(94,191,202,0.13)' },
  settingCopy: { flex: 1 },
  settingBlock: { padding: 11, borderRadius: 13, backgroundColor: '#0b202b', borderWidth: 1, borderColor: 'rgba(94,191,202,0.13)' },
  settingTitle: { color: '#e6eff2', fontSize: 13, fontWeight: '800' },
  settingDescription: { color: '#8196a1', fontSize: 9, lineHeight: 13, marginTop: 3 },
  switchTrack: { width: 44, height: 25, borderRadius: 13, padding: 3, justifyContent: 'center', backgroundColor: '#263944' },
  switchTrackActive: { backgroundColor: '#126d69' },
  switchThumb: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#778992' },
  switchThumbActive: { alignSelf: 'flex-end', backgroundColor: '#c7fff8' },
  segmentRow: { flexDirection: 'row', gap: 7, marginTop: 10 },
  segment: { flex: 1, minHeight: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#102a36', borderWidth: 1, borderColor: '#284755' },
  segmentActive: { backgroundColor: '#124b50', borderColor: '#51d8dc' },
  segmentText: { color: '#8196a1', fontSize: 10, fontWeight: '900' },
  segmentTextActive: { color: '#d9ffff' },
  disabled: { opacity: 0.4 },
  infoBox: { borderRadius: 12, padding: 11, backgroundColor: 'rgba(42,85,70,0.24)', borderWidth: 1, borderColor: 'rgba(83,201,156,0.18)' },
  infoTitle: { color: '#68d8ae', fontSize: 10, fontWeight: '900' },
  infoText: { color: '#90aaa3', fontSize: 9, lineHeight: 14, marginTop: 4 },
  resetButton: { minHeight: 43, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#101f29', borderWidth: 1, borderColor: '#2c4551' },
  resetText: { color: '#93a6af', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  pressed: { opacity: 0.76 },
});
