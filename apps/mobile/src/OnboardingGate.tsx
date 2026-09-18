import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Application from 'expo-application';
import App from '../App';
import { AppUpdateBanner } from './AppUpdateBanner';
import { bootstrapPlayer, getApiUrl, setActivePlayerId } from './api';
import { FirstMissionGuide } from './FirstMissionGuide';
import { gameAssets } from './gameAssets';
import type { PlayerSummary } from './types';

type Stage = 'loading' | 'create' | 'created' | 'ready';

async function getInstallationSubject(): Promise<string> {
  if (Platform.OS === 'android') {
    try {
      const androidId = Application.getAndroidId();
      if (androidId) return `android:${androidId}`;
    } catch { /* fallback below */ }
  }
  if (Platform.OS === 'ios') {
    try {
      const vendorId = await Application.getIosIdForVendorAsync();
      if (vendorId) return `ios:${vendorId}`;
    } catch { /* fallback below */ }
  }
  const installedAt = await Application.getInstallationTimeAsync().catch(() => null);
  return `install:${Application.applicationId ?? 'geo-empire'}:${installedAt?.getTime() ?? 'unknown'}`;
}

export function OnboardingGate() {
  const [stage, setStage] = useState<Stage>('loading');
  const [authSubject, setAuthSubject] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [player, setPlayer] = useState<PlayerSummary | null>(null);
  const [starterGrant, setStarterGrant] = useState<{ soft: number; premium: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const resolvePlayer = async () => {
      try {
        const subject = await getInstallationSubject();
        if (cancelled) return;
        setAuthSubject(subject);
        try {
          const result = await bootstrapPlayer({ authSubject: subject });
          if (cancelled) return;
          setActivePlayerId(result.player.id);
          setPlayer(result.player);
          setStage('ready');
        } catch (bootstrapError) {
          if (cancelled) return;
          const message = bootstrapError instanceof Error ? bootstrapError.message : 'unknown_error';
          if (message === 'player_not_found') setStage('create');
          else { setError(`Сервер недоступен: ${message}`); setStage('create'); }
        }
      } catch (identityError) {
        if (cancelled) return;
        setError(`Не удалось определить установку: ${identityError instanceof Error ? identityError.message : 'ошибка'}`);
        setStage('create');
      }
    };
    void resolvePlayer();
    return () => { cancelled = true; };
  }, []);

  const createCompany = async () => {
    const cleanName = displayName.trim();
    const cleanCompany = companyName.trim();
    if (cleanName.length < 2 || cleanCompany.length < 2 || !authSubject) {
      setError('Укажите имя руководителя и название компании.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await bootstrapPlayer({ authSubject, displayName: cleanName, companyName: cleanCompany });
      setActivePlayerId(result.player.id);
      setPlayer(result.player);
      setStarterGrant(result.starterGrant);
      setStage(result.status === 'created' ? 'created' : 'ready');
    } catch (createError) {
      setError(`Создание компании: ${createError instanceof Error ? createError.message : 'ошибка'}`);
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'ready' && player) {
    return (
      <View style={styles.gameRoot}>
        <App />
        <FirstMissionGuide playerId={player.id} initialPlayer={player} />
        <AppUpdateBanner />
      </View>
    );
  }

  return (
    <ImageBackground source={gameAssets.splash.start} style={styles.root} resizeMode="cover">
      <View style={styles.scrim} />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <Image source={gameAssets.nav.map} style={styles.heroIcon} resizeMode="contain" />
              <View>
                <Text style={styles.kicker}>СОВРЕМЕННАЯ ГЕОЭКОНОМИЧЕСКАЯ СТРАТЕГИЯ</Text>
                <Text style={styles.logo}>GEO EMPIRE</Text>
              </View>
            </View>
            <Text style={styles.subtitle}>Исследуйте реальную карту, находите месторождения, инвестируйте в разработку и стройте ресурсную компанию.</Text>
            <View style={styles.featureRow}>
              <Feature icon={gameAssets.nav.exploration} label="РАЗВЕДКА" />
              <Feature icon={gameAssets.nav.development} label="РАЗРАБОТКА" />
              <Feature icon={gameAssets.nav.trade} label="РЫНОК" />
            </View>
          </View>

          {stage === 'loading' ? (
            <View style={styles.card}>
              <ActivityIndicator size="large" color="#58dce7" />
              <Text style={styles.cardTitle}>Подключение к миру</Text>
              <Text style={styles.muted}>Проверяем компанию и синхронизируем игровое состояние…</Text>
            </View>
          ) : stage === 'created' && player ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Image source={gameAssets.utility.select} style={styles.cardIcon} resizeMode="contain" />
                <View style={styles.flexGrow}>
                  <Text style={styles.eyebrow}>КОМПАНИЯ ЗАРЕГИСТРИРОВАНА</Text>
                  <Text style={styles.cardTitle}>{player.companyName}</Text>
                </View>
              </View>
              <Text style={styles.muted}>Руководитель: {player.displayName}</Text>

              <View style={styles.rewardBox}>
                <View><Text style={styles.rewardLabel}>СТАРТОВЫЙ КАПИТАЛ</Text><Text style={styles.rewardSoft}>{(starterGrant?.soft ?? player.wallet.soft).toLocaleString('ru-RU')} ₡</Text></View>
                <View style={styles.rewardRight}><Text style={styles.rewardLabel}>ПРЕМИУМ</Text><Text style={styles.rewardPremium}>+{(starterGrant?.premium ?? 0).toLocaleString('ru-RU')} ◆</Text></View>
              </View>

              <Text style={styles.instructions}>Первый этап: найдите себя на карте, выберите ближайшую свободную ячейку, проведите разведку и оформите первый участок.</Text>
              <PrimaryButton label="НАЧАТЬ РАЗВЕДКУ" onPress={() => setStage('ready')} icon={gameAssets.nav.exploration} />
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Image source={gameAssets.actions.profile} style={styles.cardIcon} resizeMode="contain" />
                <View style={styles.flexGrow}>
                  <Text style={styles.eyebrow}>НОВАЯ КОМПАНИЯ</Text>
                  <Text style={styles.cardTitle}>Создайте оператора</Text>
                </View>
              </View>
              <Text style={styles.muted}>Название компании будет отображаться владельцем арендованных территорий и объектов.</Text>

              <Text style={styles.label}>РУКОВОДИТЕЛЬ</Text>
              <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Например: Михаил" placeholderTextColor="#60717e" maxLength={64} autoCapitalize="words" style={styles.input} />

              <Text style={styles.label}>НАЗВАНИЕ КОМПАНИИ</Text>
              <TextInput value={companyName} onChangeText={setCompanyName} placeholder="Например: Steppe Minerals" placeholderTextColor="#60717e" maxLength={96} autoCapitalize="words" style={styles.input} />

              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PrimaryButton label={busy ? 'СОЗДАНИЕ…' : 'ОСНОВАТЬ КОМПАНИЮ'} onPress={() => void createCompany()} disabled={busy} icon={gameAssets.utility.build} />
              <Text style={styles.server}>API: {getApiUrl()}</Text>
            </View>
          )}

          <Text style={styles.footer}>GEO EMPIRE · ресурсы · территории · экономика</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function Feature({ icon, label }: { icon: number; label: string }) {
  return <View style={styles.feature}><Image source={icon} style={styles.featureIcon} resizeMode="contain" /><Text style={styles.featureText}>{label}</Text></View>;
}

function PrimaryButton({ label, onPress, disabled = false, icon }: { label: string; onPress: () => void; disabled?: boolean; icon: number }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.buttonDisabled, pressed && styles.buttonPressed]}>
      <Image source={icon} style={styles.buttonIcon} resizeMode="contain" />
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gameRoot: { flex: 1 },
  root: { flex: 1, backgroundColor: '#071018' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(3,10,15,0.69)' },
  safe: { flex: 1 },
  flex: { flex: 1, paddingHorizontal: 18, paddingBottom: 14 },
  flexGrow: { flex: 1 },
  hero: { paddingTop: 28, paddingBottom: 16 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIcon: { width: 66, height: 66 },
  kicker: { color: '#6fdce5', fontSize: 7, fontWeight: '900', letterSpacing: 1.5 },
  logo: { color: '#f2c25b', fontSize: 30, lineHeight: 34, fontWeight: '900', letterSpacing: 1.4, marginTop: 2 },
  subtitle: { color: '#afc1c9', fontSize: 12, lineHeight: 18, maxWidth: 390, marginTop: 7 },
  featureRow: { flexDirection: 'row', gap: 7, marginTop: 10 },
  feature: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, padding: 5, borderRadius: 9, backgroundColor: 'rgba(6,20,28,0.75)', borderWidth: 1, borderColor: 'rgba(79,208,220,0.14)' },
  featureIcon: { width: 28, height: 28 },
  featureText: { color: '#9eb2bb', fontSize: 6, fontWeight: '900' },
  card: { backgroundColor: 'rgba(7,18,26,0.95)', borderWidth: 1, borderColor: 'rgba(75,206,219,0.24)', borderRadius: 17, padding: 16, gap: 9 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardIcon: { width: 42, height: 42 },
  eyebrow: { color: '#65d9e4', fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  cardTitle: { color: '#edf4f6', fontSize: 20, fontWeight: '900', marginTop: 1 },
  muted: { color: '#8396a1', fontSize: 10, lineHeight: 15 },
  label: { color: '#b9c7cd', fontSize: 8, fontWeight: '900', letterSpacing: 1.1, marginTop: 3 },
  input: { backgroundColor: 'rgba(3,12,18,0.88)', borderWidth: 1, borderColor: '#29414d', borderRadius: 11, color: '#edf3f4', minHeight: 47, paddingHorizontal: 13, fontSize: 14 },
  rewardBox: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(26,45,34,0.55)', borderWidth: 1, borderColor: 'rgba(88,171,116,0.25)', borderRadius: 12, padding: 12, marginTop: 2 },
  rewardRight: { alignItems: 'flex-end' },
  rewardLabel: { color: '#78a68c', fontSize: 7, fontWeight: '900', letterSpacing: 1.1 },
  rewardSoft: { color: '#f1c15b', fontSize: 22, fontWeight: '900', marginTop: 2 },
  rewardPremium: { color: '#b989dc', fontSize: 15, fontWeight: '900', marginTop: 3 },
  instructions: { color: '#aab9c2', fontSize: 10, lineHeight: 15 },
  error: { color: '#e58d78', fontSize: 10, lineHeight: 15 },
  button: { flexDirection: 'row', gap: 6, backgroundColor: '#d7a640', borderRadius: 11, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  buttonIcon: { width: 34, height: 34 },
  buttonText: { color: '#101317', fontSize: 10, fontWeight: '900', letterSpacing: 0.85 },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.8 },
  server: { color: '#50636e', fontSize: 8, textAlign: 'center', marginTop: 1 },
  footer: { color: '#596e78', fontSize: 8, letterSpacing: 1, textAlign: 'center', marginTop: 'auto', paddingTop: 12 },
});
