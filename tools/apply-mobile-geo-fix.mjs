import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceRequired(content, from, to, label) {
  if (!content.includes(from)) {
    throw new Error(`Expected pattern not found: ${label}`);
  }
  return content.replace(from, to);
}

const appPath = 'apps/mobile/AppFirstMiningLoop.tsx';
let app = read(appPath);
app = replaceRequired(
  app,
  "  const [cameraResetKey, setCameraResetKey] = useState(0);\n  const selectedCellRef = useRef<WorldCell | null>(null);",
  "  const cameraRef = useRef<any>(null);\n  const selectedCellRef = useRef<WorldCell | null>(null);",
  'camera state -> ref',
);
app = replaceRequired(
  app,
  "      const next = { lat: location.coords.latitude, lng: location.coords.longitude };\n      setPosition(next);",
  "      const next = { lat: location.coords.latitude, lng: location.coords.longitude };\n      setPosition(next);\n      // Move only the camera center. MapLibre easeTo keeps the zoom chosen by the player.\n      cameraRef.current?.easeTo({ center: [next.lng, next.lat], duration: LOCATION_UPDATE_TIME_MS });",
  'GPS camera follow',
);
app = replaceRequired(
  app,
  "        <Camera key={`camera-${cameraResetKey}`} center={[position.lng, position.lat]} zoom={MAP_ZOOM} />",
  "        <Camera\n          ref={cameraRef}\n          initialViewState={{ center: [ASTANA_DEMO.lng, ASTANA_DEMO.lat], zoom: MAP_ZOOM }}\n        />",
  'controlled camera',
);
app = replaceRequired(
  app,
  "              setCameraResetKey((value) => value + 1);",
  "              cameraRef.current?.easeTo({ center: [position.lng, position.lat], duration: 250 });",
  'recenter button',
);
write(appPath, app);

function useLargerGeologyZones(path) {
  let content = read(path);
  content = content.replaceAll('resolution-11', 'resolution-10');
  content = content.replace(/h3_cell_to_parent\(([^,\n]+), 11\)/g, 'h3_cell_to_parent($1, 10)');
  write(path, content);
}

const worldPath = 'apps/api/src/game/world-generation.ts';
useLargerGeologyZones(worldPath);
let world = read(worldPath);
world = world.replace(
  'roughly one deposit for seven neighbouring gameplay cells',
  'roughly one deposit for several dozen neighbouring gameplay cells',
);
write(worldPath, world);

const scanPath = 'apps/api/src/routes/geology-scan.ts';
useLargerGeologyZones(scanPath);
let scan = read(scanPath);
scan = replaceRequired(
  scan,
  "          visible AS (\n            SELECT * FROM ranked_visible WHERE geology_rank = 1\n          )",
  "          visible AS (\n            SELECT *\n            FROM ranked_visible\n            WHERE geology_rank = 1\n            ORDER BY depth_from_m ASC, density DESC, id\n            LIMIT 8\n          )",
  'scan discovery cap',
);
scan = replaceRequired(
  scan,
  "          WHERE geology_rank = 1\n          ORDER BY h3_index, rarity, resource_code",
  "          WHERE geology_rank = 1\n          ORDER BY h3_index, rarity, resource_code\n          LIMIT 8",
  'scan response cap',
);
write(scanPath, scan);

const previewPath = 'apps/api/src/routes/geology.ts';
useLargerGeologyZones(previewPath);
let preview = read(previewPath);
preview = replaceRequired(
  preview,
  "        WHERE geology_rank = 1\n        ORDER BY rarity, resource_code, depth_from_m",
  "        WHERE geology_rank = 1\n        ORDER BY rarity, resource_code, depth_from_m\n        LIMIT 8",
  'preview result cap',
);
write(previewPath, preview);

const knownPath = 'apps/api/src/routes/geology-known-deposits.ts';
useLargerGeologyZones(knownPath);
let known = read(knownPath);
known = replaceRequired(
  known,
  '        LIMIT 250',
  '        LIMIT 12',
  'known deposit presentation cap',
);
write(knownPath, known);

console.log('Applied map zoom preservation and geology-density fixes.');
