BEGIN;

CREATE TABLE IF NOT EXISTS geology_researches (
  id bigserial PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  skill varchar(32) NOT NULL,
  target_level smallint NOT NULL CHECK (target_level BETWEEN 1 AND 10),
  currency varchar(8) NOT NULL CHECK (currency IN ('soft','premium')),
  cost numeric(18,2) NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completes_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS geology_researches_one_running_idx
  ON geology_researches (player_id)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS geology_researches_player_idx
  ON geology_researches (player_id, started_at DESC);

COMMIT;
