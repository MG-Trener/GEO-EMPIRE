BEGIN;

CREATE TABLE development_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  deposit_id bigint NOT NULL REFERENCES resource_deposits(id) ON DELETE CASCADE,
  method varchar(32) NOT NULL CHECK (method IN ('open_pit', 'underground_mine', 'oil_well', 'gas_well')),
  building_code varchar(48) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'approved', 'constructing', 'operating', 'cancelled')),
  capex bigint NOT NULL CHECK (capex >= 0),
  opex_per_unit numeric(24,6) NOT NULL CHECK (opex_per_unit >= 0),
  market_price_per_unit numeric(24,6) NOT NULL CHECK (market_price_per_unit > 0),
  recovery_rate numeric(8,6) NOT NULL CHECK (recovery_rate > 0 AND recovery_rate <= 1),
  planned_daily_output numeric(24,6) NOT NULL CHECK (planned_daily_output >= 0),
  expected_daily_revenue bigint NOT NULL CHECK (expected_daily_revenue >= 0),
  expected_daily_margin bigint NOT NULL CHECK (expected_daily_margin >= 0),
  payback_days numeric(12,2),
  mine_life_days integer NOT NULL DEFAULT 0 CHECK (mine_life_days >= 0),
  project_value bigint NOT NULL DEFAULT 0,
  geology_confidence numeric(5,4) NOT NULL CHECK (geology_confidence BETWEEN 0 AND 1),
  geology_snapshot_at timestamptz NOT NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, deposit_id)
);

CREATE INDEX development_projects_player_idx
  ON development_projects (player_id, status, updated_at DESC);

CREATE INDEX development_projects_deposit_idx
  ON development_projects (deposit_id);

COMMIT;
