import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  DEMO_PLAYER_ID,
  getApiUrl,
  getGeologyUpgrades,
  getTechnologyCatalog,
  upgradeTechnology,
} from './api';
import { countdownParts, formatResearchClock } from './apiTime';
import { gameAssets } from './gameAssets';
import type {
  GeologySkillKey,
  GeologyUpgradeCatalog,
  GeologyUpgradeOption,
  IndustrialTechnologyKey,
  TechnologyCatalog,
  TechnologyCategory,
  TechnologyOption,
} from './types';

type Tab = 'geology' | TechnologyCategory;
type Props = { onMessage?: (message: string) => void };

type ActiveResearch = {
  kind: 'geology' | 'industrial';
  key: string;
  targetLevel: number;
  cost: number;
  currency: 'soft' | 'premium';
  startedAt: string;
  completesAt: string;
};

type ResearchStatus = { playerId: string; activeResearch: ActiveResearch | null };
type TimedTechnologyOption = TechnologyOption & { researchSeconds?: number | null; researching?: boolean };
type TimedTechnologyCatalog = Omit<TechnologyCatalog, 'technologies'> & {
  technologies: TimedTechnologyOption[];
};

const tabs: Array<{ key: Tab; title: string; icon: ImageSourcePropType }> = [
  { key: 'geology', title: 'ГЕОЛОГИЯ', icon: gameAssets.nav.exploration },
  { key: 'production', title: 'ДОБЫЧА', icon: gameAssets.nav.development },
  { key: 'economy', title: 'ЭКОНОМИКА', icon: gameAssets.nav.trade },
  { key: 'logistics', title: 'ЛОГИСТИКА', icon: gameAssets.actions.route },
];

const geologyMeta: Record<GeologySkillKey, { title: string; description: string; icon: ImageSourcePropType }> = {
  range: { title: 'Дальность разведки', description: 'Увеличивает радиус работы геологоразведочного комплекса.', icon: gameAssets.utility.measure },
  coverage: { title: 'Площадь сканирования', description: 'Увеличивает число соседних H3-ячеек за один проход.', icon: gameAssets.utility.territories },
  depth: { title: 'Глубина разведки', description: 'Открывает более глубокие горизонты и залежи.', icon: gameAssets.mapModes.terrain },
  accuracy: { title: 'Точность оценки', description: 'Снижает погрешность запасов, глубины и качества.', icon: gameAssets.utility.center },
  sensitivity: { title: 'Чувствительность', description: 'Позволяет обнаруживать более редкие ресурсы.', icon: gameAssets.mapModes.resources },
};

