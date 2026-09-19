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
  getGeologyUpgrades,
  getTechnologyCatalog,
  upgradeGeology,
  upgradeTechnology,
} from './api';
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

type Props = {
  onMessage?: (message: string) => void;
};

type ActiveResearch = {
  id: string;
  techKey: IndustrialTechnologyKey;
  targetLevel: number;
  softCost: number;
  startedAt: string;
  completesAt: string;
};

type TimedTechnologyOption = TechnologyOption & {
  researchSeconds: number | null;
  researching?: boolean;
};

type TimedTechnologyCatalog = Omit<TechnologyCatalog, 'technologies'> & {
  activeResearch?: ActiveResearch | null;
  technologies: TimedTechnologyOption[];
};

const tabs: Array<{ key: Tab; title: string; icon: ImageSourcePropType }> = [
  { key: 'geology', title: 'ГЕОЛОГИЯ', icon: gameAssets.nav.exploration },
  { key: 'production', title: 'ДОБЫЧА', icon: gameAssets.nav.development },
  { key: 'economy', title: 'ЭКОНОМИКА', icon: gameAssets.nav.trade },
  { key: 'logistics', title: 'ЛОГИСТИКА', icon: gameAssets.actions.route },
];

const geologyMeta: Record<GeologySkillKey, { title: string; description: string; icon: ImageSourcePropType }> = {
  range: { title: 'Дальность разведки', description: 'Увеличивает максимальное расстояние до исследуемой цели.', icon: gameAssets.utility.measure },
  coverage: { title: 'Площадь сканирования', description: 'Расширяет число соседних H3-ячеек за один проход.', icon: gameAssets.utility.territories },
  depth: { title: 'Глубина разведки', description: 'Открывает более глубокие залежи и месторождения.', icon: gameAssets.mapModes.terrain },
  accuracy: { title: 'Точность оценки', description: 'Снижает погрешность оценки запасов, глубины и качества.', icon: gameAssets.utility.center },
  sensitivity: { title: 'Чувствительность', description: 'Позволяет обнаруживать всё более редкие ресурсы.', icon: gameAssets.mapModes.resources },
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

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
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

function researchTiming(active: ActiveResearch | null | undefined, now: number) {
  if (!active) return null;
  const start = new Date(active.startedAt).getTime();
  const end = new Date(active.completesAt).getTime();
  const valid = Number.isFinite(start) && Number.isFinite(end) && end > start;
  const remainingSeconds = valid ? Math.max(0, (end - now) / 1000) : 0;
  const progress = valid ? Math.max(0, Math.min(1, (now - start) / (end - start))) : 0;
  return { remainingSeconds, progress };
}

export function TechnologyTreePanel({ onMessage }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('production');
  const [geology, setGeology] = useState<GeologyUpgradeCatalog | null>(null);
  const [industry, setIndustry] = useState<TimedTechnologyCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextGeology, nextIndustry] = await Promise.all([
        getGeologyUpgrades(),
        getTechnologyCatalog(),
      ]);
      setGeology(nextGeology);
      setIndustry(nextIndustry as TimedTechnologyCatalog);
    } catch (error) {
      onMessage?.(`Технологии: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!industry?.activeResearch) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [industry?.activeResearch]);

  const activeTiming = researchTiming(industry?.activeResearch, now);
  useEffect(() => {
    if (!industry?.activeResearch || !activeTiming || activeTiming.remainingSeconds > 0) return;
    const timer = setTimeout(() => void refresh(), 500);
    return () => clearTimeout(timer);
  }, [activeTiming?.remainingSeconds, industry?.activeResearch, refresh]);

  const totalIndustrialLevels = useMemo(
    () => industry?.technologies.reduce((sum, item) => sum + item.currentLevel, 0) ?? 0,
    [industry],
  );
  const totalGeologyLevels = useMemo(
    () => geology?.upgrades.reduce((sum, item) => sum + item.currentLevel, 0) ?? 0,
    [geology],
  );

  const upgradeGeo = useCallback(async (skill: GeologySkillKey) => {
    setBusy(`geo:${skill}`);
    try {
      const result = await upgradeGeology({ skill, currency: 'soft' });
      onMessage?.(`${geologyMeta[skill].title}: LV ${result.level} · списано ${formatNumber(result.charged)} ₡`);
      await refresh();
    } catch (error) {
      onMessage?.(`Геология: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setBusy(null);
    }
  }, [onMessage, refresh]);

  const upgradeIndustrial = useCallback(async (techKey: IndustrialTechnologyKey) => {
    setBusy(`tech:${techKey}`);
    try {
      const raw = await upgradeTechnology({ techKey });
      const result = raw as unknown as {
        status: 'researching';
        targetLevel: number;
        charged: number;
        research: { durationSeconds: number; completesAt: string };
      };
      const title = industry?.technologies.find((item) => item.key === techKey)?.title ?? techKey;
      onMessage?.(`${title}: исследование LV ${result.targetLevel} запущено · ${formatClock(result.research.durationSeconds)}`);
      await refresh();
    } catch (error) {
      onMessage?.(`Технология: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setBusy(null);
    }
  }, [industry, onMessage, refresh]);

  const activeTitle = industry?.activeResearch
    ? industry.technologies.find((item) => item.key === industry.activeResearch?.techKey)?.title ?? industry.activeResearch.techKey
    : null;

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Image source={gameAssets.nav.technologies} style={styles.heroIcon} resizeMode="contain" />
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>НАУКА И ТЕХНОЛОГИИ</Text>
          <Text style={styles.title}>Технологическое развитие</Text>
          <Text style={styles.description}>Производственные технологии исследуются во времени. Одновременно работает один исследовательский проект.</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            accessibilityLabel={`Открыть технологии: ${tab.title}`}
            onPress={() => setActiveTab(tab.key)}
            style={({ pressed }) => [styles.tab, activeTab === tab.key && styles.tabActive, pressed && styles.pressed]}
          >
            <Image source={tab.icon} style={styles.tabIcon} resizeMode="contain" />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.title}</Text>
          </Pressable>
        ))}
      </View>

      {loading && !geology && !industry ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#38d8ff" />
          <Text style={styles.muted}>Загрузка дерева технологий…</Text>
        </View>
      ) : null}

      {geology && industry ? (
        <>
          <View style={styles.summary}>
            <View>
              <Text style={styles.label}>ОБЩИЙ ПРОГРЕСС</Text>
              <Text style={styles.summaryValue}>{totalGeologyLevels + totalIndustrialLevels}/150</Text>
            </View>
            <View style={styles.wallet}>
              <Text style={styles.walletValue}>{formatNumber(industry.wallet.soft)} ₡</Text>
              <Text style={styles.walletHint}>бюджет исследований</Text>
            </View>
          </View>

          {industry.activeResearch && activeTiming ? (
            <View style={styles.researchBanner}>
              <View style={styles.researchHeader}>
                <View style={styles.flex}>
                  <Text style={styles.researchEyebrow}>ИССЛЕДОВАНИЕ В РАБОТЕ</Text>
                  <Text style={styles.researchTitle}>{activeTitle} · LV {industry.activeResearch.targetLevel}</Text>
                </View>
                <Text style={styles.researchClock}>{formatClock(activeTiming.remainingSeconds)}</Text>
              </View>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(activeTiming.progress * 100)}%` }]} /></View>
              <Text style={styles.researchHint}>Новый уровень начнёт действовать после завершения таймера.</Text>
            </View>
          ) : null}

          {activeTab === 'geology' ? (
            <GeologyBranch catalog={geology} busy={busy} onUpgrade={upgradeGeo} />
          ) : (
            <IndustrialBranch
              catalog={industry}
              category={activeTab}
              busy={busy}
              activeResearch={industry.activeResearch ?? null}
              activeTiming={activeTiming}
              onUpgrade={upgradeIndustrial}
            />
          )}

          <TechnologyImpact catalog={industry} />
        </>
      ) : null}
    </View>
  );
}

