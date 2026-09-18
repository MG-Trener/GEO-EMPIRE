from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f'{label}: marker not found')
    return text.replace(old, new, 1)


def patch_inventory_api() -> None:
    path = Path('apps/api/src/routes/extraction.ts')
    text = path.read_text(encoding='utf-8')
    old = '''    const result = await db.query<{
      resource_id: number;
      resource_code: string;
      resource_name: string;
      unit: string;
      quantity: string;
      updated_at: string;
    }>(
      `
        SELECT
          i.resource_id,
          r.code AS resource_code,
          r.name_ru AS resource_name,
          r.unit,
          i.quantity::text,
          i.updated_at::text
        FROM player_inventory i
        JOIN resources r ON r.id = i.resource_id
        WHERE i.player_id = $1 AND i.quantity > 0
        ORDER BY r.category, r.rarity, r.code
      `,
      [params.data.playerId],
    );

    return result.rows.map((row) => ({
      resourceId: Number(row.resource_id),
      code: row.resource_code,
      name: row.resource_name,
      unit: row.unit,
      quantity: Number(row.quantity),
      updatedAt: row.updated_at,
    }));'''
    new = '''    const result = await db.query<{
      resource_id: number;
      resource_code: string;
      resource_name: string;
      unit: string;
      quantity: string;
      rate_per_hour: string;
      updated_at: string;
    }>(
      `
        WITH inventory AS (
          SELECT resource_id, quantity, updated_at
          FROM player_inventory
          WHERE player_id = $1
        ),
        production AS (
          SELECT d.resource_id, sum(o.rate_per_hour)::numeric AS rate_per_hour
          FROM extraction_operations o
          JOIN buildings b ON b.id = o.building_id
          JOIN resource_deposits d ON d.id = o.deposit_id
          WHERE b.owner_player_id = $1 AND o.status = 'running'
          GROUP BY d.resource_id
        )
        SELECT
          r.id AS resource_id,
          r.code AS resource_code,
          r.name_ru AS resource_name,
          r.unit,
          coalesce(i.quantity, 0)::text AS quantity,
          coalesce(p.rate_per_hour, 0)::text AS rate_per_hour,
          coalesce(i.updated_at, now())::text AS updated_at
        FROM resources r
        LEFT JOIN inventory i ON i.resource_id = r.id
        LEFT JOIN production p ON p.resource_id = r.id
        WHERE coalesce(i.quantity, 0) > 0 OR coalesce(p.rate_per_hour, 0) > 0
        ORDER BY r.category, r.rarity, r.code
      `,
      [params.data.playerId],
    );

    return result.rows.map((row) => ({
      resourceId: Number(row.resource_id),
      code: row.resource_code,
      name: row.resource_name,
      unit: row.unit,
      quantity: Number(row.quantity),
      ratePerHour: Number(row.rate_per_hour),
      updatedAt: row.updated_at,
    }));'''
    path.write_text(replace_once(text, old, new, 'inventory API'), encoding='utf-8')


def patch_index() -> None:
    path = Path('apps/mobile/index.js')
    text = path.read_text(encoding='utf-8')
    old = "const { OnboardingGate } = require('./src/OnboardingGate');\n\nif (restoreTextDecoder) {\n  globalThis.TextDecoder = originalTextDecoder;\n}\n\nregisterRootComponent(OnboardingGate);"
    new = "const React = require('react');\nconst { SafeAreaProvider } = require('react-native-safe-area-context');\nconst { OnboardingGate } = require('./src/OnboardingGate');\n\nif (restoreTextDecoder) {\n  globalThis.TextDecoder = originalTextDecoder;\n}\n\nfunction Root() {\n  return React.createElement(SafeAreaProvider, null, React.createElement(OnboardingGate));\n}\n\nregisterRootComponent(Root);"
    path.write_text(replace_once(text, old, new, 'mobile root'), encoding='utf-8')


