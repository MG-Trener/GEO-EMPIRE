BEGIN;

ALTER TABLE development_projects
  ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES buildings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS development_projects_building_idx
  ON development_projects (building_id)
  WHERE building_id IS NOT NULL;

COMMIT;
