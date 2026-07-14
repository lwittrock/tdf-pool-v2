-- ============================================================================
-- Phase A additions (WP-A2) — run once in the Supabase SQL editor.
-- Incremental on top of supabase-schema.sql; safe to re-run.
-- Ordered migrations (WP-B7): run 000, 001, 002 in order in the SQL editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Entry log (WP-B10 table, created early): every submitted payload is logged
-- BEFORE processing — including rejected ones — as audit trail and
-- poor-man's backup (free Supabase tier has no backups).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stage_entry_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_number INTEGER NOT NULL,
  payload JSONB NOT NULL,
  submitted_by TEXT,
  accepted BOOLEAN NOT NULL,
  errors JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE stage_entry_log IS
  'Raw submitted stage payloads (also rejected ones) — audit trail + replay source';

ALTER TABLE stage_entry_log ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the service role reads/writes this table.

-- ----------------------------------------------------------------------------
-- Ploeg pick (WP-A3 import): every participant also picks one team; the +6
-- Dagploeg rule (WP-B1) needs it. Free text for now; WP-B1 turns teams into
-- reference data (teams table + ploeg_team_id, Q5).
-- ----------------------------------------------------------------------------

ALTER TABLE participants ADD COLUMN IF NOT EXISTS ploeg TEXT;

-- ----------------------------------------------------------------------------
-- Transactional swap of one stage's result rows (R7): validate happens in
-- the API layer BEFORE this is called; the function deletes and re-inserts
-- atomically, so a failure halfway can never leave a half-empty stage.
-- Also stores the stage winner's team (R1: manual entry never set
-- winning_team, which would silently break the Dagploeg rule in WP-B1).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION replace_stage_data(
  p_stage_id UUID,
  p_results JSONB,            -- [{"rider_id": uuid, "position": int, "time_gap": text|null}]
  p_jerseys JSONB,            -- [{"jersey_type": text, "rider_id": uuid}]
  p_combativity_rider UUID,   -- nullable (combativity can be absent)
  p_dnf JSONB,                -- [{"rider_id": uuid, "status": "DNF"|"DNS"|"OTL"|"DSQ"}]
  p_winning_team TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM stage_results WHERE stage_id = p_stage_id;
  DELETE FROM stage_jerseys WHERE stage_id = p_stage_id;
  DELETE FROM stage_combativity WHERE stage_id = p_stage_id;
  DELETE FROM stage_dnf WHERE stage_id = p_stage_id;

  INSERT INTO stage_results (stage_id, rider_id, position, time_gap)
  SELECT p_stage_id, (e->>'rider_id')::UUID, (e->>'position')::INTEGER, e->>'time_gap'
  FROM jsonb_array_elements(COALESCE(p_results, '[]'::JSONB)) e;

  INSERT INTO stage_jerseys (stage_id, jersey_type, rider_id)
  SELECT p_stage_id, (e->>'jersey_type')::jersey_type, (e->>'rider_id')::UUID
  FROM jsonb_array_elements(COALESCE(p_jerseys, '[]'::JSONB)) e;

  IF p_combativity_rider IS NOT NULL THEN
    INSERT INTO stage_combativity (stage_id, rider_id)
    VALUES (p_stage_id, p_combativity_rider);
  END IF;

  INSERT INTO stage_dnf (stage_id, rider_id, status)
  SELECT p_stage_id, (e->>'rider_id')::UUID, (e->>'status')::dnf_status
  FROM jsonb_array_elements(COALESCE(p_dnf, '[]'::JSONB)) e;

  UPDATE stages SET winning_team = p_winning_team WHERE id = p_stage_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION replace_stage_data(UUID, JSONB, JSONB, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
