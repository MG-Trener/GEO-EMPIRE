import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getGeologyUpgrades, upgradeGeology } from './api';
import { gameAssets } from './gameAssets';
import { KnownDepositsPanel } from './KnownDepositsPanel';
import { MarketPanel } from './MarketPanel';
import { StorePanel } from './StorePanel';
import type { GeologySkillKey, GeologyUpgradeCatalog, GeologyUpgradeOption } from './types';

type Props = {
  onMessage?: (message: string) => void;
};

const skillLabels: Record<GeologySkillKey, { title: string; description: string; icon: ImageSourcePropType }> = {
  range: {
    title: 'Дальность',
    description: 'Как далеко можно исследовать от текущей позиции.',
    icon: gameAssets.utility.measure,
  },
  coverage: {
    title: 'Площадь разведки',
    description: 'Сколько соседних H3-ячеек попадает в один проход.',
    icon: gameAssets.utility.territories,
  },
  depth: {
    title: 'Глубина',
    description: 'Максимальная глубина обнаруживаемых залежей.',
    icon: gameAssets.mapModes.terrain,
  },
  accuracy: {
    title: 'Точность',
    description: 'Сужает погрешность оценки объёма, глубины и качества.',
    icon: gameAssets.utility.center,
  },
  sensitivity: {
    title: 'Чувствительность',
    description: 'Позволяет замечать более редкие типы ресурсов.',
    icon: gameAssets.mapModes.resources,
  },
};

function formatValue(option: GeologyUpgradeOption, value: number | null): string {
  if (value === null) return 'MAX';
  if (option.skill === 'accuracy') return `±${Math.round(value * 100)}%`;
  if (option.skill === 'range' || option.skill === 'depth') return `${value} м`;
  if (option.skill === 'coverage') return `${value} кол.`;
  return `R${value}`;
}

export function GeologyProgressPanel({ onMessage }: Props) {
  const [section, setSection] = useState<'geology' | 'deposits' | 'market' | 'store'>('geology');
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

  return (
    <View style={styles.panel}>
      <View style={styles.tabs}>
        <SectionTab
          label="ТЕХНОЛОГИИ"
          source={gameAssets.nav.technologies}
          active={section === 'geology'}
          onPress={() => setSection('geology')}
        />
        <SectionTab
          label="ЗАЛЕЖИ"
          source={gameAssets.mapModes.resources}
          active={section === 'deposits'}
          onPress={() => setSection('deposits')}
        />
        <SectionTab
          label="РЫНОК"
          source={gameAssets.nav.trade}
          active={section === 'market'}
          onPress={() => setSection('market')}
        />
        <SectionTab
          label="МАГАЗИН"
          source={gameAssets.resources.gold}
          active={section === 'store'}
          onPress={() => setSection('store')}
        />
      </View>

      {section === 'deposits' ? (
        <KnownDepositsPanel onMessage={onMessage} />
      ) : section === 'market' ? (
        <MarketPanel
          onMessage={onMessage}
          onSold={refresh}
        />
      ) : section === 'store' ? (
        <StorePanel
          onMessage={onMessage}
          onPurchased={refresh}
        />
      ) : loading && !catalog ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#38d8ff" />
          <Text style={styles.muted}>Загрузка геологических технологий…</Text>
        </View>
      ) : catalog ? (
        <>
          <View style={styles.headerRow}>
            <View style={styles.headerIdentity}>
              <Image source={gameAssets.nav.exploration} style={styles.headerIcon} resizeMode="contain" />
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>ГЕОЛОГИЧЕСКАЯ СЛУЖБА</Text>
                <Text style={styles.title}>Технологии разведки</Text>
              </View>
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
                  <Image source={meta.icon} style={styles.skillIcon} resizeMode="contain" />
                  <View style={styles.skillText}>
                    <View style={styles.skillTitleRow}>
                      <Text style={styles.skillTitle}>{meta.title}</Text>
                      <Text style={styles.level}>LV {option.currentLevel}/10</Text>
                    </View>
                    <Text style={styles.description}>{meta.description}</Text>
                  </View>
                </View>

                <View style={styles.valueRow}>
                  <View style={styles.valuePill}>
                    <Text style={styles.valueLabel}>СЕЙЧАС</Text>
                    <Text style={styles.currentValue}>{formatValue(option, option.currentValue)}</Text>
                  </View>
                  <Text style={styles.arrow}>→</Text>
                  <View style={[styles.valuePill, styles.valuePillNext]}>
                    <Text style={styles.valueLabel}>СЛЕДУЮЩИЙ</Text>
                    <Text style={styles.nextValue}>{formatValue(option, option.nextValue)}</Text>
                  </View>
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
        </>
      ) : null}
    </View>
  );
}

