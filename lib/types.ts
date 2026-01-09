/**
 * Shared Type Definitions for TdF Pool
 * 
 * Single source of truth for all data structures.
 * Used by both API routes and React components.
 */

// ============================================================================
// Database Types (from Supabase schema)
// ============================================================================

export type JerseyType = 'yellow' | 'green' | 'polka_dot' | 'white';
export type DNFStatus = 'DNF' | 'DNS' | 'OTL' | 'DSQ';
export type PointsType = 
  | 'stage_position'
  | 'yellow_jersey'
  | 'green_jersey'
  | 'polka_dot_jersey'
  | 'white_jersey'
  | 'combativity';

// ============================================================================
// API Response Types
// ============================================================================

export interface Metadata {
  current_stage: number;
  top_n_participants_for_directie: number;
  last_updated: string;
}

export interface LeaderboardEntry {
  participant_name: string;
  directie_name: string;
  overall_score: number;
  overall_rank: number;
  overall_rank_change: number;
  stage_score: number;
  stage_rank: number;
  stage_rider_contributions: Record<string, number>;
}

export interface DirectieLeaderboardEntry {
  directie_name: string;
  overall_score: number;
  overall_rank: number;
  overall_rank_change: number;
  stage_score: number;
  stage_rank: number;
  stage_participant_contributions: Array<{
    participant_name: string;
    stage_score: number;
  }>;
  overall_participant_contributions: Array<{
    participant_name: string;
    overall_score: number;
  }>;
}

export interface LeaderboardsData {
  leaderboard_by_stage: Record<string, LeaderboardEntry[]>;
  directie_leaderboard_by_stage: Record<string, DirectieLeaderboardEntry[]>;
}

export interface RiderStageData {
  date: string;
  stage_finish_points: number;
  stage_finish_position: number;
  jersey_points: {
    yellow: number;
    green: number;
    polka_dot: number;
    white: number;
    combative: number;
  };
  stage_total: number;
  cumulative_total: number;
}

export interface RiderData {
  team: string;
  total_points: number;
  stages: Record<string, RiderStageData>;
}

export type RidersData = Record<string, RiderData>;

export interface TeamSelection {
  participant_name: string;
  directie_name: string;
  riders: string[];
}

export type TeamSelectionsData = Record<string, TeamSelection>;

export interface StageData {
  stage_number: number;
  date: string | null;
  distance: string | null;
  departure_city: string | null;
  arrival_city: string | null;
  stage_type: string | null;
  difficulty: string | null;
  won_how: string | null;
  is_complete: boolean;
  top_20_finishers: Array<{
    position: number;
    rider_name: string;
    time_gap?: string;
  }>;
  jerseys: {
    yellow: string;
    green: string;
    polka_dot: string;
    white: string;
  };
  combativity: string;
  dnf_riders: string[];
  dns_riders: string[];
}

// ============================================================================
// Computed/Derived Types (used in UI)
// ============================================================================

export interface StageInfo {
  stageNum: number;
  stageKey: string;
  date: string;
  stage_finish_points: number;
  stage_finish_position: number;
  jersey_points: {
    yellow: number;
    green: number;
    polka_dot: number;
    white: number;
    combative: number;
  };
  stage_total: number;
  cumulative_total: number;
}

export interface RiderWithRank extends RiderData {
  name: string;
  overall_rank: number;
}

export interface RiderWithStagePoints extends RiderData {
  name: string;
  stage_points: number;
  stage_data: RiderStageData | undefined;
}

export interface RiderWithSelectionStats extends RiderData {
  name: string;
  selection_count: number;
  selection_percentage: number;
}

export interface MedalCounts {
  gold: number;
  silver: number;
  bronze: number;
  display: string;
}

// ============================================================================
// View Types
// ============================================================================

export type LeaderboardViewType = 'stage_individual' | 'standings_individual' | 'standings_directie';
export type RiderViewType = 'stage' | 'total' | 'team';

// ============================================================================
// Admin API Types
// ============================================================================

export interface ProcessStageRequest {
  stage_number: number;
  force?: boolean;
}

export interface CalculatePointsRequest {
  stage_number: number;
  force?: boolean;
}

export interface ManualStageEntry {
  stage_number: number;
  date?: string;
  distance?: string;
  departure_city?: string;
  arrival_city?: string;
  stage_type?: string;
  difficulty?: string;
  won_how?: string;
  top_20_finishers: Array<{
    rider_name: string;
    position: number;
    time_gap?: string;
  }>;
  jerseys: {
    yellow?: string;
    green?: string;
    polka_dot?: string;
    white?: string;
  };
  combativity?: string;
  dnf_riders?: string[];
  dns_riders?: string[];
}

export interface ApiError {
  error: string;
  details?: any;
}

export interface ApiSuccess {
  success: true;
  [key: string]: any;
}
