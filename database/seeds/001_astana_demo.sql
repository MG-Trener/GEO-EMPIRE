BEGIN;

-- Development-only demo player.
INSERT INTO players (id, auth_subject, display_name, company_name)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'dev:astana-geologist',
  'Demo Geologist',
  'Astana Geo Industries'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO player_geology_skills (
  player_id,
  range_level,
  coverage_level,
  depth_level,
  accuracy_level,
  sensitivity_level
)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  5, 5, 5, 5, 5
)
ON CONFLICT (player_id) DO UPDATE SET
  range_level = EXCLUDED.range_level,
  coverage_level = EXCLUDED.coverage_level,
  depth_level = EXCLUDED.depth_level,
  accuracy_level = EXCLUDED.accuracy_level,
  sensitivity_level = EXCLUDED.sensitivity_level,
  updated_at = now();

INSERT INTO wallets (player_id, soft_currency, premium_currency)
VALUES ('11111111-1111-4111-8111-111111111111', 250000, 1000)
ON CONFLICT (player_id) DO NOTHING;

-- 19 resolution-12 cells around central Astana (H3 disk radius 2).
WITH origin AS (
  SELECT h3_lat_lng_to_cell(point(51.1694, 71.4491), 12) AS h3
),
cells AS (
  SELECT grid.index AS cell
  FROM origin
  CROSS JOIN LATERAL h3_grid_disk_distances(origin.h3, 2) AS grid
)
INSERT INTO world_cells (h3_index, resolution, center, terrain_type, region_code)
SELECT
  cell,
  12,
  ST_SetSRID(
    ST_MakePoint(
      (h3_cell_to_lat_lng(cell))[1],
      (h3_cell_to_lat_lng(cell))[0]
    ),
    4326
  )::geography,
  'urban',
  'KZ-AST-DEMO'
FROM cells
ON CONFLICT (h3_index) DO NOTHING;

-- Deterministic sample deposits. Some are deliberately too deep or too rare
-- for the level-5 demo geologist to detect.
WITH origin AS (
  SELECT h3_lat_lng_to_cell(point(51.1694, 71.4491), 12) AS h3
),
cells AS (
  SELECT
    grid.index AS cell,
    row_number() OVER (ORDER BY grid.distance, grid.index::text) AS ord
  FROM origin
  CROSS JOIN LATERAL h3_grid_disk_distances(origin.h3, 2) AS grid
),
spec(ord, resource_code, depth_from_m, depth_to_m, quantity, density, quality, seed) AS (
  VALUES
    (1, 'IRON_ORE',      20.0,  120.0, 1500000.0, 0.65, 62.0, 1001),
    (1, 'GOLD_ORE',     520.0,  780.0,   12000.0, 0.04, 78.0, 1002),
    (2, 'COAL',          10.0,   85.0,  900000.0, 0.74, 71.0, 1003),
    (3, 'COPPER_ORE',    65.0,  240.0,  350000.0, 0.31, 57.0, 1004),
    (4, 'CRUDE_OIL',    410.0,  900.0,  520000.0, 0.48, 69.0, 1005),
    (5, 'NATURAL_GAS',  150.0,  390.0, 4200000.0, 0.52, 74.0, 1006),
    (6, 'LIMESTONE',      2.0,   58.0, 2400000.0, 0.88, 82.0, 1007),
    (7, 'URANIUM',      710.0, 1180.0,    6800.0, 0.03, 91.0, 1008),
    (8, 'SILVER_ORE',   180.0,  330.0,   29000.0, 0.09, 66.0, 1009),
    (9, 'CLAY',           0.0,   25.0, 1800000.0, 0.91, 73.0, 1010)
)
INSERT INTO resource_deposits (
  cell_h3,
  resource_id,
  depth_from_m,
  depth_to_m,
  quantity_initial,
  quantity_remaining,
  density,
  quality,
  generation_seed
)
SELECT
  cells.cell,
  resources.id,
  spec.depth_from_m,
  spec.depth_to_m,
  spec.quantity,
  spec.quantity,
  spec.density,
  spec.quality,
  spec.seed
FROM spec
JOIN cells ON cells.ord = spec.ord
JOIN resources ON resources.code = spec.resource_code
ON CONFLICT (cell_h3, resource_id, depth_from_m, depth_to_m) DO NOTHING;

-- Claim the center cell and place a demo mine on it.
WITH center_cell AS (
  SELECT h3_lat_lng_to_cell(point(51.1694, 71.4491), 12) AS h3
)
INSERT INTO territory_claims (cell_h3, player_id, lease_until)
SELECT
  h3,
  '11111111-1111-4111-8111-111111111111',
  now() + interval '365 days'
FROM center_cell
ON CONFLICT (cell_h3) DO UPDATE SET
  player_id = EXCLUDED.player_id,
  claimed_at = now(),
  lease_until = EXCLUDED.lease_until;

INSERT INTO buildings (
  id,
  owner_player_id,
  building_type_id,
  level,
  status,
  started_at,
  completed_at
)
SELECT
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  id,
  1,
  'active',
  now() - interval '1 day',
  now()
FROM building_types
WHERE code = 'MINE'
ON CONFLICT (id) DO NOTHING;

WITH center_cell AS (
  SELECT h3_lat_lng_to_cell(point(51.1694, 71.4491), 12) AS h3
)
INSERT INTO building_cells (building_id, cell_h3)
SELECT
  '22222222-2222-4222-8222-222222222222',
  h3
FROM center_cell
ON CONFLICT (cell_h3) DO NOTHING;

COMMIT;