def patch_onboarding() -> None:
    path = Path('apps/mobile/src/OnboardingGate.tsx')
    text = path.read_text(encoding='utf-8')
    text = text.replace('  SafeAreaView,\n', '')
    marker = "} from 'react-native';\nimport * as Application from 'expo-application';"
    text = replace_once(
        text,
        marker,
        "} from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context';\nimport * as Application from 'expo-application';",
        'onboarding safe-area import',
    )
    text = text.replace(
        '<StatusBar barStyle="light-content" translucent backgroundColor="transparent" />',
        '<StatusBar barStyle="light-content" translucent={false} backgroundColor="#071018" />',
    )
    text = text.replace('<SafeAreaView style={styles.safe}>', '<SafeAreaView style={styles.safe} edges={[\'top\', \'bottom\']}>')
    path.write_text(text, encoding='utf-8')


def patch_app() -> None:
    path = Path('apps/mobile/App.tsx')
    text = path.read_text(encoding='utf-8')

    text = text.replace('  SafeAreaView,\n', '')
    text = replace_once(
        text,
        "} from 'react-native';\nimport * as Location from 'expo-location';",
        "} from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context';\nimport * as Location from 'expo-location';",
        'App safe-area import',
    )
    text = text.replace('  getApiUrl,\n', '')
    marker = "import { gameAssets, resourceIconForCode } from './src/gameAssets';\n"
    text = replace_once(
        text,
        marker,
        marker + "import { GameSettingsPanel } from './src/GameSettingsPanel';\nimport { useGameSettings } from './src/gameSettings';\nimport { useGameSounds } from './src/useGameSounds';\n",
        'App game imports',
    )
    text = text.replace('const MAP_ZOOM = 18.15;', 'const MAP_ZOOM = 17.85;')
    text = text.replace("  const [showResourceOverlay, setShowResourceOverlay] = useState(true);\n", '')
    text = replace_once(
        text,
        "  const [message, setMessage] = useState('Подготовка карты…');\n",
        "  const [message, setMessage] = useState('');\n  const [settingsOpen, setSettingsOpen] = useState(false);\n  const { settings, updateSetting, resetSettings } = useGameSettings();\n  const { click: playClick, scan: playScan, success: playSuccess, error: playError, build: playBuild, cash: playCash } = useGameSounds(settings.soundEnabled, settings.soundVolume);\n",
        'App state',
    )

    text = text.replace("      setMessage(`H3 r12 · ${response.cells.length} локальных ячеек`);", "      setMessage('');")
    text = text.replace("      setMessage(`API недоступен: ${error instanceof Error ? error.message : 'ошибка'}`);", "      setMessage('Нет связи с игровым сервером');")
    text = text.replace("        setMessage('Геолокация недоступна · используется тестовый сектор Астаны');", "        setMessage('Геолокация недоступна — показан тестовый сектор');")
    text = replace_once(
        text,
        "    () => showResourceOverlay ? scanDepositsToGeoJson(scan) : ({ type: 'FeatureCollection', features: [] } as FeatureCollection<Polygon>),\n    [scan, showResourceOverlay],",
        "    () => settings.showResourceOverlay ? scanDepositsToGeoJson(scan) : ({ type: 'FeatureCollection', features: [] } as FeatureCollection<Polygon>),\n    [scan, settings.showResourceOverlay],",
        'resource overlay memo',
    )

    text = replace_once(text, "    setScan(null);\n    try {", "    setScan(null);\n    playScan();\n    try {", 'scan start')
    text = replace_once(
        text,
        "      setShowResourceOverlay(true);\n      setSheetExpanded(true);",
        "      updateSetting('showResourceOverlay', true);\n      playSuccess();\n      setSheetExpanded(true);",
        'scan success',
    )
    text = replace_once(
        text,
        "    } catch (error) {\n      setMessage(`Разведка: ${error instanceof Error ? error.message : 'ошибка'}`);\n    } finally {",
        "    } catch (error) {\n      playError();\n      const reason = error instanceof Error ? error.message : 'ошибка';\n      setMessage(reason === 'target_out_of_range' ? 'Выбранный участок вне дальности георазведки' : 'Не удалось провести георазведку');\n    } finally {",
        'scan error',
    )
    text = replace_once(
        text,
        "  }, [position, selectedCell]);\n\n  const claimSelected",
        "  }, [playError, playScan, playSuccess, position, selectedCell, updateSetting]);\n\n  const claimSelected",
        'scan dependencies',
    )

    text = replace_once(text, "    setAction('claim');\n    try {", "    setAction('claim');\n    playClick();\n    try {", 'claim sound start')
    text = replace_once(text, "      setMessage(result.status === 'already_owned'", "      playSuccess();\n      setMessage(result.status === 'already_owned'", 'claim success sound')
    text = replace_once(text, "    } catch (error) {\n      setMessage(`Аренда участка:", "    } catch (error) {\n      playError();\n      setMessage(`Аренда участка:", 'claim error sound')
    text = replace_once(
        text,
        "  }, [position, refreshWorld, selectedCell]);\n\n  const buildMine",
        "  }, [playClick, playError, playSuccess, position, refreshWorld, selectedCell]);\n\n  const buildMine",
        'claim dependencies',
    )

    text = replace_once(text, "    setAction('build');\n    try {", "    setAction('build');\n    playClick();\n    try {", 'build sound start')
    text = replace_once(text, "      setMessage(`Строительство «${result.building.name}»", "      playBuild();\n      setMessage(`Строительство «${result.building.name}»", 'build success sound')
    text = replace_once(text, "    } catch (error) {\n      setMessage(`Строительство:", "    } catch (error) {\n      playError();\n      setMessage(`Строительство:", 'build error sound')
    text = replace_once(
        text,
        "  }, [position, refreshWorld, selectedCell]);\n\n  const beginExtraction",
        "  }, [playBuild, playClick, playError, position, refreshWorld, selectedCell]);\n\n  const beginExtraction",
        'build dependencies',
    )

    text = replace_once(text, "      setExtraction(await getExtractionStatus(buildingId));\n      setMessage(\n        `Добыча", "      setExtraction(await getExtractionStatus(buildingId));\n      playSuccess();\n      setMessage(\n        `Добыча", 'extraction success sound')
    text = replace_once(text, "    } catch (error) {\n      setMessage(`Запуск добычи:", "    } catch (error) {\n      playError();\n      setMessage(`Запуск добычи:", 'extraction error sound')
    text = replace_once(
        text,
        "  }, [position, refreshWorld, selectedCell]);\n\n  const collectResources",
        "  }, [playError, playSuccess, position, refreshWorld, selectedCell]);\n\n  const collectResources",
        'extraction dependencies',
    )

    text = replace_once(text, "      setExtraction(await getExtractionStatus(buildingId));\n      await refreshInventory();", "      setExtraction(await getExtractionStatus(buildingId));\n      playCash();\n      await refreshInventory();", 'collection sound')
    text = replace_once(text, "    } catch (error) {\n      const reason = error instanceof Error ? error.message : 'ошибка';", "    } catch (error) {\n      playError();\n      const reason = error instanceof Error ? error.message : 'ошибка';", 'collection error sound')
    text = replace_once(text, "  }, [refreshInventory, selectedCell]);", "  }, [playCash, playError, refreshInventory, selectedCell]);", 'collection dependencies')

    text = text.replace(
        '<StatusBar barStyle="light-content" translucent backgroundColor="transparent" />',
        '<StatusBar barStyle="light-content" translucent={false} backgroundColor="#071018" />',
        1,
    )
    text = replace_once(
        text,
        "              'fill-opacity': ['case', ['==', ['get', 'selected'], 1], 0.46, 0.22],",
        "              'fill-opacity': settings.showCellGrid ? ['case', ['==', ['get', 'selected'], 1], 0.44, 0.16] : 0,",
        'cell fill visibility',
    )
    text = replace_once(
        text,
        "              'line-color': ['case', ['==', ['get', 'selected'], 1], '#ffd76a', '#48e2c0'],\n              'line-width': ['case', ['==', ['get', 'selected'], 1], 3.2, 1.1],\n              'line-opacity': 0.92,",
        "              'line-color': [\n                'case',\n                ['==', ['get', 'selected'], 1], '#ffd253',\n                ['==', ['get', 'current'], 1], '#ffc13d',\n                ['==', ['get', 'occupied'], 1], '#ed5959',\n                '#00a995',\n              ],\n              'line-width': settings.showCellGrid ? ['case', ['==', ['get', 'selected'], 1], 3.6, 1.9] : 0,\n              'line-opacity': settings.showCellGrid ? 1 : 0,",
        'cell outline visibility',
    )

    old_top = '''      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topHud}>
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>GEO EMPIRE</Text>
            <Text style={styles.status} numberOfLines={1}>{message}</Text>
          </View>
          {loadingWorld ? <ActivityIndicator size="small" color="#38d8ff" /> : null}
        </View>

        <ResourceStrip inventory={inventory} />

        <View style={styles.legend}>
          <Legend dotStyle={styles.freeDot} label="Свободно" />
          <Legend dotStyle={styles.busyDot} label="Занято" />
          <Legend dotStyle={styles.currentDot} label="Вы здесь" />
        </View>

        <View style={styles.mapTools}>
          <MapToolButton
            source={gameAssets.utility.center}
            accessibilityLabel="Моё местоположение"
            onPress={() => void refreshWorld(position, selectedCell?.h3Index)}
          />
          <MapToolButton
            source={gameAssets.utility.layers}
            accessibilityLabel="Слои карты"
            onPress={() => setMessage('Слои карты: спутник, рельеф, ресурсы и инфраструктура')}
          />
          <MapToolButton
            source={gameAssets.utility.filter}
            accessibilityLabel="Фильтры ресурсов"
            active={showResourceOverlay}
            onPress={() => setShowResourceOverlay((current) => {
              const next = !current;
              setMessage(next ? 'Слой найденных ресурсов включён' : 'Слой найденных ресурсов скрыт');
              return next;
            })}
          />
          <MapToolButton
            source={gameAssets.utility.fullscreen}
            accessibilityLabel="Полный экран"
            onPress={() => setMessage('Карта уже работает в полноэкранном игровом режиме')}
          />
        </View>'''
    new_top = '''      <SafeAreaView pointerEvents="box-none" style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.resourceBar}>
          <ResourceStrip inventory={inventory} />
          {loadingWorld ? <ActivityIndicator size="small" color="#38d8ff" style={styles.resourceLoading} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Настройки игры"
            onPress={() => { playClick(); setSettingsOpen(true); }}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
          >
            <Image source={gameAssets.nav.settings} style={styles.settingsButtonImage} resizeMode="contain" />
          </Pressable>
        </View>

        {message ? (
          <Pressable onPress={() => setMessage('')} style={({ pressed }) => [styles.statusToast, pressed && styles.pressed]}>
            <Text style={styles.statusToastText} numberOfLines={2}>{message}</Text>
          </Pressable>
        ) : null}

        <View style={styles.mapTools}>
          <MapToolButton
            source={gameAssets.utility.center}
            accessibilityLabel="Моё местоположение"
            onPress={() => { playClick(); void refreshWorld(position, selectedCell?.h3Index); }}
          />
          <MapToolButton
            source={gameAssets.utility.layers}
            accessibilityLabel="Сетка участков"
            active={settings.showCellGrid}
            onPress={() => { playClick(); updateSetting('showCellGrid', !settings.showCellGrid); }}
          />
          <MapToolButton
            source={gameAssets.utility.filter}
            accessibilityLabel="Найденные ресурсы"
            active={settings.showResourceOverlay}
            onPress={() => { playClick(); updateSetting('showResourceOverlay', !settings.showResourceOverlay); }}
          />
        </View>'''
    text = replace_once(text, old_top, new_top, 'top HUD')

    old_nav = '''          onMap={() => {
            setActiveMainSection('map');
            setShowGeology(false);
            setSheetExpanded(false);
          }}
          onExploration={() => openHubSection('exploration', 'deposits', 'Разведка: известные месторождения и углублённые исследования')}
          onDevelopment={() => openHubSection('development', 'deposits', 'Разработка: выберите месторождение и инвестиционный проект')}
          onTrade={() => openHubSection('trade', 'market', 'Торговля: товарная биржа ресурсов')}
          onTechnology={() => openHubSection('technology', 'geology', 'Технологии: развитие геологической службы')}'''
    new_nav = '''          onMap={() => {
            playClick();
            setActiveMainSection('map');
            setShowGeology(false);
            setSheetExpanded(false);
            setMessage('');
          }}
          onExploration={() => { playClick(); openHubSection('exploration', 'deposits'); }}
          onDevelopment={() => { playClick(); openHubSection('development', 'deposits'); }}
          onTrade={() => { playClick(); openHubSection('trade', 'market'); }}
          onTechnology={() => { playClick(); openHubSection('technology', 'geology'); }}'''
    text = replace_once(text, old_nav, new_nav, 'bottom navigation')

    technical_footer = '''
            <Text style={styles.devText}>
              {usingDemoPosition ? 'DEV: тестовая позиция Астана' : 'GPS: реальное положение'} · API {getApiUrl()}
            </Text>'''
    text = replace_once(text, technical_footer, '', 'technical footer')

    text = replace_once(
        text,
        '''      </SafeAreaView>
    </View>
  );
}''',
        '''      </SafeAreaView>
      <GameSettingsPanel
        visible={settingsOpen}
        settings={settings}
        onChange={updateSetting}
        onReset={resetSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </View>
  );
}''',
        'settings modal',
    )

    start = text.index('function ResourceStrip(')
    end = text.index('\nfunction MapToolButton(', start)
    resource_component = '''function ResourceStrip({ inventory }: { inventory: InventoryItem[] }) {
  const placeholders: InventoryItem[] = [
    { resourceId: -1, code: 'OIL', name: 'Нефть', unit: 'т', quantity: 0, ratePerHour: 0, updatedAt: '' },
    { resourceId: -2, code: 'GAS', name: 'Газ', unit: 'м³', quantity: 0, ratePerHour: 0, updatedAt: '' },
    { resourceId: -3, code: 'GOLD', name: 'Золото', unit: 'кг', quantity: 0, ratePerHour: 0, updatedAt: '' },
  ];
  const items = inventory.length ? inventory.slice(0, 6) : placeholders;

  return (
    <ScrollView horizontal style={styles.resourceStripScroll} contentContainerStyle={styles.resourceStrip} showsHorizontalScrollIndicator={false}>
      {items.map((item) => (
        <View key={`${item.resourceId}-${item.code}`} style={styles.resourceChip}>
          <Image source={resourceIconForCode(item.code || item.name)} style={styles.resourceChipIcon} resizeMode="contain" />
          <View style={styles.resourceChipText}>
            <Text style={styles.resourceChipName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.resourceChipValue} numberOfLines={1}>{formatNumber(item.quantity, 1)} {item.unit}</Text>
            <Text style={[styles.resourceChipRate, item.ratePerHour > 0 && styles.resourceChipRateActive]} numberOfLines={1}>
              +{formatNumber(item.ratePerHour, 2)} {item.unit}/ч
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
'''
    text = text[:start] + resource_component + text[end:]

    replacements = {
        "  overlay: { ...absolute, paddingHorizontal: 10, paddingTop: 4 },": "  overlay: { ...absolute, paddingHorizontal: 8, paddingTop: 3 },",
        "  mapTools: {\n    position: 'absolute',\n    right: 9,\n    top: 142,\n    gap: 7,\n  },": "  mapTools: {\n    position: 'absolute',\n    right: 8,\n    top: 62,\n    gap: 5,\n  },",
        "    width: 50,\n    height: 50,\n    borderRadius: 14,": "    width: 40,\n    height: 40,\n    borderRadius: 11,",
        "    gap: 5,\n    marginBottom: 6,\n    paddingHorizontal: 6,": "    gap: 3,\n    marginBottom: 4,\n    paddingHorizontal: 4,",
        "    maxWidth: 72,\n    height: 58,\n    borderRadius: 14,": "    maxWidth: 62,\n    height: 50,\n    borderRadius: 12,",
        "    maxHeight: '31%',\n    minHeight: 162,": "    maxHeight: '24%',\n    minHeight: 128,",
        "  bottomCardExpanded: { maxHeight: '64%' },": "  bottomCardExpanded: { maxHeight: '52%' },",
        "  sheetHandleArea: { alignItems: 'center', paddingTop: 6, paddingBottom: 3 },": "  sheetHandleArea: { alignItems: 'center', paddingTop: 4, paddingBottom: 2 },",
        "  scrollContent: { paddingHorizontal: 13, paddingTop: 4, paddingBottom: 14 },": "  scrollContent: { paddingHorizontal: 11, paddingTop: 3, paddingBottom: 10 },",
    }
    for old, new in replacements.items():
        text = replace_once(text, old, new, f'style {old[:25]}')

    style_start = text.index('  topHud: {')
    style_end = text.index('  legend: {', style_start)
    top_styles = '''  resourceBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  resourceStripScroll: { flex: 1, minWidth: 0 },
  resourceStrip: { gap: 4, paddingRight: 2 },
  resourceChip: {
    width: 108,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: 'rgba(5,16,25,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(73,170,210,0.22)',
  },
  resourceChipIcon: { width: 31, height: 31 },
  resourceChipText: { flex: 1, minWidth: 0 },
  resourceChipName: { color: '#7f9aab', fontSize: 6.5, fontWeight: '800' },
  resourceChipValue: { color: '#eef8ff', fontSize: 9, fontWeight: '900', marginTop: 1 },
  resourceChipRate: { color: '#647b87', fontSize: 6.5, fontWeight: '800', marginTop: 1 },
  resourceChipRateActive: { color: '#49e0b6' },
  resourceLoading: { marginHorizontal: 2 },
  settingsButton: {
    width: 43,
    height: 43,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(5,16,25,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(73,170,210,0.22)',
  },
  settingsButtonImage: { width: '100%', height: '100%' },
  statusToast: {
    alignSelf: 'flex-start',
    maxWidth: '82%',
    marginTop: 3,
    minHeight: 25,
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: 'rgba(5,16,25,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(56,216,255,0.18)',
  },
  statusToastText: { color: '#b8cbd3', fontSize: 8.5, lineHeight: 11 },
'''
    text = text[:style_start] + top_styles + text[style_end:]
    path.write_text(text, encoding='utf-8')


