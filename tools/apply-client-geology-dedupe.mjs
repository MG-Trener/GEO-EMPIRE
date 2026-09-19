import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceOnce(content, oldValue, newValue, label) {
  if (!content.includes(oldValue)) {
    throw new Error(`${label}: pattern not found`);
  }
  return content.replace(oldValue, newValue);
}

// Central client-side defence: even if Railway is still serving an older API,
// the mobile app must never render dozens of deposits from the same geology zone.
const apiPath = 'apps/mobile/src/api.ts';
let api = read(apiPath);

if (!api.startsWith("import { cellToParent } from 'h3-js';")) {
  api = "import { cellToParent } from 'h3-js';\n" + api;
}

const anchor = `export function setActivePlayerId(playerId: string): void {\n  DEMO_PLAYER_ID = playerId;\n}\n`;
const helper = `export function setActivePlayerId(playerId: string): void {\n  DEMO_PLAYER_ID = playerId;\n}\n\nconst GEOLOGY_ZONE_RESOLUTION = 10;\n\nexport function compactGeologyDeposits<T extends { h3Index: string }>(\n  deposits: T[],\n  limit: number,\n): T[] {\n  const seenZones = new Set<string>();\n  const compacted: T[] = [];\n\n  for (const deposit of deposits) {\n    let zone = deposit.h3Index;\n    try {\n      zone = cellToParent(deposit.h3Index, GEOLOGY_ZONE_RESOLUTION);\n    } catch {\n      // Keep malformed/legacy H3 identifiers isolated instead of crashing the UI.\n    }\n\n    if (seenZones.has(zone)) continue;\n    seenZones.add(zone);\n    compacted.push(deposit);\n    if (compacted.length >= limit) break;\n  }\n\n  return compacted;\n}\n`;

if (!api.includes('export function compactGeologyDeposits')) {
  api = replaceOnce(api, anchor, helper, 'api helper insertion');
}

api = replaceOnce(
  api,
  'return { ...result, deposits: result.deposits.slice(0, 12) };',
  'return { ...result, deposits: compactGeologyDeposits(result.deposits, 6) };',
  'known deposits compaction',
);
api = replaceOnce(
  api,
  'return { ...result, deposits: result.deposits.slice(0, 8) };',
  'return { ...result, deposits: compactGeologyDeposits(result.deposits, 4) };',
  'scan deposits compaction',
);
write(apiPath, api);

const legacyPath = 'apps/mobile/src/MainSectionPanelLegacy.tsx';
let legacy = read(legacyPath);
legacy = replaceOnce(
  legacy,
  "import { DEMO_PLAYER_ID, getApiUrl, getGeologyUpgrades, upgradeGeology } from './api';",
  "import { compactGeologyDeposits, DEMO_PLAYER_ID, getApiUrl, getGeologyUpgrades, upgradeGeology } from './api';",
  'legacy api import',
);
legacy = replaceOnce(
  legacy,
  'const next = (body as DepositsResponse).deposits;',
  'const next = compactGeologyDeposits((body as DepositsResponse).deposits, 6);',
  'legacy deposit list compaction',
);
write(legacyPath, legacy);

const knownPath = 'apps/mobile/src/KnownDepositsPanel.tsx';
let known = read(knownPath);
known = replaceOnce(
  known,
  "import { DEMO_PLAYER_ID, getApiUrl } from './api';",
  "import { compactGeologyDeposits, DEMO_PLAYER_ID, getApiUrl } from './api';",
  'known panel api import',
);
known = replaceOnce(
  known,
  'return (body as Response).deposits;',
  'return compactGeologyDeposits((body as Response).deposits, 6);',
  'known panel compaction',
);
write(knownPath, known);

const appPath = 'apps/mobile/app.json';
let app = read(appPath);
app = replaceOnce(app, '"version": "0.2.15"', '"version": "0.2.16"', 'app version');
app = replaceOnce(app, '"versionCode": 19', '"versionCode": 20', 'android versionCode');
write(appPath, app);

console.log('Client geology zones deduped and mobile version bumped to 0.2.16.');