function GeologyBranch({
  catalog,
  busy,
  onUpgrade,
}: {
  catalog: GeologyUpgradeCatalog;
  busy: string | null;
  onUpgrade: (skill: GeologySkillKey) => void;
}) {
  return (
    <View style={styles.cards}>
      {catalog.upgrades.map((option) => {
        const meta = geologyMeta[option.skill];
        const isBusy = busy === `geo:${option.skill}`;
        const cost = option.price?.soft ?? null;
        const disabled = isBusy || option.maxed || cost === null || catalog.wallet.soft < cost;
        return (
          <TechCard
            key={option.skill}
            icon={meta.icon}
            title={meta.title}
            description={meta.description}
            level={option.currentLevel}
            currentValue={geologyValue(option, option.currentValue)}
            nextValue={geologyValue(option, option.nextValue)}
            effectLabel="Параметр разведки"
            maxed={option.maxed}
            cost={cost}
            disabled={disabled}
            busy={isBusy}
            buttonLabel={option.maxed ? 'ИЗУЧЕНО' : 'УЛУЧШИТЬ ОБОРУДОВАНИЕ'}
            subLabel={!option.maxed ? 'Применяется сразу' : undefined}
            onPress={() => onUpgrade(option.skill)}
          />
        );
      })}
    </View>
  );
}

