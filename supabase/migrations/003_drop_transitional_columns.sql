-- 003 — drop transitional debris (cleanup backlog items 4 + 6, July 2026).
--
-- Run AFTER the code that stops writing is_active is deployed (the commit
-- that adds this file). Idempotent, like the other migrations.
--
-- * participant_rider_selections.is_active: written by the v1-era pipeline,
--   never read — the roster derives from replaced_at_stage (scoring.ts).
--   Dropping the column also drops the partial index
--   idx_rider_selections_active. NOTE: riders.is_active is a DIFFERENT,
--   live column (startlist membership) and stays.
-- * participant_stage_points.stage_rank_change: in the schema, never
--   written or read. The site shows overall_rank_change only.
-- * directie_stage_points: whole table never written or read — the directie
--   leaderboard is computed at publish time from participant_stage_points
--   (lib/json-generators.ts), and since the July 2026 owner ruling it is an
--   average, which these INTEGER columns could not hold anyway.

ALTER TABLE participant_rider_selections DROP COLUMN IF EXISTS is_active;

ALTER TABLE participant_stage_points DROP COLUMN IF EXISTS stage_rank_change;

DROP TABLE IF EXISTS directie_stage_points;
