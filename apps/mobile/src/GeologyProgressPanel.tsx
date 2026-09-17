import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { getGeologyUpgrades, upgradeGeology } from './api';
import type { GeologySkillKey, GeologyUpgradeCatalog, GeologyUpgradeOption } from './types';

type Props = {
  onMessage?: (message: string) => void;
};

const skillLabels: Record<GeologySkillKey, { title: string; description: string }> = {
  range: { title: 'Дальность', description: 'Как далеко можно исследовать от текущей позиции.' },
  coverage: { title: 'Площадь разведки', description: 'Сколько соседних H3-ячеек попадает в один проход.' },
  depth: { title: 'Глубина', description: 'Максимальная глубина обнаруживаемых залежей.' },
  accuracy: { title: 'Точность', description: 'Сужает погрешность оценки объёма, глубины и качества.' },
  sensitivity: { title: 'Чувствительность', description: 'Позволяет замечать более редкие типы ресурсов.' },
};

function formatValue(option: GeologyUpgradeOption, value: number | null): string {
  if (value === null) return 'MAX';
  if (option.skill === 'accuracy') return `±${Math.round(value * 100)}%`;
  if (option.skill === 'range' || option.skill === 'depth') return `${value} м`;
  if (option.skill === 'coverage') return `${value} кол.`;
  return `R${value}`;
}

export function GeologyProgressPanel({ onMessage }: Props) {
  const [catalog, setCatalog] = useState<GeologyUpgradeCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<GeologySkillKey | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCatalog(await getGeologyUpgrades());
    } catch (error) {
      onMessage?.(`Прокачка геологии: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const buy = useCallback(async (skill: GeologySkillKey, currency: 'soft' | 'premium') => {
    setUpgrading(skill);
    try {
      const result = await upgradeGeology({ skill, currency });
      onMessage?.(
        `Геология улучшена: ${skillLabels[skill].title} · уровень ${result.level} · списано ${result.charged} ${currency === 'soft' ? '₡' : '◆'}`,
      );
      await refresh();
    } catch (error) {
      onMessage?.(`Улучшение: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setUpgrading(null);
    }
  }, [onMessage, refresh]);

  if (loading && !catalog) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator />
        <Text style={styles.muted}>Загрузка геологических технологий…</Text>
      </View>
    );
  }

  if (!catalog) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>ГЕОЛОГИЧЕСКАЯ СЛУЖБА</Text>
          <Text style={styles.title}>Технологии разведки</Text>
        </View>
        <View style={styles.wallet}>
          <Text style={styles.walletSoft}>{catalog.wallet.soft.toLocaleString('ru-RU')} ₡</Text>
          <Text style={styles.walletPremium}>{catalog.wallet.premium.toLocaleString('ru-RU')} ◆</Text>
        </View>
      </View>

      {catalog.upgrades.map((option) => {
        const meta = skillLabels[option.skill];
        const busy = upgrading === option.skill;
        const softDisabled = busy || option.maxed || !option.price || catalog.wallet.soft < option.price.soft;
        const premiumDisabled = busy || option.maxed || !option.price || catalog.wallet.premium < option.price.premium;

        return (
          <View key={option.skill} style={styles.skillCard}>
            <View style={styles.skillHeader}>
              <View style={styles.skillText}>
                <Text style={styles.skillTitle}>{meta.title}</Text>
                <Text style={styles.description}>{meta.description}</Text>
              </View>
              <Text style={styles.level}>LV {option.currentLevel}/10</Text>
            </View>

            <View style={styles.valueRow}>
              <Text style={styles.currentValue}>{formatValue(option, option.currentValue)}</Text>
              <Text style={styles.arrow}>→</Text>
              <Text style={styles.nextValue}>{formatValue(option, option.nextValue)}</Text>
            </View>

            {option.maxed ? (
              <Text style={styles.maxed}>МАКСИМАЛЬНЫЙ УРОВЕНЬ</Text>
            ) : option.price ? (
              <View style={styles.buttonRow}>
                <UpgradeButton
                  disabled={softDisabled}
                  busy={busy}
                  label={`${option.price.soft.toLocaleString('ru-RU')} ₡`}
                  onPress={() => void buy(option.skill, 'soft')}
                />
                <UpgradeButton
                  disabled={premiumDisabled}
                  busy={busy}
                  premium
                  label={`${option.price.premium} ◆`}
                  onPress={() => void buy(option.skill, 'premium')}
                />
              </View>
            ) : null}
          </View>
        );
      })}

      <Text style={styles.note}>
        Все уровни доступны за игровую валюту. Премиум-валюта только ускоряет развитие и не даёт эксклюзивной геологии.
      </Text>
    </View>
  );
}

function UpgradeButton({
  disabled,
  busy,
  label,
  premium = false,
  onPress,
}: {
  disabled: boolean;
  busy: boolean;
  label: string;
  premium?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        premium && styles.buttonPremium,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? <ActivityIndicator size="small" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 14, gap: 9 },
  loadingBox: { marginTop: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  eyebrow: { color: '#8d99a8', fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  title: { color: '#f6f7f9', fontSize: 16, fontWeight: '900', marginTop: 3 },
  wallet: { alignItems: 'flex-end' },
  walletSoft: { color: '#f5c451', fontSize: 12, fontWeight: '900' },
  walletPremium: { color: '#79c7ff', fontSize: 11, fontWeight: '900', marginTop: 3 },
  skillCard: { padding: 11, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: 'rgba(242,209,139,0.15)' },
  skillHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  skillText: { flex: 1 },
  skillTitle: { color: '#f5c451', fontSize: 13, fontWeight: '900' },
  description: { color: '#9ba5b2', fontSize: 10, marginTop: 3, lineHeight: 14 },
  level: { color: '#d7dce3', fontSize: 10, fontWeight: '900' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  currentValue: { color: '#d7dce3', fontSize: 12, fontWeight: '800' },
  arrow: { color: '#687586', fontSize: 12 },
  nextValue: { color: '#77d9bd', fontSize: 12, fontWeight: '900' },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 9 },
  button: { flex: 1, minHeight: 36, borderRadius: 9, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5c451' },
  buttonPremium: { backgroundColor: '#79c7ff' },
  buttonText: { color: '#11161d', fontSize: 10, fontWeight: '900' },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.8 },
  maxed: { color: '#77d9bd', fontSize: 10, fontWeight: '900', marginTop: 9 },
  muted: { color: '#9ba5b2', fontSize: 11 },
  note: { color: '#687586', fontSize: 9, lineHeight: 13 },
});
