-- ============================================================================
-- Phase B1 (WP-B1) — run once in the Supabase SQL editor. Safe to re-run.
-- Dagploeg as a first-class input + rider aliases.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Dagploeg: the winner of the stage's TEAM DAY CLASSIFICATION (PCS
-- "Complementary results" per stage) — NOT the stage winner's team
-- (stages.winning_team, which stays what it is). The +6 rule compares
-- participants.ploeg against this column.
-- ----------------------------------------------------------------------------

ALTER TABLE stages ADD COLUMN IF NOT EXISTS dagploeg TEXT;

-- Backfill stages 1-9 (source: the pool Excel / data/2026/fixtures).
UPDATE stages SET dagploeg = 'NETCOMPANY INEOS CYCLING TEAM' WHERE stage_number = 1;
UPDATE stages SET dagploeg = 'UAE TEAM EMIRATES XRG'          WHERE stage_number = 2;
UPDATE stages SET dagploeg = 'UAE TEAM EMIRATES XRG'          WHERE stage_number = 3;
UPDATE stages SET dagploeg = 'LIDL-TREK'                      WHERE stage_number = 4;
UPDATE stages SET dagploeg = 'XDS ASTANA TEAM'                WHERE stage_number = 5;
UPDATE stages SET dagploeg = 'UAE TEAM EMIRATES XRG'          WHERE stage_number = 6;
UPDATE stages SET dagploeg = 'XDS ASTANA TEAM'                WHERE stage_number = 7;
UPDATE stages SET dagploeg = 'TEAM PICNIC POSTNL'             WHERE stage_number = 8;
UPDATE stages SET dagploeg = 'EF EDUCATION - EASYPOST'        WHERE stage_number = 9;

-- ----------------------------------------------------------------------------
-- Rider aliases: alternative spellings that resolve to a canonical rider row
-- at entry/import time. The pool Excel is spelling-inconsistent (WP-B1/Q...);
-- an alias row prevents a phantom duplicate rider instead of needing a merge.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rider_aliases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alias TEXT NOT NULL UNIQUE,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE rider_aliases IS
  'Alternative rider-name spellings → canonical rider row (entry validation + imports)';

ALTER TABLE rider_aliases ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the service role reads/writes this table.

-- Known aliases from the 2026 Excel administration.
INSERT INTO rider_aliases (alias, rider_id)
SELECT 'TOBIAS JOHANNESSEN', id FROM riders WHERE name = 'TOBIAS HALLAND JOHANNESSEN'
ON CONFLICT (alias) DO NOTHING;
