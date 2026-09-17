import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { bootstrapPlayer, getApiUrl, setActivePlayerId } from './api';
import { FirstMissionGuide } from './FirstMissionGuide';
import type { PlayerSummary } from './types';

type Stage = 'loading' | 'create' | 'created' | 'ready';

async function getInstallationSubject(): Promise<string> {
  if (Platform.OS === 'android') {
    try {
      const androidId = Application.getAndroidId();
      if (androidId) return `android:${androidId}`;
    } catch {
      // Fall through to installation identity.
    }
  }

  if (Platform.OS === 'ios') {
    try {
      const vendorId = await Application.getIosIdForVendorAsync();
      if (vendorId) return `ios:${vendorId}`;
    } catch {
      // Fall through to installation identity.
    }
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
          if (message === 'player_not_found') {
            setStage('create');
          } else {
            setError(`Сервер недоступен: ${message}`);
            setStage('create');
          }
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
      const result = await bootstrapPlayer({
        authSubject,
        displayName: cleanName,
        companyName: cleanCompany,
      });
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
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#071018" />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.hero}>
            <Text style={styles.kicker}>СТРАТЕГИЯ · ГЕОЛОКАЦИЯ · РЕСУРСЫ</Text>
            <Text style={styles.logo}>GEO{`\n`}EMPIRE</Text>
            <View style={styles.line} />
            <Text style={styles.subtitle}>
              Исследуйте реальную территорию, находите месторождения и стройте промышленную империю.
            </Text>
          </View>

          {stage === 'loading' ? (
            <View style={styles.card}>
              <ActivityIndicator size="large" />
              <Text style={styles.cardTitle}>Подключение к миру</Text>
              <Text style={styles.muted}>Проверяем компанию и синхронизируем игровое состояние…</Text>
            </View>
          ) : stage === 'created' && player ? (
            <View style={styles.card}>
              <Text style={styles.eyebrow}>КОМПАНИЯ ЗАРЕГИСТРИРОВАНА</Text>
              <Text style={styles.cardTitle}>{player.companyName}</Text>
              <Text style={styles.muted}>Руководитель: {player.displayName}</Text>

              <View style={styles.rewardBox}>
                <Text style={styles.rewardLabel}>СТАРТОВЫЙ КАПИТАЛ</Text>
                <Text style={styles.rewardSoft}>{(starterGrant?.soft ?? player.wallet.soft).toLocaleString('ru-RU')} ₡</Text>
                <Text style={styles.rewardPremium}>+{(starterGrant?.premium ?? 0).toLocaleString('ru-RU')} ◆ премиум</Text>
              </View>

              <Text style={styles.instructions}>
                Первый этап: найдите себя на карте, выберите ближайшую свободную ячейку, проведите разведку и оформите первый участок.
              </Text>

              <PrimaryButton label="НАЧАТЬ РАЗВЕДКУ" onPress={() => setStage('ready')} />
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.eyebrow}>НОВАЯ ИМПЕРИЯ</Text>
              <Text style={styles.cardTitle}>Создайте компанию</Text>
              <Text style={styles.muted}>Название будет отображаться владельцем занятых территорий.</Text>

              <Text style={styles.label}>РУКОВОДИТЕЛЬ</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Например: Михаил"
                placeholderTextColor="#60717e"
                maxLength={64}
                autoCapitalize="words"
                style={styles.input}
              />

              <Text style={styles.label}>НАЗВАНИЕ КОМПАНИИ</Text>
              <TextInput
                value={companyName}
                onChangeText={setCompanyName}
                placeholder="Например: Steppe Minerals"
                placeholderTextColor="#60717e"
                maxLength={96}
                autoCapitalize="words"
                style={styles.input}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PrimaryButton
                label={busy ? 'СОЗДАНИЕ…' : 'ОСНОВАТЬ КОМПАНИЮ'}
                onPress={() => void createCompany()}
                disabled={busy}
              />

              <Text style={styles.server}>API: {getApiUrl()}</Text>
            </View>
          )}

          <Text style={styles.footer}>GEO EMPIRE · prototype 0.1</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.buttonDisabled, pressed && styles.buttonPressed]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gameRoot: { flex: 1 },
  root: { flex: 1, backgroundColor: '#071018' },
  safe: { flex: 1 },
  flex: { flex: 1, paddingHorizontal: 22, paddingBottom: 18 },
  hero: { paddingTop: 38, paddingBottom: 24 },
  kicker: { color: '#6fa897', fontSize: 10, fontWeight: '800', letterSpacing: 2.1 },
  logo: { color: '#f1c15b', fontSize: 46, lineHeight: 42, fontWeight: '900', letterSpacing: 2.4, marginTop: 12 },
  line: { width: 64, height: 3, backgroundColor: '#d99b32', marginTop: 18, marginBottom: 14 },
  subtitle: { color: '#aab9c2', fontSize: 14, lineHeight: 21, maxWidth: 350 },
  card: {
    backgroundColor: '#0d1922',
    borderWidth: 1,
    borderColor: '#1f3440',
    borderRadius: 18,
    padding: 20,
    gap: 11,
  },
  eyebrow: { color: '#69a995', fontSize: 10, fontWeight: '800', letterSpacing: 1.7 },
  cardTitle: { color: '#edf3f4', fontSize: 24, fontWeight: '800' },
  muted: { color: '#8396a1', fontSize: 13, lineHeight: 19 },
  label: { color: '#b9c7cd', fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginTop: 5 },
  input: {
    backgroundColor: '#08131b',
    borderWidth: 1,
    borderColor: '#29414d',
    borderRadius: 12,
    color: '#edf3f4',
    minHeight: 50,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  rewardBox: {
    backgroundColor: '#101f25',
    borderWidth: 1,
    borderColor: '#38513f',
    borderRadius: 14,
    padding: 15,
    marginTop: 4,
  },
  rewardLabel: { color: '#81a990', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  rewardSoft: { color: '#f1c15b', fontSize: 28, fontWeight: '900', marginTop: 4 },
  rewardPremium: { color: '#8bd4ce', fontSize: 12, fontWeight: '700', marginTop: 3 },
  instructions: { color: '#aab9c2', fontSize: 13, lineHeight: 19 },
  error: { color: '#e58d78', fontSize: 12, lineHeight: 17 },
  button: {
    backgroundColor: '#d69b37',
    borderRadius: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },
  buttonText: { color: '#101317', fontSize: 12, fontWeight: '900', letterSpacing: 1.25 },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.82 },
  server: { color: '#50636e', fontSize: 9, textAlign: 'center', marginTop: 2 },
  footer: { color: '#42535c', fontSize: 9, letterSpacing: 1.2, textAlign: 'center', marginTop: 'auto', paddingTop: 16 },
});
