BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS h3;

CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE,
  display_name varchar(64) NOT NULL,
  company_name varchar(96),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE player_geology_skills (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  range_level smallint NOT NULL DEFAULT 1 CHECK (range_level BETWEEN 1 AND 10),
  coverage_level smallint NOT NULL DEFAULT 1 CHECK (coverage_level BETWEEN 1 AND 10),
  depth_level smallint NOT NULL DEFAULT 1 CHECK (depth_level BETWEEN 1 AND 10),
  accuracy_level smallint NOT NULL DEFAULT 1 CHECK (accuracy_level BETWEEN 1 AND 10),
  sensitivity_level smallint NOT NULL DEFAULT 1 CHECK (sensitivity_level BETWEEN 1 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resources (
  id smallserial PRIMARY KEY,
  code varchar(32) NOT NULL UNIQUE,
  name_ru varchar(80) NOT NULL,
  category varchar(32) NOT NULL,
  rarity smallint NOT NULL DEFAULT 1 CHECK (rarity BETWEEN 1 AND 10),
  unit varchar(16) NOT NULL DEFAULT 'unit',
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE world_cells (
  h3_index h3index PRIMARY KEY,
  resolution smallint NOT NULL DEFAULT 12 CHECK (resolution BETWEEN 0 AND 15),
  center geography(Point, 4326),
  terrain_type varchar(32),
  region_code varchar(32),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX world_cells_center_gix ON world_cells USING gist (center);
CREATE INDEX world_cells_region_idx ON world_cells (region_code);

CREATE TABLE resource_deposits (
  id bigserial PRIMARY KEY,
  cell_h3 h3index NOT NULL REFERENCES world_cells(h3_index) ON DELETE CASCADE,
  resource_id smallint NOT NULL REFERENCES resources(id),
  depth_from_m numeric(10,2) NOT NULL CHECK (depth_from_m >= 0),
  depth_to_m numeric(10,2) NOT NULL CHECK (depth_to_m > depth_from_m),
  quantity_initial numeric(24,4) NOT NULL CHECK (quantity_initial > 0),
  quantity_remaining numeric(24,4) NOT NULL CHECK (quantity_remaining >= 0),
  density numeric(8,4) NOT NULL CHECK (density >= 0),
  quality numeric(8,4) NOT NULL CHECK (quality >= 0),
  generation_seed bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cell_h3, resource_id, depth_from_m, depth_to_m)
);

CREATE INDEX resource_deposits_cell_idx ON resource_deposits (cell_h3);
CREATE INDEX resource_deposits_resource_idx ON resource_deposits (resource_id);

CREATE TABLE geology_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  origin geography(Point, 4326) NOT NULL,
  radius_m integer NOT NULL CHECK (radius_m > 0),
  max_depth_m integer NOT NULL CHECK (max_depth_m > 0),
  accuracy_level smallint NOT NULL CHECK (accuracy_level BETWEEN 1 AND 10),
  sensitivity_level smallint NOT NULL CHECK (sensitivity_level BETWEEN 1 AND 10),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX geology_scans_origin_gix ON geology_scans USING gist (origin);
CREATE INDEX geology_scans_player_idx ON geology_scans (player_id, started_at DESC);

CREATE TABLE player_deposit_knowledge (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  deposit_id bigint NOT NULL REFERENCES resource_deposits(id) ON DELETE CASCADE,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  estimated_quantity_min numeric(24,4),
  estimated_quantity_max numeric(24,4),
  estimated_depth_from_m numeric(10,2),
  estimated_depth_to_m numeric(10,2),
  estimated_quality numeric(8,4),
  confidence numeric(5,4) CHECK (confidence BETWEEN 0 AND 1),
  PRIMARY KEY (player_id, deposit_id)
);

CREATE TABLE territory_claims (
  cell_h3 h3index PRIMARY KEY REFERENCES world_cells(h3_index) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL,
  CHECK (lease_until > claimed_at)
);

CREATE INDEX territory_claims_player_idx ON territory_claims (player_id, lease_until);

CREATE TABLE building_types (
  id smallserial PRIMARY KEY,
  code varchar(48) NOT NULL UNIQUE,
  name_ru varchar(96) NOT NULL,
  category varchar(32) NOT NULL,
  min_footprint_cells smallint NOT NULL DEFAULT 1 CHECK (min_footprint_cells > 0),
  build_time_seconds integer NOT NULL CHECK (build_time_seconds >= 0),
  base_cost bigint NOT NULL CHECK (base_cost >= 0),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  building_type_id smallint NOT NULL REFERENCES building_types(id),
  level smallint NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
  status varchar(24) NOT NULL DEFAULT 'constructing',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX buildings_owner_idx ON buildings (owner_player_id);
CREATE INDEX buildings_type_idx ON buildings (building_type_id);

CREATE TABLE building_cells (
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  cell_h3 h3index NOT NULL REFERENCES world_cells(h3_index) ON DELETE RESTRICT,
  PRIMARY KEY (building_id, cell_h3),
  UNIQUE (cell_h3)
);

CREATE TABLE wallets (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  soft_currency bigint NOT NULL DEFAULT 0 CHECK (soft_currency >= 0),
  premium_currency bigint NOT NULL DEFAULT 0 CHECK (premium_currency >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallet_transactions (
  id bigserial PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  soft_delta bigint NOT NULL DEFAULT 0,
  premium_delta bigint NOT NULL DEFAULT 0,
  reason varchar(64) NOT NULL,
  reference_type varchar(48),
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (soft_delta <> 0 OR premium_delta <> 0)
);

CREATE INDEX wallet_transactions_player_idx ON wallet_transactions (player_id, created_at DESC);

INSERT INTO resources (code, name_ru, category, rarity, unit) VALUES
  ('IRON_ORE', 'Железная руда', 'ore', 2, 't'),
  ('COPPER_ORE', 'Медная руда', 'ore', 4, 't'),
  ('GOLD_ORE', 'Золото', 'rare', 8, 'kg'),
  ('SILVER_ORE', 'Серебро', 'rare', 6, 'kg'),
  ('COAL', 'Уголь', 'fuel', 2, 't'),
  ('CRUDE_OIL', 'Нефть', 'fuel', 5, 'bbl'),
  ('NATURAL_GAS', 'Природный газ', 'fuel', 4, 'm3'),
  ('LIMESTONE', 'Известняк', 'construction', 1, 't'),
  ('SAND', 'Песок', 'construction', 1, 't'),
  ('CLAY', 'Глина', 'construction', 1, 't'),
  ('TIMBER', 'Древесина', 'forest', 2, 'm3'),
  ('WHEAT', 'Пшеница', 'agriculture', 2, 't'),
  ('URANIUM', 'Уран', 'rare', 9, 'kg'),
  ('LITHIUM', 'Литий', 'rare', 8, 't'),
  ('RARE_EARTHS', 'Редкоземельные металлы', 'rare', 10, 'kg');

INSERT INTO building_types (code, name_ru, category, min_footprint_cells, build_time_seconds, base_cost) VALUES
  ('MINE', 'Шахта', 'extraction', 1, 1800, 10000),
  ('OIL_WELL', 'Нефтяная вышка', 'extraction', 1, 2400, 14000),
  ('GAS_WELL', 'Газовая скважина', 'extraction', 1, 2400, 14000),
  ('SAWMILL', 'Лесопилка', 'processing', 2, 3600, 22000),
  ('WAREHOUSE', 'Склад', 'logistics', 2, 1800, 12000),
  ('POWER_PLANT', 'ТЭЦ', 'energy', 7, 14400, 120000),
  ('STEEL_MILL', 'Металлургический завод', 'industry', 7, 18000, 180000),
  ('RESEARCH_INSTITUTE', 'Научно-исследовательский институт', 'science', 4, 10800, 90000);

COMMIT;