const industrialIcons: Record<IndustrialTechnologyKey, ImageSourcePropType> = {
  extraction_automation: gameAssets.utility.play,
  mine_mechanization: gameAssets.industry.mineTruck,
  well_optimization: gameAssets.industry.oilPumpjack,
  predictive_maintenance: gameAssets.utility.build,
  commodity_trading: gameAssets.actions.sell,
  land_management: gameAssets.utility.territories,
  warehouse_network: gameAssets.nav.construction,
  heavy_haul: gameAssets.actions.route,
  pipeline_network: gameAssets.utility.measure,
  fuel_logistics: gameAssets.utility.speed,
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function geologyValue(option: GeologyUpgradeOption, value: number | null): string {
  if (value === null) return 'MAX';
  if (option.skill === 'accuracy') return `±${Math.round(value * 100)}%`;
  if (option.skill === 'range' || option.skill === 'depth') return `${formatNumber(value)} м`;
  if (option.skill === 'coverage') return `${formatNumber(value)} колец`;
  return `R${formatNumber(value)}`;
}

function industrialEffect(option: TechnologyOption, value: number | null): string {
  if (value === null) return 'MAX';
  if (option.effectUnit === 'hours') return `+${formatNumber(value)} ч`;
  return `+${Math.round(value * 1000) / 10}%`;
}

function geologyResearchSeconds(skill: GeologySkillKey, currentLevel: number): number {
  const base: Record<GeologySkillKey, number> = {
    range: 60,
    coverage: 75,
    depth: 90,
    accuracy: 75,
    sensitivity: 105,
  };
  return Math.round(base[skill] * (1 + Math.max(0, currentLevel - 1) * 0.6));
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${response.status}`;
    throw new Error(error);
  }
  return body as T;
}

export function TechnologyTreePanel({ onMessage }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('production');
  const [geology, setGeology] = useState<GeologyUpgradeCatalog | null>(null);
  const [industry, setIndustry] = useState<TimedTechnologyCatalog | null>(null);
  const [research, setResearch] = useState<ActiveResearch | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const [geo, tech, status] = await Promise.all([
        getGeologyUpgrades(),
        getTechnologyCatalog(),
        requestJson<ResearchStatus>(`${getApiUrl()}/api/v1/research/${encodeURIComponent(DEMO_PLAYER_ID)}/status`),
      ]);
      setGeology(geo);
      setIndustry(tech as TimedTechnologyCatalog);
      setResearch(status.activeResearch);
      setNow(Date.now());
    } catch (error) {
      onMessage?.(`Технологии: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!research) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => void refresh(), 5000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [refresh, research]);

  const timing = research ? countdownParts(research.startedAt, research.completesAt, now) : null;
  useEffect(() => {
    if (!research || !timing?.valid || timing.remainingSeconds > 0) return;
    const timer = setTimeout(() => void refresh(), 600);
    return () => clearTimeout(timer);
  }, [refresh, research, timing?.remainingSeconds, timing?.valid]);

  const startGeology = useCallback(async (skill: GeologySkillKey) => {
    setBusy(`geo:${skill}`);
    try {
      const result = await requestJson<{
        targetLevel: number;
        charged: number;
        research: { durationSeconds: number };
      }>(`${getApiUrl()}/api/v1/research/${encodeURIComponent(DEMO_PLAYER_ID)}/geology`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skill, currency: 'soft' }),
      });
      onMessage?.(`${geologyMeta[skill].title}: исследование LV ${result.targetLevel} запущено · ${formatResearchClock(result.research.durationSeconds)}`);
      await refresh();
    } catch (error) {
      onMessage?.(`Геология: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setBusy(null);
    }
  }, [onMessage, refresh]);

  const startIndustrial = useCallback(async (key: IndustrialTechnologyKey) => {
    setBusy(`tech:${key}`);
    try {
      const result = await upgradeTechnology({ techKey: key }) as unknown as {
        targetLevel: number;
        research: { durationSeconds: number };
      };
      const title = industry?.technologies.find((item) => item.key === key)?.title ?? key;
      onMessage?.(`${title}: исследование LV ${result.targetLevel} запущено · ${formatResearchClock(result.research.durationSeconds)}`);
      await refresh();
    } catch (error) {
      onMessage?.(`Технология: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setBusy(null);
    }
  }, [industry, onMessage, refresh]);

  const geoLevels = useMemo(() => geology?.upgrades.reduce((sum, item) => sum + item.currentLevel, 0) ?? 0, [geology]);
  const techLevels = useMemo(() => industry?.technologies.reduce((sum, item) => sum + item.currentLevel, 0) ?? 0, [industry]);

  if (loading && (!geology || !industry)) {
    return <View style={styles.loading}><ActivityIndicator color="#38d8ff" /><Text style={styles.muted}>Загрузка исследований…</Text></View>;
  }
  if (!geology || !industry) return null;

  const activeTitle = research?.kind === 'geology'
    ? geologyMeta[research.key as GeologySkillKey]?.title ?? research.key
    : research
      ? industry.technologies.find((item) => item.key === research.key)?.title ?? research.key
      : null;

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Image source={gameAssets.nav.technologies} style={styles.heroIcon} resizeMode="contain" />
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>НАУЧНО-ИССЛЕДОВАТЕЛЬСКИЙ ЦЕНТР</Text>
          <Text style={styles.title}>Технологическое развитие</Text>
          <Text style={styles.description}>Все улучшения теперь исследуются во времени. Одновременно выполняется одно исследование.</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)} style={[styles.tab, activeTab === tab.key && styles.tabActive]}>
            <Image source={tab.icon} style={styles.tabIcon} resizeMode="contain" />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.title}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.summary}>
        <View><Text style={styles.label}>ОБЩИЙ ПРОГРЕСС</Text><Text style={styles.summaryValue}>{geoLevels + techLevels}/150</Text></View>
        <View style={styles.wallet}><Text style={styles.walletValue}>{formatNumber(industry.wallet.soft)} ₡</Text><Text style={styles.walletHint}>бюджет исследований</Text></View>
      </View>

      {research ? (
        <View style={styles.researchBox}>
          <View style={styles.researchHeader}>
            <View style={styles.flex}>
              <Text style={styles.researchEyebrow}>ИССЛЕДОВАНИЕ В РАБОТЕ</Text>
              <Text style={styles.researchTitle}>{activeTitle} · LV {research.targetLevel}</Text>
            </View>
            <Text style={styles.clock}>{timing?.valid ? formatResearchClock(timing.remainingSeconds) : 'СИНХР.'}</Text>
          </View>
          <View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.round((timing?.progress ?? 0) * 100)}%` }]} /></View>
          <Text style={styles.researchHint}>Эффект появится только после завершения таймера.</Text>
        </View>
      ) : (
        <View style={styles.idleBox}><Text style={styles.idleText}>ИССЛЕДОВАТЕЛЬСКИЙ ЦЕНТР СВОБОДЕН</Text></View>
      )}

      {activeTab === 'geology' ? (
        <View style={styles.cards}>
          {geology.upgrades.map((option) => {
            const meta = geologyMeta[option.skill];
            const cost = option.price?.soft ?? null;
            const seconds = geologyResearchSeconds(option.skill, option.currentLevel);
            const disabled = Boolean(research) || option.maxed || cost === null || geology.wallet.soft < (cost ?? 0) || busy !== null;
            return (
              <ResearchCard
                key={option.skill}
                icon={meta.icon}
                title={meta.title}
                description={meta.description}
                level={option.currentLevel}
                current={geologyValue(option, option.currentValue)}
                next={geologyValue(option, option.nextValue)}
                effect="Параметр разведки"
                cost={cost}
                duration={seconds}
                maxed={option.maxed}
                disabled={disabled}
                busy={busy === `geo:${option.skill}`}
                onPress={() => void startGeology(option.skill)}
              />
            );
          })}
        </View>
      ) : (
        <View style={styles.cards}>
          {industry.technologies.filter((item) => item.category === activeTab).map((option) => {
            const cost = option.priceSoft;
            const duration = option.researchSeconds ?? 60;
            const disabled = Boolean(research) || option.maxed || cost === null || industry.wallet.soft < (cost ?? 0) || busy !== null;
            return (
              <ResearchCard
                key={option.key}
                icon={industrialIcons[option.key]}
                title={option.title}
                description={option.description}
                level={option.currentLevel}
                current={industrialEffect(option, option.currentEffect)}
                next={industrialEffect(option, option.nextEffect)}
                effect={option.effect}
                cost={cost}
                duration={duration}
                maxed={option.maxed}
                disabled={disabled}
                busy={busy === `tech:${option.key}`}
                onPress={() => void startIndustrial(option.key)}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

function ResearchCard({
  icon, title, description, level, current, next, effect, cost, duration, maxed, disabled, busy, onPress,
}: {
  icon: ImageSourcePropType;
  title: string;
  description: string;
  level: number;
  current: string;
  next: string;
  effect: string;
  cost: number | null;
  duration: number;
  maxed: boolean;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconFrame}><Image source={icon} style={styles.icon} resizeMode="contain" /></View>
        <View style={styles.flex}>
          <View style={styles.titleRow}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.level}>LV {level}/10</Text></View>
          <Text style={styles.cardDescription}>{description}</Text>
        </View>
      </View>
      <Text style={styles.effect}>{effect}</Text>
      <View style={styles.values}>
        <View style={styles.valueBox}><Text style={styles.valueLabel}>СЕЙЧАС</Text><Text style={styles.value}>{current}</Text></View>
        <Text style={styles.arrow}>→</Text>
        <View style={[styles.valueBox, styles.nextBox]}><Text style={styles.valueLabel}>ПОСЛЕ ИССЛЕДОВАНИЯ</Text><Text style={styles.nextValue}>{next}</Text></View>
      </View>
      <View style={styles.researchMeta}>
        <Text style={styles.metaText}>ВРЕМЯ: {maxed ? '—' : formatResearchClock(duration)}</Text>
        <Text style={styles.metaText}>СТОИМОСТЬ: {cost === null ? '—' : `${formatNumber(cost)} ₡`}</Text>
      </View>
      <Pressable disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}>
        {busy ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.buttonText}>{maxed ? 'ИЗУЧЕНО' : 'НАЧАТЬ ИССЛЕДОВАНИЕ'}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  loading: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10 },
  muted: { color: '#8297a1', fontSize: 9 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, borderRadius: 14, backgroundColor: 'rgba(7,31,43,0.96)', borderWidth: 1, borderColor: 'rgba(56,216,255,0.2)' },
  heroIcon: { width: 56, height: 52 },
  eyebrow: { color: '#5bdcea', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#f2f8fa', fontSize: 15, fontWeight: '900', marginTop: 1 },
  description: { color: '#8fa3ac', fontSize: 8, lineHeight: 12, marginTop: 3 },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { flex: 1, minHeight: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(5,19,28,0.92)', borderWidth: 1, borderColor: 'rgba(80,126,146,0.16)' },
  tabActive: { backgroundColor: 'rgba(16,71,86,0.92)', borderColor: 'rgba(56,216,255,0.58)' },
  tabIcon: { width: 24, height: 24 },
  tabText: { color: '#788e98', fontSize: 5.6, fontWeight: '900' },
  tabTextActive: { color: '#e3fbff' },
  summary: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderRadius: 11, backgroundColor: 'rgba(10,35,45,0.9)' },
  label: { color: '#718b98', fontSize: 6.5, fontWeight: '900' },
  summaryValue: { color: '#44d9f4', fontSize: 16, fontWeight: '900' },
  wallet: { alignItems: 'flex-end' },
  walletValue: { color: '#f4c856', fontSize: 11, fontWeight: '900' },
  walletHint: { color: '#6e8591', fontSize: 6.2 },
  researchBox: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(17,62,78,0.96)', borderWidth: 1, borderColor: 'rgba(71,211,245,0.45)' },
  researchHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  researchEyebrow: { color: '#6ce5fb', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  researchTitle: { color: '#effbff', fontSize: 11, fontWeight: '900', marginTop: 1 },
  clock: { color: '#75e8ff', fontSize: 16, fontWeight: '900' },
  progress: { height: 6, marginTop: 7, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' },
  progressFill: { height: '100%', backgroundColor: '#55daf5' },
  researchHint: { color: '#91b8c5', fontSize: 7.5, marginTop: 4 },
  idleBox: { padding: 7, borderRadius: 9, backgroundColor: 'rgba(39,99,72,0.28)', borderWidth: 1, borderColor: 'rgba(73,215,157,0.22)' },
  idleText: { color: '#68d9a9', textAlign: 'center', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  cards: { gap: 6 },
  card: { padding: 8, borderRadius: 12, backgroundColor: 'rgba(5,19,28,0.97)', borderWidth: 1, borderColor: 'rgba(78,154,174,0.18)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconFrame: { width: 47, height: 47, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)' },
  icon: { width: 44, height: 44 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  cardTitle: { flex: 1, color: '#eef7f9', fontSize: 10.5, fontWeight: '900' },
  level: { color: '#4edaf0', fontSize: 7.5, fontWeight: '900' },
  cardDescription: { color: '#8499a3', fontSize: 7.6, lineHeight: 11, marginTop: 2 },
  effect: { color: '#a9bbc2', fontSize: 7, fontWeight: '800', marginTop: 6 },
  values: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  valueBox: { flex: 1, padding: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.03)' },
  nextBox: { backgroundColor: 'rgba(38,184,206,0.1)' },
  valueLabel: { color: '#627b87', fontSize: 5.5, fontWeight: '900' },
  value: { color: '#c5d3d8', fontSize: 9.5, fontWeight: '900', marginTop: 1 },
  nextValue: { color: '#53e1f1', fontSize: 9.5, fontWeight: '900', marginTop: 1 },
  arrow: { color: '#5f7985', fontSize: 12, fontWeight: '900' },
  researchMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  metaText: { color: '#8499a4', fontSize: 6.7, fontWeight: '800' },
  button: { minHeight: 38, marginTop: 6, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,82,96,0.9)', borderWidth: 1, borderColor: 'rgba(56,216,255,0.45)' },
  buttonText: { color: '#eefbfc', fontSize: 7.5, fontWeight: '900' },
  disabled: { opacity: 0.42 },
});
