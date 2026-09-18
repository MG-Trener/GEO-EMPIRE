BEGIN;

CREATE TABLE IF NOT EXISTS player_technologies (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  tech_key varchar(64) NOT NULL,
  level smallint NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, tech_key)
);

CREATE INDEX IF NOT EXISTS player_technologies_player_idx
  ON player_technologies (player_id, updated_at DESC);

COMMIT;
