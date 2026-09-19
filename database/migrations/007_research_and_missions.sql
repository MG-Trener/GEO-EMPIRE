CREATE TABLE IF NOT EXISTS technology_researches (
  id bigserial PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  tech_key varchar(64) NOT NULL,
  target_level smallint NOT NULL CHECK (target_level BETWEEN 1 AND 10),
  soft_cost numeric(18,2) NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completes_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS technology_researches_one_running_idx
  ON technology_researches (player_id)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS technology_researches_player_idx
  ON technology_researches (player_id, started_at DESC);

CREATE TABLE IF NOT EXISTS player_mission_rewards (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  mission_code varchar(64) NOT NULL,
  soft_reward numeric(18,2) NOT NULL DEFAULT 0,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, mission_code)
);
