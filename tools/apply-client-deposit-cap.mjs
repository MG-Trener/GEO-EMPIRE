import fs from 'node:fs';

const path = 'apps/mobile/src/api.ts';
let content = fs.readFileSync(path, 'utf8');

const knownOld = `export async function getKnownDeposits(playerId = DEMO_PLAYER_ID): Promise<KnownDepositsResponse> {\n  return requestJson<KnownDepositsResponse>(\n    \`${'${API_URL}'}/api/v1/geology/${'${encodeURIComponent(playerId)}'}/deposits\`,\n  );\n}`;
const knownNew = `export async function getKnownDeposits(playerId = DEMO_PLAYER_ID): Promise<KnownDepositsResponse> {\n  const result = await requestJson<KnownDepositsResponse>(\n    \`${'${API_URL}'}/api/v1/geology/${'${encodeURIComponent(playerId)}'}/deposits\`,\n  );\n  return { ...result, deposits: result.deposits.slice(0, 12) };\n}`;

const scanOld = `export async function runGeologyScan(input: {\n  playerId: string;\n  playerLat: number;\n  playerLng: number;\n  targetLat: number;\n  targetLng: number;\n}): Promise<GeologyScanResponse> {\n  return requestJson<GeologyScanResponse>(\`${'${API_URL}'}/api/v1/geology/scan\`, {\n    method: 'POST',\n    headers: { 'content-type': 'application/json' },\n    body: JSON.stringify(input),\n  });\n}`;
const scanNew = `export async function runGeologyScan(input: {\n  playerId: string;\n  playerLat: number;\n  playerLng: number;\n  targetLat: number;\n  targetLng: number;\n}): Promise<GeologyScanResponse> {\n  const result = await requestJson<GeologyScanResponse>(\`${'${API_URL}'}/api/v1/geology/scan\`, {\n    method: 'POST',\n    headers: { 'content-type': 'application/json' },\n    body: JSON.stringify(input),\n  });\n  return { ...result, deposits: result.deposits.slice(0, 8) };\n}`;

if (!content.includes(knownOld)) throw new Error('getKnownDeposits pattern not found');
if (!content.includes(scanOld)) throw new Error('runGeologyScan pattern not found');
content = content.replace(knownOld, knownNew).replace(scanOld, scanNew);
fs.writeFileSync(path, content);
console.log('Client geology result caps applied.');
