-- TdF Pool - Complete Database Schema (Updated & Fixed)
-- This is the COMPLETE schema - drop existing tables and run this fresh

-- Drop existing tables (in correct order due to foreign keys)
DROP TABLE IF EXISTS participant_rider_contributions CASCADE;
DROP TABLE IF EXISTS rider_stage_points CASCADE;
DROP TABLE IF EXISTS participant_stage_points CASCADE;
DROP TABLE IF EXISTS directie_stage_points CASCADE;
DROP TABLE IF EXISTS participant_rider_selections CASCADE;
DROP TABLE IF EXISTS stage_combativity CASCADE;
DROP TABLE IF EXISTS stage_jerseys CASCADE;
DROP TABLE IF EXISTS stage_results CASCADE;
DROP TABLE IF EXISTS stage_dnf CASCADE;
DROP TABLE IF EXISTS stages CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS directie CASCADE;
DROP TABLE IF EXISTS riders CASCADE;

-- Drop existing types
DROP TYPE IF EXISTS jersey_type CASCADE;
DROP TYPE IF EXISTS dnf_status CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE jersey_type AS ENUM ('yellow', 'green', 'polka_dot', 'white');
CREATE TYPE dnf_status AS ENUM ('DNF', 'DNS', 'OTL', 'DSQ');

-- ============================================================================
-- BASE TABLES
-- ============================================================================

-- Directie (teams/departments)
CREATE TABLE directie (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Riders
CREATE TABLE riders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  team TEXT NOT NULL,
  rider_number INTEGER,
  country TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Participants
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  email TEXT,
  directie_id UUID REFERENCES directie(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stages
CREATE TABLE stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_number INTEGER NOT NULL UNIQUE,
  date DATE,
  distance TEXT,
  departure_city TEXT,
  arrival_city TEXT,
  stage_type TEXT,
  difficulty TEXT,
  won_how TEXT,
  is_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PARTICIPANT RIDER SELECTIONS
-- ============================================================================

CREATE TABLE participant_rider_selections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 11),
  is_active BOOLEAN DEFAULT true,
  replaced_at_stage INTEGER,
  replacement_for_rider_id UUID REFERENCES riders(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(participant_id, position),
  UNIQUE(participant_id, rider_id)
);

-- ============================================================================
-- STAGE RESULTS
-- ============================================================================

-- Stage finishing positions
CREATE TABLE stage_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  time_gap TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(stage_id, rider_id),
  UNIQUE(stage_id, position)
);

-- Jersey holders
CREATE TABLE stage_jerseys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  jersey_type jersey_type NOT NULL,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(stage_id, jersey_type)
);

-- Combativity award
CREATE TABLE stage_combativity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(stage_id)
);

-- DNF/DNS riders
CREATE TABLE stage_dnf (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  status dnf_status NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(stage_id, rider_id)
);

-- ============================================================================
-- POINTS TRACKING (PRE-CALCULATED)
-- ============================================================================

-- Rider points per stage (NEW - stores all rider points)
CREATE TABLE rider_stage_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  
  -- Points breakdown
  stage_finish_points INTEGER NOT NULL DEFAULT 0,
  yellow_points INTEGER NOT NULL DEFAULT 0,
  green_points INTEGER NOT NULL DEFAULT 0,
  polka_dot_points INTEGER NOT NULL DEFAULT 0,
  white_points INTEGER NOT NULL DEFAULT 0,
  combativity_points INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  
  -- Rankings
  stage_rank INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(rider_id, stage_id)
);

-- Participant points per stage
CREATE TABLE participant_stage_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  
  -- Points for this stage
  stage_points INTEGER NOT NULL DEFAULT 0,
  stage_rank INTEGER,
  stage_rank_change INTEGER,
  
  -- Cumulative totals up to this stage
  cumulative_points INTEGER NOT NULL DEFAULT 0,
  overall_rank INTEGER,
  overall_rank_change INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(participant_id, stage_id)
);