function IndustrialBranch({
  catalog,
  category,
  busy,
  activeResearch,
  activeTiming,
  onUpgrade,
}: {
  catalog: TimedTechnologyCatalog;
  category: TechnologyCategory;
  busy: string | null;
  activeResearch: ActiveResearch | null;
  activeTiming: { remainingSeconds: number; progress: number } | null;
  onUpgrade: (key: IndustrialTechnologyKey) => void;
}) {
  const items = catalog.technologies.filter((item) => item.category === category);
  return (
    <View style={styles.cards}>
      {items.map((option) => {
        const isBusy = busy === `tech:${option.key}`;
        const isResearching = activeResearch?.techKey === option.key;
        const disabled = isBusy || Boolean(activeResearch) || option.maxed || option.priceSoft === null || catalog.wallet.soft < (option.priceSoft ?? 0);
        return (
          <TechCard
            key={option.key}
            icon={industrialIcons[option.key]}
            title={option.title}
            description={option.description}
            level={option.currentLevel}
            currentValue={industrialEffect(option, option.currentEffect)}
            nextValue={industrialEffect(option, option.nextEffect)}
            effectLabel={option.effect}
            maxed={option.maxed}
            cost={option.priceSoft}
            disabled={disabled}
            busy={isBusy}
            researching={isResearching}
            researchProgress={isResearching ? activeTiming?.progress ?? 0 : null}
            buttonLabel={option.maxed
              ? 'ИЗУЧЕНО'
              : isResearching
                ? `ИССЛЕДУЕТСЯ · ${formatClock(activeTiming?.remainingSeconds ?? 0)}`
                : 'НАЧАТЬ ИССЛЕДОВАНИЕ'}
            subLabel={!option.maxed && !isResearching && option.researchSeconds !== null
              ? `Время: ${formatClock(option.researchSeconds)}`
              : isResearching
                ? `После завершения: LV ${activeResearch?.targetLevel ?? option.currentLevel + 1}`
                : Boolean(activeResearch)
                  ? 'Исследовательский центр занят'
                  : undefined}
            onPress={() => onUpgrade(option.key)}
          />
        );
      })}
    </View>
  );
}

