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
import { DEMO_PLAYER_ID, getApiUrl, getGeologyUpgrades, upgradeGeology } from './api';
import { DepositInvestigationPanel } from './DepositInvestigationPanel';
import { DevelopmentProjectPanel } from './DevelopmentProjectPanel';
import { gameAssets, resourceIconForCode } from './gameAssets';
import { MarketPanel } from './MarketPanel';
import { StorePanel } from './StorePanel';
import type { GeologySkillKey, GeologyUpgradeCatalog, GeologyUpgradeOption } from './types';

export type GameplaySection = 'exploration' | 'development' | 'trade' | 'technology';

type Props = {
  section: GameplaySection;
  onMessage?: (message: string) => void;
};

type InvestmentRisk = 'low' | 'moderate' | 'elevated' | 'high';

type KnownDeposit = {
  id: string;
  h3Index: string;
  resource: { code: string; name: string; rarity: number; unit: string };
  confidence: number;
  estimatedQuantity: { min: number; max: number };
  investment: {
    marketPricePerUnit: number | null;
    grossValue: { min: number; max: number } | null;
    uncertainty: number;
    risk: InvestmentRisk;
    recommendation: string;
  };
  completedStudies: number;
  activeStudy: null | { method: string; completesAt: string | null };
  updatedAt: string;
};

type DepositsResponse = { deposits: KnownDeposit[] };

const riskLabels: Record<InvestmentRisk, string> = {
  low: 'НИЗКИЙ',
  moderate: 'УМЕРЕННЫЙ',
  elevated: 'ПОВЫШЕННЫЙ',
  high: 'ВЫСОКИЙ',
};

const sectionMeta: Record<GameplaySection, { eyebrow: string; title: string; description: string; icon: ImageSourcePropType }> = {
  exploration: {
    eyebrow: 'ГЕОЛОГИЧЕСКАЯ РАЗВЕДКА',
    title: 'Изучение месторождений',
    description: 'Уточняйте запасы, глубину, качество и инвестиционную достоверность найденных залежей.',
    icon: gameAssets.nav.exploration,
  },
  development: {
    eyebrow: 'ПРОМЫШЛЕННОЕ ОСВОЕНИЕ',
    title: 'Проекты разработки',
    description: 'Выбирайте технологию добычи, считайте CAPEX/OPEX и запускайте строительство объектов.',
    icon: gameAssets.nav.development,
  },
  trade: {
    eyebrow: 'ЭКОНОМИКА И ТОРГОВЛЯ',
    title: 'Рынок ресурсов',
    description: 'Продавайте добытые ресурсы и используйте магазин ускорений без обязательных платежей.',
    icon: gameAssets.nav.trade,
  },
  technology: {
    eyebrow: 'НАУКА И ТЕХНОЛОГИИ',
    title: 'Развитие георазведки',
    description: 'Прокачивайте дальность, площадь, глубину, точность и чувствительность разведки.',
    icon: gameAssets.nav.technologies,
  },
};

function formatNumber(value: number, maxDigits = 0): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: maxDigits }).format(value);
}

