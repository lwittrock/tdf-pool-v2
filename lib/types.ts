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
  stage_rank?: number;  // ← ADDED: Rank among all riders for this stage
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
  overall_rank?: number;  // ← ADDED: Overall rank by total points
  medal_counts?: {        // ← ADDED: Medal counts across all stages
    gold: number;
    silver: number;
    bronze: number;
    display: string;
  };
  stages: Record<string, RiderStageData>;
}

export type RidersData = Record<string, RiderData>;

// ============================================================================
// Rider Rankings Types (for simplified rider_rankings.json)
// ============================================================================

export interface RiderMedalCounts {
  gold: number;
  silver: number;
  bronze: number;
  display: string;
}

export interface RiderRankingsStageEntry {
  name: string;
  team: string;
  stage_rank: number;
  stage_points: number;
  stage_finish_position: number;
  stage_finish_points: number;
  jersey_points: {
    yellow: number;
    green: number;
    polka_dot: number;
    white: number;
    combative: number;
  };
}

export interface RiderRankingsTotalEntry {
  name: string;
  team: string;
  overall_rank: number;
  total_points: number;
  medal_counts: RiderMedalCounts;
}

export interface RiderRankingsData {
  stage_rankings: Record<string, RiderRankingsStageEntry[]>;
  total_rankings: RiderRankingsTotalEntry[];
}

// ============================================================================
// Team Selections
// ============================================================================

export interface TeamSelection {
  participant_name: string;
  directie_name: string;
  riders: string[];
}

export type TeamSelectionsData = Record<string, TeamSelection>;

// ============================================================================
// Stage Data (for admin panel)
// ============================================================================

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
    time_gap: string | null;
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
// Utility Types for Frontend Components
// ============================================================================

export interface StageInfo {
  stageNum: number;
  stageKey: string;
  date: string;
  stage_finish_points: number;
  stage_finish_position: number;
  stage_rank?: number;
  jersey_points?: {
    yellow?: number;
    green?: number;
    polka_dot?: number;
    white?: number;
    combative?: number;
  };
  stage_total: number;
  cumulative_total: number;
}

export interface MedalCounts {
  gold: number;
  silver: number;
  bronze: number;
  display: string;
}

export interface JerseyAwards {
  jerseys: Array<'yellow' | 'green' | 'polka_dot' | 'white'>;
  hasCombative: boolean;
}