function SectionTab({
  label,
  source,
  active,
  onPress,
}: {
  label: string;
  source: ImageSourcePropType;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
    >
      <Image source={source} style={styles.tabIcon} resizeMode="contain" />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
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
      {busy ? <ActivityIndicator size="small" color="#ffffff" /> : (
        <View style={styles.upgradeContent}>
          <Image source={gameAssets.utility.upgrade} style={styles.upgradeIcon} resizeMode="contain" />
          <Text style={styles.buttonText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 5, gap: 9 },
  tabs: {
    flexDirection: 'row',
    gap: 5,
    padding: 4,
    borderRadius: 13,
    backgroundColor: 'rgba(2,13,21,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.12)',
  },
  tab: {
    flex: 1,
    minHeight: 55,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: 'rgba(22,111,145,0.24)',
    borderColor: 'rgba(56,216,255,0.52)',
  },
  tabIcon: { width: 43, height: 35 },
  tabText: { color: '#7891a1', fontSize: 6, fontWeight: '900', letterSpacing: 0.35, marginTop: -2 },
  tabTextActive: { color: '#eaf9ff' },
  loadingBox: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  headerIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { width: 58, height: 52, borderRadius: 10 },
  headerText: { flex: 1 },
  eyebrow: { color: '#6d93aa', fontSize: 8, letterSpacing: 1.2, fontWeight: '800' },
  title: { color: '#f3f9fc', fontSize: 15, fontWeight: '900', marginTop: 2 },
  wallet: {
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  walletSoft: { color: '#f5c451', fontSize: 11, fontWeight: '900' },
  walletPremium: { color: '#38d8ff', fontSize: 10, fontWeight: '900', marginTop: 2 },
  skillCard: {
    padding: 10,
    borderRadius: 13,
    backgroundColor: 'rgba(5,25,36,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.16)',
  },
  skillHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  skillIcon: { width: 52, height: 52, borderRadius: 11 },
  skillText: { flex: 1 },
  skillTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  skillTitle: { color: '#f3f8fb', fontSize: 12, fontWeight: '900' },
  description: { color: '#91a6b3', fontSize: 9, marginTop: 3, lineHeight: 13 },
  level: { color: '#f4c957', fontSize: 9, fontWeight: '900' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
  valuePill: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  valuePillNext: { backgroundColor: 'rgba(33,215,168,0.07)' },
  valueLabel: { color: '#627b8c', fontSize: 6, fontWeight: '900', letterSpacing: 0.7 },
  currentValue: { color: '#dce7ed', fontSize: 11, fontWeight: '800', marginTop: 2 },
  arrow: { color: '#38d8ff', fontSize: 13 },
  nextValue: { color: '#47e5bc', fontSize: 11, fontWeight: '900', marginTop: 2 },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 9 },
  button: {
    flex: 1,
    minHeight: 39,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#4e350b',
    borderWidth: 1,
    borderColor: '#e4a93b',
  },
  buttonPremium: { backgroundColor: '#08394a', borderColor: '#38d8ff' },
  upgradeContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  upgradeIcon: { width: 25, height: 25 },
  buttonText: { color: '#ffffff', fontSize: 9, fontWeight: '900' },
  disabled: { opacity: 0.34 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  maxed: { color: '#47e5bc', fontSize: 9, fontWeight: '900', marginTop: 9 },
  muted: { color: '#91a5b2', fontSize: 10 },
  note: { color: '#5e7483', fontSize: 8, lineHeight: 12 },
});