function formatMoney(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} млрд ₡`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн ₡`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} тыс. ₡`;
  return `${formatNumber(value)} ₡`;
}

export function MainSectionPanel({ section, onMessage }: Props) {
  const meta = sectionMeta[section];
  return (
    <View style={styles.root}>
      <View style={styles.sectionHero}>
        <Image source={meta.icon} style={styles.sectionHeroIcon} resizeMode="contain" />
        <View style={styles.flex}>
          <Text style={styles.sectionEyebrow}>{meta.eyebrow}</Text>
          <Text style={styles.sectionTitle}>{meta.title}</Text>
          <Text style={styles.sectionDescription}>{meta.description}</Text>
        </View>
      </View>

      {section === 'exploration' ? <DepositWorkspace mode="exploration" onMessage={onMessage} /> : null}
      {section === 'development' ? <DepositWorkspace mode="development" onMessage={onMessage} /> : null}
      {section === 'trade' ? <TradeWorkspace onMessage={onMessage} /> : null}
      {section === 'technology' ? <TechnologyWorkspace onMessage={onMessage} /> : null}
    </View>
  );
}

function DepositWorkspace({ mode, onMessage }: { mode: 'exploration' | 'development'; onMessage?: (message: string) => void }) {
  const [deposits, setDeposits] = useState<KnownDeposit[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/v1/geology/${encodeURIComponent(DEMO_PLAYER_ID)}/deposits`);
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${response.status}`;
        throw new Error(message);
      }
      const next = (body as DepositsResponse).deposits;
      setDeposits(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
    } catch (error) {
      onMessage?.(`${mode === 'exploration' ? 'Разведка' : 'Разработка'}: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [mode, onMessage]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading && !deposits.length) {
    return <View style={styles.loadingRow}><ActivityIndicator color="#38d8ff" /><Text style={styles.muted}>Загрузка известных залежей…</Text></View>;
  }

  if (!deposits.length) {
    return (
      <View style={styles.emptyBox}>
        <Image source={mode === 'exploration' ? gameAssets.nav.exploration : gameAssets.nav.development} style={styles.emptyIcon} resizeMode="contain" />
        <Text style={styles.emptyTitle}>Нет подтверждённых залежей</Text>
        <Text style={styles.muted}>Сначала проведите разведку на карте. Найденные объекты появятся здесь автоматически.</Text>
      </View>
    );
  }

  const selected = deposits.find((item) => item.id === selectedId) ?? deposits[0];
  const readyCount = deposits.filter((item) => item.confidence >= 0.85).length;

  return (
    <View style={styles.workspace}>
      <View style={styles.workspaceToolbar}>
        <View>
          <Text style={styles.workspaceLabel}>{mode === 'exploration' ? 'БАЗА ЗАЛЕЖЕЙ' : 'ОБЪЕКТЫ К ОСВОЕНИЮ'}</Text>
          <Text style={styles.workspaceSummary}>{deposits.length} объектов · {readyCount} с достоверностью ≥85%</Text>
        </View>
        <Pressable onPress={() => void refresh()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Image source={gameAssets.utility.center} style={styles.iconButtonImage} resizeMode="contain" />
        </Pressable>
      </View>

      <View style={styles.depositList}>
        {deposits.map((deposit) => {
          const active = deposit.id === selected.id;
          return (
            <Pressable
              key={deposit.id}
              onPress={() => setSelectedId(deposit.id)}
              style={({ pressed }) => [styles.depositRow, active && styles.depositRowActive, pressed && styles.pressed]}
            >
              <Image source={resourceIconForCode(deposit.resource.code)} style={styles.depositIcon} resizeMode="contain" />
              <View style={styles.flex}>
                <View style={styles.depositNameRow}>
                  <Text style={styles.depositName}>{deposit.resource.name}</Text>
                  <Text style={styles.rarity}>R{deposit.resource.rarity}</Text>
                </View>
                <Text style={styles.depositQuantity}>{formatNumber(deposit.estimatedQuantity.min)}–{formatNumber(deposit.estimatedQuantity.max)} {deposit.resource.unit}</Text>
                <Text style={styles.depositCell} numberOfLines={1}>{deposit.h3Index}</Text>
              </View>
              <View style={styles.depositRight}>
                <Text style={[styles.confidence, deposit.confidence >= 0.85 && styles.confidenceReady]}>{Math.round(deposit.confidence * 100)}%</Text>
                <Text style={styles.studyCount}>{deposit.completedStudies}/4</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <DepositDecisionCard deposit={selected} mode={mode} />

      {mode === 'exploration' ? (
        <DepositInvestigationPanel
          key={`exploration-${selected.id}-${selected.updatedAt}`}
          depositId={selected.id}
          onMessage={(message) => { onMessage?.(message); void refresh(); }}
        />
      ) : (
        <DevelopmentProjectPanel
          key={`development-${selected.id}-${selected.updatedAt}`}
          depositId={selected.id}
          onMessage={(message) => { onMessage?.(message); void refresh(); }}
        />
      )}
    </View>
  );
}

function DepositDecisionCard({ deposit, mode }: { deposit: KnownDeposit; mode: 'exploration' | 'development' }) {
  const gross = deposit.investment.grossValue;
  return (
    <View style={[styles.decisionCard, mode === 'development' && styles.decisionCardDevelopment]}>
      <View style={styles.decisionHeader}>
        <View style={styles.decisionLead}>
          <Image source={resourceIconForCode(deposit.resource.code)} style={styles.decisionIcon} resizeMode="contain" />
          <View style={styles.flex}>
            <Text style={styles.workspaceLabel}>{mode === 'exploration' ? 'РАЗВЕДОЧНЫЙ ПРОФИЛЬ' : 'ИНВЕСТИЦИОННЫЙ ПРОФИЛЬ'}</Text>
            <Text style={styles.decisionTitle}>{deposit.resource.name}</Text>
          </View>
        </View>
        <View style={styles.riskBadge}>
          <Text style={styles.riskText}>РИСК {riskLabels[deposit.investment.risk]}</Text>
        </View>
      </View>

      <View style={styles.metricRow}>
        <Metric label="ДОСТОВЕРНОСТЬ" value={`${Math.round(deposit.confidence * 100)}%`} accent={deposit.confidence >= 0.85} />
        <Metric label="ИССЛЕДОВАНИЙ" value={`${deposit.completedStudies}/4`} />
        <Metric label="НЕОПРЕДЕЛЁННОСТЬ" value={`${Math.round(deposit.investment.uncertainty * 100)}%`} />
      </View>

      {gross ? (
        <View style={styles.valueBox}>
          <Text style={styles.valueLabel}>ПОТЕНЦИАЛЬНАЯ ВАЛОВАЯ СТОИМОСТЬ</Text>
          <Text style={styles.valueStrong}>{formatMoney(gross.min)} – {formatMoney(gross.max)}</Text>
        </View>
      ) : null}

      <Text style={styles.recommendation}>{deposit.investment.recommendation}</Text>
      {mode === 'exploration' ? (
        <Text style={styles.hint}>Цель этапа: повысить достоверность геологии перед инвестиционным решением.</Text>
      ) : (
        <Text style={styles.hint}>Цель этапа: выбрать технологию, утвердить CAPEX и запустить промышленное освоение.</Text>
      )}
    </View>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{value}</Text>
    </View>
  );
}

function TradeWorkspace({ onMessage }: { onMessage?: (message: string) => void }) {
  const [tab, setTab] = useState<'market' | 'store'>('market');
  return (
    <View style={styles.workspace}>
      <View style={styles.tradeTabs}>
        <TradeTab
          active={tab === 'market'}
          title="БИРЖА"
          subtitle="Продажа ресурсов"
          icon={gameAssets.nav.trade}
          onPress={() => setTab('market')}
        />
        <TradeTab
          active={tab === 'store'}
          title="МАГАЗИН"
          subtitle="Наборы и ускорения"
          icon={gameAssets.resources.gold}
          onPress={() => setTab('store')}
        />
      </View>
      {tab === 'market' ? <MarketPanel onMessage={onMessage} /> : <StorePanel onMessage={onMessage} />}
    </View>
  );
}

function TradeTab({ active, title, subtitle, icon, onPress }: { active: boolean; title: string; subtitle: string; icon: ImageSourcePropType; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tradeTab, active && styles.tradeTabActive, pressed && styles.pressed]}>
      <Image source={icon} style={styles.tradeTabIcon} resizeMode="contain" />
      <View style={styles.flex}>
        <Text style={[styles.tradeTabTitle, active && styles.tradeTabTitleActive]}>{title}</Text>
        <Text style={styles.tradeTabSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

const skillLabels: Record<GeologySkillKey, { title: string; description: string; icon: ImageSourcePropType }> = {
  range: { title: 'Дальность', description: 'Максимальное расстояние от игрока до цели разведки.', icon: gameAssets.utility.measure },
  coverage: { title: 'Площадь', description: 'Количество соседних H3-ячеек, исследуемых за один проход.', icon: gameAssets.utility.territories },
  depth: { title: 'Глубина', description: 'Максимальная глубина обнаруживаемых залежей.', icon: gameAssets.mapModes.terrain },
  accuracy: { title: 'Точность', description: 'Снижает погрешность оценки объёма, глубины и качества залежи.', icon: gameAssets.utility.center },
  sensitivity: { title: 'Чувствительность', description: 'Открывает возможность обнаруживать более редкие ресурсы.', icon: gameAssets.mapModes.resources },
};

function formatTechValue(option: GeologyUpgradeOption, value: number | null): string {
  if (value === null) return 'MAX';
  if (option.skill === 'accuracy') return `±${Math.round(value * 100)}%`;
  if (option.skill === 'range' || option.skill === 'depth') return `${value} м`;
  if (option.skill === 'coverage') return `${value} кол.`;
  return `R${value}`;
}

function TechnologyWorkspace({ onMessage }: { onMessage?: (message: string) => void }) {
  const [catalog, setCatalog] = useState<GeologyUpgradeCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<GeologySkillKey | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCatalog(await getGeologyUpgrades());
    } catch (error) {
      onMessage?.(`Технологии: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => { void refresh(); }, [refresh]);

  const buy = useCallback(async (skill: GeologySkillKey, currency: 'soft' | 'premium') => {
    setUpgrading(skill);
    try {
      const result = await upgradeGeology({ skill, currency });
      onMessage?.(`Улучшено: ${skillLabels[skill].title} · LV ${result.level} · −${result.charged} ${currency === 'soft' ? '₡' : '◆'}`);
      await refresh();
    } catch (error) {
      onMessage?.(`Улучшение: ${error instanceof Error ? error.message : 'ошибка'}`);
    } finally {
      setUpgrading(null);
    }
  }, [onMessage, refresh]);

  const totalLevels = useMemo(() => catalog?.upgrades.reduce((sum, item) => sum + item.currentLevel, 0) ?? 0, [catalog]);

  if (loading && !catalog) {
    return <View style={styles.loadingRow}><ActivityIndicator color="#38d8ff" /><Text style={styles.muted}>Загрузка дерева технологий…</Text></View>;
  }
  if (!catalog) return null;

  return (
    <View style={styles.workspace}>
      <View style={styles.techSummary}>
        <View><Text style={styles.workspaceLabel}>ТЕХНОЛОГИЧЕСКИЙ УРОВЕНЬ</Text><Text style={styles.techLevel}>{totalLevels}/50</Text></View>
        <View style={styles.wallet}><Text style={styles.walletSoft}>{catalog.wallet.soft.toLocaleString('ru-RU')} ₡</Text><Text style={styles.walletPremium}>{catalog.wallet.premium.toLocaleString('ru-RU')} ◆</Text></View>
      </View>

      {catalog.upgrades.map((option) => {
        const meta = skillLabels[option.skill];
        const busy = upgrading === option.skill;
        const softDisabled = busy || option.maxed || !option.price || catalog.wallet.soft < option.price.soft;
        const premiumDisabled = busy || option.maxed || !option.price || catalog.wallet.premium < option.price.premium;
        return (
          <View key={option.skill} style={styles.techCard}>
            <View style={styles.techHeader}>
              <Image source={meta.icon} style={styles.techIcon} resizeMode="contain" />
              <View style={styles.flex}>
                <View style={styles.techTitleRow}><Text style={styles.techTitle}>{meta.title}</Text><Text style={styles.techLevelSmall}>LV {option.currentLevel}/10</Text></View>
                <Text style={styles.techDescription}>{meta.description}</Text>
              </View>
            </View>
            <View style={styles.techValues}>
              <View style={styles.techValueBox}><Text style={styles.valueLabel}>СЕЙЧАС</Text><Text style={styles.techValue}>{formatTechValue(option, option.currentValue)}</Text></View>
              <Text style={styles.techArrow}>→</Text>
              <View style={[styles.techValueBox, styles.techValueBoxNext]}><Text style={styles.valueLabel}>СЛЕДУЮЩИЙ</Text><Text style={styles.techValueNext}>{formatTechValue(option, option.nextValue)}</Text></View>
            </View>
            {option.maxed ? <Text style={styles.maxed}>МАКСИМАЛЬНЫЙ УРОВЕНЬ</Text> : option.price ? (
              <View style={styles.buyRow}>
                <UpgradeButton disabled={softDisabled} busy={busy} label={`${option.price.soft.toLocaleString('ru-RU')} ₡`} onPress={() => void buy(option.skill, 'soft')} />
                <UpgradeButton disabled={premiumDisabled} busy={busy} premium label={`${option.price.premium} ◆`} onPress={() => void buy(option.skill, 'premium')} />
              </View>
            ) : null}
          </View>
        );
      })}
      <Text style={styles.hint}>Премиум-валюта ускоряет развитие, но каждый уровень также доступен за обычную игровую валюту.</Text>
    </View>
  );
}

function UpgradeButton({ disabled, busy, label, premium = false, onPress }: { disabled: boolean; busy: boolean; label: string; premium?: boolean; onPress: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.buyButton, premium && styles.buyButtonPremium, disabled && styles.disabled, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator size="small" color="#ffffff" /> : (
        <View style={styles.buyContent}><Image source={gameAssets.utility.upgrade} style={styles.buyIcon} resizeMode="contain" /><Text style={styles.buyText}>{label}</Text></View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 3, gap: 9 },
  flex: { flex: 1 },
  sectionHero: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 14, backgroundColor: 'rgba(7,31,43,0.94)', borderWidth: 1, borderColor: 'rgba(56,216,255,0.18)' },
  sectionHeroIcon: { width: 58, height: 54 },
  sectionEyebrow: { color: '#58d8e8', fontSize: 7, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: '#f3f8fa', fontSize: 15, fontWeight: '900', marginTop: 1 },
  sectionDescription: { color: '#8ca2ae', fontSize: 8.5, lineHeight: 12, marginTop: 3 },
  workspace: { gap: 8 },
  workspaceToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  workspaceLabel: { color: '#708997', fontSize: 7, fontWeight: '900', letterSpacing: 0.9 },
  workspaceSummary: { color: '#b2c1c8', fontSize: 8.5, marginTop: 2 },
  iconButton: { width: 37, height: 37, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(13,42,54,0.9)', borderWidth: 1, borderColor: 'rgba(82,217,231,0.22)' },
  iconButtonImage: { width: '100%', height: '100%' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12 },
  muted: { color: '#8397a2', fontSize: 9.5, lineHeight: 13 },
  emptyBox: { padding: 14, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(9,24,34,0.9)', borderWidth: 1, borderColor: 'rgba(82,217,231,0.16)' },
  emptyIcon: { width: 62, height: 62, marginBottom: 6 },
  emptyTitle: { color: '#f0f7f9', fontSize: 13, fontWeight: '900', marginBottom: 4 },
  depositList: { gap: 5 },
  depositRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 7, borderRadius: 11, backgroundColor: 'rgba(7,20,29,0.92)', borderWidth: 1, borderColor: 'rgba(103,137,151,0.13)' },
  depositRowActive: { backgroundColor: 'rgba(17,58,69,0.94)', borderColor: 'rgba(82,217,231,0.5)' },
  depositIcon: { width: 42, height: 42 },
  depositNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  depositName: { color: '#eef6f8', fontSize: 10.5, fontWeight: '900' },
  rarity: { color: '#f3b640', fontSize: 7.5, fontWeight: '900' },
  depositQuantity: { color: '#becdd3', fontSize: 8.5, fontWeight: '700', marginTop: 2 },
  depositCell: { color: '#617783', fontSize: 6.5, marginTop: 1 },
  depositRight: { alignItems: 'flex-end', minWidth: 44 },
  confidence: { color: '#f0b04b', fontSize: 11, fontWeight: '900' },
  confidenceReady: { color: '#49ddb7' },
  studyCount: { color: '#6f8490', fontSize: 7, marginTop: 2 },
  decisionCard: { padding: 10, borderRadius: 13, backgroundColor: 'rgba(9,27,37,0.94)', borderWidth: 1, borderColor: 'rgba(82,217,231,0.2)' },
  decisionCardDevelopment: { borderColor: 'rgba(243,182,64,0.28)' },
  decisionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  decisionLead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  decisionIcon: { width: 40, height: 40 },
  decisionTitle: { color: '#f1f7f9', fontSize: 13, fontWeight: '900', marginTop: 1 },
  riskBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: 'rgba(235,167,56,0.12)' },
  riskText: { color: '#dcb46d', fontSize: 6.5, fontWeight: '900' },
  metricRow: { flexDirection: 'row', gap: 5, marginTop: 8 },
  metric: { flex: 1, padding: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.035)' },
  metricLabel: { color: '#657b88', fontSize: 5.8, fontWeight: '900', letterSpacing: 0.4 },
  metricValue: { color: '#e5eef2', fontSize: 9.5, fontWeight: '900', marginTop: 2 },
  metricValueAccent: { color: '#49ddb7' },
  valueBox: { marginTop: 7, padding: 7, borderRadius: 9, backgroundColor: 'rgba(243,182,64,0.07)' },
  valueLabel: { color: '#6e8290', fontSize: 6, fontWeight: '900', letterSpacing: 0.6 },
  valueStrong: { color: '#f3b640', fontSize: 13, fontWeight: '900', marginTop: 2 },
  recommendation: { color: '#b9c8cf', fontSize: 8.5, lineHeight: 12, marginTop: 7 },
  hint: { color: '#617985', fontSize: 7.5, lineHeight: 11, marginTop: 5 },
  tradeTabs: { flexDirection: 'row', gap: 6 },
  tradeTab: { flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 5, padding: 5, borderRadius: 11, backgroundColor: 'rgba(8,23,32,0.9)', borderWidth: 1, borderColor: 'rgba(115,145,158,0.13)' },
  tradeTabActive: { backgroundColor: 'rgba(17,58,69,0.94)', borderColor: 'rgba(82,217,231,0.5)' },
  tradeTabIcon: { width: 43, height: 43 },
  tradeTabTitle: { color: '#8396a1', fontSize: 8, fontWeight: '900' },
  tradeTabTitleActive: { color: '#eaf8fb' },
  tradeTabSubtitle: { color: '#627783', fontSize: 6.5, marginTop: 2 },
  techSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderRadius: 11, backgroundColor: 'rgba(7,23,32,0.9)' },
  techLevel: { color: '#58d8e8', fontSize: 17, fontWeight: '900', marginTop: 1 },
  wallet: { alignItems: 'flex-end' },
  walletSoft: { color: '#f5c451', fontSize: 10.5, fontWeight: '900' },
  walletPremium: { color: '#38d8ff', fontSize: 9.5, fontWeight: '900', marginTop: 2 },
  techCard: { padding: 9, borderRadius: 12, backgroundColor: 'rgba(5,25,36,0.8)', borderWidth: 1, borderColor: 'rgba(56,216,255,0.15)' },
  techHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  techIcon: { width: 48, height: 48 },
  techTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 7 },
  techTitle: { color: '#f2f7f9', fontSize: 11.5, fontWeight: '900' },
  techLevelSmall: { color: '#f4c957', fontSize: 8, fontWeight: '900' },
  techDescription: { color: '#8da2ae', fontSize: 8.5, lineHeight: 12, marginTop: 2 },
  techValues: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 },
  techValueBox: { flex: 1, padding: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.035)' },
  techValueBoxNext: { backgroundColor: 'rgba(33,215,168,0.07)' },
  techValue: { color: '#dbe7ec', fontSize: 10, fontWeight: '900', marginTop: 1 },
  techValueNext: { color: '#47e5bc', fontSize: 10, fontWeight: '900', marginTop: 1 },
  techArrow: { color: '#38d8ff', fontSize: 12 },
  buyRow: { flexDirection: 'row', gap: 6, marginTop: 7 },
  buyButton: { flex: 1, minHeight: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 9, backgroundColor: '#4e350b', borderWidth: 1, borderColor: '#e4a93b' },
  buyButtonPremium: { backgroundColor: '#08394a', borderColor: '#38d8ff' },
  buyContent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  buyIcon: { width: 23, height: 23 },
  buyText: { color: '#ffffff', fontSize: 8.5, fontWeight: '900' },
  maxed: { color: '#47e5bc', fontSize: 8.5, fontWeight: '900', marginTop: 7 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
