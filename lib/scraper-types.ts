/**
 * Types for Scraper Integration
 */

// ============================================================================
// STARTLIST TYPES
// ============================================================================

export interface StartlistRider {
  rider_number: number;
  rider_name: string;
  team_name: string;
}

export interface SubmitStartlistRequest {
  year: number;
  riders: StartlistRider[];
}

export interface SubmitStartlistSuccess {
  success: true;
  data: {
    riders_inserted: number;
    riders_updated: number;
    warnings?: string[];
  };
}

// ============================================================================
// STAGE RESULTS TYPES
// ============================================================================

export interface ScrapedStageFinisher {
  position: number;
  rider_name: string;
  time_gap?: string;
}

export interface ScrapedStageJerseys {
  yellow: string;
  green: string;
  polka_dot: string;
  white: string;
}

export interface SubmitStageResultsRequest {
  stage_number: number;
  date?: string;
  distance?: string;
  departure_city?: string;
  arrival_city?: string;
  stage_type?: string;
  difficulty?: string;
  won_how?: string;
  winning_team?: string;
  top_20_finishers: ScrapedStageFinisher[];
  jerseys: ScrapedStageJerseys;
  combativity?: string;
  dnf_riders?: string[];
  dns_riders?: string[];
  force?: boolean;
}

export interface RiderMatchWarning {
  rider_name: string;
  matched_to?: string;
  similarity_score?: number;
  issue: 'not_found' | 'low_confidence' | 'multiple_matches';
}

export interface SubmitStageResultsSuccess {
  success: true;
  data: {
    stage_id: string;
    stage_number: number;
    rider_warnings?: RiderMatchWarning[];
    general_warnings?: string[];
  };
}