def generate_sounds() -> None:
    out = Path('apps/mobile/assets/sounds')
    out.mkdir(parents=True, exist_ok=True)
    sample_rate = 22050
    random.seed(42)

    def render(name: str, duration: float, tones: list[tuple[float, float, float]], noise: float = 0.0, pulse: tuple[float, float] | None = None) -> None:
        frames: list[bytes] = []
        total = int(sample_rate * duration)
        for i in range(total):
            t = i / sample_rate
            attack = min(1.0, t / 0.012)
            release = min(1.0, max(0.0, (duration - t) / 0.09))
            env = attack * release
            signal = 0.0
            for freq, amp, decay in tones:
                signal += math.sin(2 * math.pi * freq * t) * amp * math.exp(-decay * t)
            if pulse:
                freq, amp = pulse
                signal += (1.0 if math.sin(2 * math.pi * freq * t) >= 0 else -1.0) * amp * env
            signal += (random.random() * 2 - 1) * noise * math.exp(-5 * t)
            value = int(max(-1, min(1, signal * env)) * 32767)
            frames.append(struct.pack('<h', value))
        with wave.open(str(out / name), 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(b''.join(frames))

    render('ui-click.wav', 0.10, [(920, .22, 18), (460, .12, 22)], noise=.025)
    render('scan.wav', 0.42, [(310, .18, 2.8), (620, .16, 3.4), (1240, .10, 4.2)], noise=.035, pulse=(14, .04))
    render('success.wav', 0.38, [(523, .16, 2.5), (659, .18, 2.4), (784, .20, 2.1)], noise=.01)
    render('error.wav', 0.34, [(180, .26, 3.2), (112, .18, 2.6)], noise=.05, pulse=(7, .05))
    render('build.wav', 0.46, [(140, .24, 4.8), (280, .13, 5.2), (760, .08, 7.0)], noise=.08, pulse=(18, .035))
    render('cash.wav', 0.40, [(880, .13, 3.0), (1175, .15, 3.0), (1568, .12, 3.4)], noise=.018)


if __name__ == '__main__':
    patch_inventory_api()
    patch_index()
    patch_onboarding()
    patch_app()
    generate_sounds()
    print('Mobile refinement patch applied successfully.')