-- Participant rider contributions (NEW - tracks which riders contributed to each participant)
CREATE TABLE participant_rider_contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  points_contributed INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(participant_id, stage_id, rider_id)
);

-- Directie (team) points per stage
CREATE TABLE directie_stage_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  directie_id UUID NOT NULL REFERENCES directie(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  
  -- Points for this stage (sum of top N participants)
  stage_points INTEGER NOT NULL DEFAULT 0,
  stage_rank INTEGER,
  stage_rank_change INTEGER,
  
  -- Cumulative totals
  cumulative_points INTEGER NOT NULL DEFAULT 0,
  overall_rank INTEGER,
  overall_rank_change INTEGER,
  
  -- Which participants contributed (stored as JSONB for easy querying)
  top_contributors JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(directie_id, stage_id)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Participant indexes
CREATE INDEX idx_participants_directie ON participants(directie_id);

-- Rider selection indexes
CREATE INDEX idx_rider_selections_participant ON participant_rider_selections(participant_id);
CREATE INDEX idx_rider_selections_rider ON participant_rider_selections(rider_id);
CREATE INDEX idx_rider_selections_active ON participant_rider_selections(is_active) WHERE is_active = true;

-- Stage results indexes
CREATE INDEX idx_stage_results_stage ON stage_results(stage_id);
CREATE INDEX idx_stage_results_rider ON stage_results(rider_id);
CREATE INDEX idx_stage_results_position ON stage_results(stage_id, position);

-- Stage jerseys indexes
CREATE INDEX idx_stage_jerseys_stage ON stage_jerseys(stage_id);
CREATE INDEX idx_stage_jerseys_rider ON stage_jerseys(rider_id);

-- Stage combativity indexes
CREATE INDEX idx_stage_combativity_stage ON stage_combativity(stage_id);

-- Stage DNF indexes
CREATE INDEX idx_stage_dnf_stage ON stage_dnf(stage_id);
CREATE INDEX idx_stage_dnf_rider ON stage_dnf(rider_id);
CREATE INDEX idx_stage_dnf_status ON stage_dnf(status);

-- Rider stage points indexes (NEW)
CREATE INDEX idx_rider_stage_points_rider ON rider_stage_points(rider_id);
CREATE INDEX idx_rider_stage_points_stage ON rider_stage_points(stage_id);
CREATE INDEX idx_rider_stage_points_rank ON rider_stage_points(stage_id, stage_rank);

-- Participant points indexes
CREATE INDEX idx_participant_points_participant ON participant_stage_points(participant_id);
CREATE INDEX idx_participant_points_stage ON participant_stage_points(stage_id);

-- Participant rider contributions indexes (NEW)
CREATE INDEX idx_participant_rider_contrib_participant ON participant_rider_contributions(participant_id);
CREATE INDEX idx_participant_rider_contrib_stage ON participant_rider_contributions(stage_id);
CREATE INDEX idx_participant_rider_contrib_rider ON participant_rider_contributions(rider_id);

-- Directie points indexes
CREATE INDEX idx_directie_points_directie ON directie_stage_points(directie_id);
CREATE INDEX idx_directie_points_stage ON directie_stage_points(stage_id);

-- Stages indexes
CREATE INDEX idx_stages_number ON stages(stage_number);
CREATE INDEX idx_stages_complete ON stages(is_complete) WHERE is_complete = true;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get current stage number
CREATE OR REPLACE FUNCTION get_current_stage()
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT MAX(stage_number) 
    FROM stages 
    WHERE is_complete = true
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get total participants count
CREATE OR REPLACE FUNCTION get_total_participants()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM participants);
END;
$$ LANGUAGE plpgsql;