function TechCard({
  icon,
  title,
  description,
  level,
  currentValue,
  nextValue,
  effectLabel,
  maxed,
  cost,
  disabled,
  busy,
  researching = false,
  researchProgress = null,
  buttonLabel,
  subLabel,
  onPress,
}: {
  icon: ImageSourcePropType;
  title: string;
  description: string;
  level: number;
  currentValue: string;
  nextValue: string;
  effectLabel: string;
  maxed: boolean;
  cost: number | null;
  disabled: boolean;
  busy: boolean;
  researching?: boolean;
  researchProgress?: number | null;
  buttonLabel: string;
  subLabel?: string;
  onPress: () => void;
}) {
  return (
    <View style={[styles.card, researching && styles.cardResearching]}>
      <View style={styles.cardHeader}>
        <View style={styles.iconFrame}><Image source={icon} style={styles.icon} resizeMode="contain" /></View>
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.level}>LV {level}/10</Text>
          </View>
          <Text style={styles.cardDescription}>{description}</Text>
        </View>
      </View>

      <Text style={styles.effectLabel}>{effectLabel}</Text>
      <View style={styles.values}>
        <View style={styles.valueBox}><Text style={styles.valueLabel}>СЕЙЧАС</Text><Text style={styles.value}>{currentValue}</Text></View>
        <Text style={styles.arrow}>→</Text>
        <View style={[styles.valueBox, styles.valueBoxNext]}><Text style={styles.valueLabel}>СЛЕДУЮЩИЙ</Text><Text style={styles.valueNext}>{nextValue}</Text></View>
      </View>

      {researching && researchProgress !== null ? (
        <View style={styles.cardProgressTrack}><View style={[styles.cardProgressFill, { width: `${Math.round(Math.max(0, Math.min(1, researchProgress)) * 100)}%` }]} /></View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.upgrade, researching && styles.researchingButton, maxed && styles.maxed, disabled && styles.disabled, pressed && styles.pressed]}
      >
        {busy ? <ActivityIndicator size="small" color="#ffffff" /> : (
          <>
            <Image source={gameAssets.utility.upgrade} style={styles.upgradeIcon} resizeMode="contain" />
            <View style={styles.flex}>
              <Text style={styles.upgradeTitle}>{buttonLabel}</Text>
              {subLabel ? <Text style={styles.upgradeSub}>{subLabel}</Text> : null}
              {!maxed && cost !== null && !researching ? <Text style={styles.upgradeCost}>{formatNumber(cost)} ₡</Text> : null}
            </View>
          </>
        )}
      </Pressable>
    </View>
  );
}

function TechnologyImpact({ catalog }: { catalog: TechnologyCatalog }) {
  const m = catalog.modifiers;
  return (
    <View style={styles.impact}>
      <Text style={styles.label}>ТЕКУЩИЙ ЭФФЕКТ КОМПАНИИ</Text>
      <View style={styles.impactGrid}>
        <Impact label="Вся добыча" value={`+${Math.round((m.productionMultiplier - 1) * 100)}%`} />
        <Impact label="Шахты" value={`+${Math.round((m.mineProductionMultiplier - 1) * 100)}%`} />
        <Impact label="Скважины" value={`+${Math.round((m.wellProductionMultiplier - 1) * 100)}%`} />
        <Impact label="OPEX" value={`−${Math.round((1 - m.extractionOpexMultiplier) * 100)}%`} />
        <Impact label="Цена продажи" value={`+${Math.round((m.marketPriceMultiplier - 1) * 100)}%`} />
        <Impact label="Аренда земли" value={`−${Math.round((1 - m.claimCostMultiplier) * 100)}%`} />
        <Impact label="Буфер склада" value={`+${Math.round(m.bufferHoursBonus)} ч`} />
      </View>
    </View>
  );
}

