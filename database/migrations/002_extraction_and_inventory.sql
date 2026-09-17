BEGIN;

CREATE TABLE player_inventory (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  resource_id smallint NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  quantity numeric(24,4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, resource_id)
);

CREATE TABLE inventory_transactions (
  id bigserial PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  resource_id smallint NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  quantity_delta numeric(24,4) NOT NULL CHECK (quantity_delta <> 0),
  reason varchar(64) NOT NULL,
  reference_type varchar(48),
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventory_transactions_player_idx
  ON inventory_transactions (player_id, created_at DESC);

CREATE TABLE extraction_operations (
  building_id uuid PRIMARY KEY REFERENCES buildings(id) ON DELETE CASCADE,
  deposit_id bigint NOT NULL REFERENCES resource_deposits(id) ON DELETE RESTRICT,
  rate_per_hour numeric(18,4) NOT NULL CHECK (rate_per_hour > 0),
  max_buffer_hours integer NOT NULL DEFAULT 48 CHECK (max_buffer_hours BETWEEN 1 AND 168),
  status varchar(16) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'depleted')),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_collected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX extraction_operations_deposit_idx ON extraction_operations (deposit_id);
CREATE INDEX extraction_operations_status_idx ON extraction_operations (status);

COMMIT;