-- Function to lookup rider ID by name (case-insensitive)
CREATE OR REPLACE FUNCTION get_rider_id_by_name(rider_name TEXT)
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT id 
    FROM riders 
    WHERE LOWER(name) = LOWER(rider_name)
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE directie ENABLE ROW LEVEL SECURITY;
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_rider_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_jerseys ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_combativity ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_dnf ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_stage_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_stage_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_rider_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE directie_stage_points ENABLE ROW LEVEL SECURITY;

-- Public read access for all tables (everyone can view)
CREATE POLICY "Public read directie" ON directie FOR SELECT USING (true);
CREATE POLICY "Public read riders" ON riders FOR SELECT USING (true);
CREATE POLICY "Public read participants" ON participants FOR SELECT USING (true);
CREATE POLICY "Public read participant_rider_selections" ON participant_rider_selections FOR SELECT USING (true);
CREATE POLICY "Public read rider_stage_points" ON rider_stage_points FOR SELECT USING (true);
CREATE POLICY "Public read participant_stage_points" ON participant_stage_points FOR SELECT USING (true);
CREATE POLICY "Public read participant_rider_contributions" ON participant_rider_contributions FOR SELECT USING (true);
CREATE POLICY "Public read directie_stage_points" ON directie_stage_points FOR SELECT USING (true);

-- Stages: public can only see completed stages
CREATE POLICY "Public read completed stages" ON stages 
  FOR SELECT USING (is_complete = true);

-- Stage results: only visible if stage is complete
CREATE POLICY "Public read stage_results" ON stage_results 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM stages 
      WHERE stages.id = stage_results.stage_id 
      AND stages.is_complete = true
    )
  );

CREATE POLICY "Public read stage_jerseys" ON stage_jerseys 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM stages 
      WHERE stages.id = stage_jerseys.stage_id 
      AND stages.is_complete = true
    )
  );

CREATE POLICY "Public read stage_combativity" ON stage_combativity 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM stages 
      WHERE stages.id = stage_combativity.stage_id 
      AND stages.is_complete = true
    )
  );

CREATE POLICY "Public read stage_dnf" ON stage_dnf 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM stages 
      WHERE stages.id = stage_dnf.stage_id 
      AND stages.is_complete = true
    )
  );

-- TODO: Add admin write policies later when we implement auth
-- For now, use service role key for all writes

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE directie IS 'Teams/departments that participants belong to';
COMMENT ON TABLE riders IS 'All riders in the Tour de France';
COMMENT ON TABLE participants IS 'All participants in the pool';
COMMENT ON TABLE participant_rider_selections IS 'Each participant''s 10 main riders + 1 backup';
COMMENT ON TABLE stages IS 'Tour de France stages';
COMMENT ON TABLE stage_results IS 'Top 20 finishers per stage';
COMMENT ON TABLE stage_jerseys IS 'Jersey holders after each stage';
COMMENT ON TABLE stage_combativity IS 'Most combative rider per stage';
COMMENT ON TABLE stage_dnf IS 'Riders who did not finish/start each stage';
COMMENT ON TABLE rider_stage_points IS 'Pre-calculated points and rankings per rider per stage';
COMMENT ON TABLE participant_stage_points IS 'Pre-calculated points and rankings per participant per stage';
COMMENT ON TABLE participant_rider_contributions IS 'Tracks which riders contributed points to each participant per stage';
COMMENT ON TABLE directie_stage_points IS 'Pre-calculated points and rankings per directie per stage';

COMMENT ON COLUMN participant_rider_selections.position IS '1-10 for main riders, 11 for backup';
COMMENT ON COLUMN participant_rider_selections.is_active IS 'False if rider DNF/DNS and was replaced';
COMMENT ON COLUMN participant_stage_points.stage_rank_change IS 'Positive = moved up, negative = moved down';
COMMENT ON COLUMN participant_stage_points.overall_rank_change IS 'Change in overall ranking after this stage';
COMMENT ON COLUMN rider_stage_points.stage_rank IS 'Rank among all riders for this stage (1 = highest points)';