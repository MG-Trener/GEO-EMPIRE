BEGIN;

ALTER TABLE player_deposit_knowledge
  ADD COLUMN IF NOT EXISTS estimated_quality_min numeric(8,4),
  ADD COLUMN IF NOT EXISTS estimated_quality_max numeric(8,4),
  ADD COLUMN IF NOT EXISTS estimated_density_min numeric(8,4),
  ADD COLUMN IF NOT EXISTS estimated_density_max numeric(8,4),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE player_deposit_knowledge
SET
  estimated_quality_min = COALESCE(estimated_quality_min, greatest(0, estimated_quality * 0.75)),
  estimated_quality_max = COALESCE(estimated_quality_max, estimated_quality * 1.25),
  updated_at = now()
WHERE estimated_quality IS NOT NULL
  AND (estimated_quality_min IS NULL OR estimated_quality_max IS NULL);

CREATE TABLE IF NOT EXISTS geology_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  deposit_id bigint NOT NULL REFERENCES resource_deposits(id) ON DELETE CASCADE,
  method varchar(32) NOT NULL CHECK (method IN ('geophysics', 'seismic', 'drilling', 'assessment')),
  status varchar(16) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed')),
  soft_cost bigint NOT NULL CHECK (soft_cost >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completes_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK (completes_at >= started_at)
);

CREATE INDEX IF NOT EXISTS geology_investigations_player_idx
  ON geology_investigations (player_id, started_at DESC);

CREATE INDEX IF NOT EXISTS geology_investigations_deposit_idx
  ON geology_investigations (player_id, deposit_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS geology_investigations_one_running_idx
  ON geology_investigations (player_id, deposit_id)
  WHERE status = 'running';

COMMIT;