function Impact({ label, value }: { label: string; value: string }) {
  return <View style={styles.impactItem}><Text style={styles.impactLabel}>{label}</Text><Text style={styles.impactValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  flex: { flex: 1 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, borderRadius: 14, backgroundColor: 'rgba(7,31,43,0.94)', borderWidth: 1, borderColor: 'rgba(56,216,255,0.18)' },
  heroIcon: { width: 58, height: 54 },
  eyebrow: { color: '#58d8e8', fontSize: 7, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: '#f3f8fa', fontSize: 15, fontWeight: '900', marginTop: 1 },
  description: { color: '#8ca2ae', fontSize: 8.5, lineHeight: 12, marginTop: 3 },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 4, borderRadius: 10, backgroundColor: 'rgba(5,19,28,0.9)', borderWidth: 1, borderColor: 'rgba(80,126,146,0.16)' },
  tabActive: { backgroundColor: 'rgba(16,71,86,0.9)', borderColor: 'rgba(56,216,255,0.55)' },
  tabIcon: { width: 25, height: 25 },
  tabText: { color: '#758d99', fontSize: 5.8, fontWeight: '900', marginTop: 1 },
  tabTextActive: { color: '#dffaff' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  muted: { color: '#8397a2', fontSize: 9 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderRadius: 11, backgroundColor: 'rgba(10,35,45,0.88)', borderWidth: 1, borderColor: 'rgba(56,216,255,0.12)' },
  label: { color: '#718b98', fontSize: 6.8, fontWeight: '900', letterSpacing: 0.8 },
  summaryValue: { color: '#44d9f4', fontSize: 16, fontWeight: '900', marginTop: 1 },
  wallet: { alignItems: 'flex-end' },
  walletValue: { color: '#f4c856', fontSize: 11, fontWeight: '900' },
  walletHint: { color: '#6e8591', fontSize: 6.5, marginTop: 1 },
  researchBanner: { padding: 8, borderRadius: 11, backgroundColor: 'rgba(48,39,93,0.76)', borderWidth: 1, borderColor: 'rgba(166,111,255,0.4)' },
  researchHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  researchEyebrow: { color: '#bb8dff', fontSize: 6.5, fontWeight: '900', letterSpacing: 0.8 },
  researchTitle: { color: '#f1e7ff', fontSize: 10.5, fontWeight: '900', marginTop: 2 },
  researchClock: { color: '#d9baff', fontSize: 14, fontWeight: '900' },
  researchHint: { color: '#9b8bb5', fontSize: 7, marginTop: 4 },
  progressTrack: { height: 5, borderRadius: 5, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 6 },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: '#a86df5' },
  cards: { gap: 6 },
  card: { padding: 8, borderRadius: 12, backgroundColor: 'rgba(5,19,28,0.96)', borderWidth: 1, borderColor: 'rgba(78,154,174,0.17)' },
  cardResearching: { borderColor: 'rgba(166,111,255,0.48)', backgroundColor: 'rgba(17,20,42,0.96)' },
  cardHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  iconFrame: { width: 47, height: 47, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.035)' },
  icon: { width: 45, height: 45 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  cardTitle: { color: '#eef7f9', fontSize: 10.5, fontWeight: '900', flex: 1 },
  level: { color: '#4edaf0', fontSize: 7.5, fontWeight: '900' },
  cardDescription: { color: '#8499a3', fontSize: 7.8, lineHeight: 11, marginTop: 2 },
  effectLabel: { color: '#a9bbc2', fontSize: 7.2, fontWeight: '800', marginTop: 6 },
  values: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  valueBox: { flex: 1, padding: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.025)' },
  valueBoxNext: { backgroundColor: 'rgba(38,184,206,0.09)' },
  valueLabel: { color: '#627b87', fontSize: 5.8, fontWeight: '900' },
  value: { color: '#c5d3d8', fontSize: 9.5, fontWeight: '900', marginTop: 1 },
  valueNext: { color: '#53e1f1', fontSize: 9.5, fontWeight: '900', marginTop: 1 },
  arrow: { color: '#5f7985', fontSize: 12, fontWeight: '900' },
  cardProgressTrack: { height: 4, marginTop: 6, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.07)' },
  cardProgressFill: { height: '100%', borderRadius: 4, backgroundColor: '#a86df5' },
  upgrade: { minHeight: 38, marginTop: 6, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, backgroundColor: 'rgba(16,82,96,0.85)', borderWidth: 1, borderColor: 'rgba(56,216,255,0.42)' },
  researchingButton: { backgroundColor: 'rgba(72,45,114,0.72)', borderColor: 'rgba(166,111,255,0.5)' },
  maxed: { backgroundColor: 'rgba(30,83,56,0.5)', borderColor: 'rgba(64,221,145,0.34)' },
  upgradeIcon: { width: 28, height: 28 },
  upgradeTitle: { color: '#eefbfc', fontSize: 7.5, fontWeight: '900' },
  upgradeSub: { color: '#94a8b1', fontSize: 6.5, marginTop: 1 },
  upgradeCost: { color: '#f4c856', fontSize: 7, fontWeight: '900', marginTop: 1 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.73, transform: [{ scale: 0.985 }] },
  impact: { padding: 8, borderRadius: 11, backgroundColor: 'rgba(7,28,35,0.92)', borderWidth: 1, borderColor: 'rgba(65,218,173,0.14)' },
  impactGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  impactItem: { width: '31.8%', padding: 5, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.025)' },
  impactLabel: { color: '#748b96', fontSize: 5.8, fontWeight: '800' },
  impactValue: { color: '#47dfad', fontSize: 8.5, fontWeight: '900', marginTop: 1 },
});