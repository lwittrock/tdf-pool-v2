import { useQuery } from '@tanstack/react-query';

// ============================================================================
// Type Definitions
// ============================================================================

interface Metadata {
  current_stage: number;
  top_n_participants_for_directie: number;
  last_updated: string;
}

interface LeaderboardEntry {
  participant_name: string;
  directie_name: string;
  overall_score: number;
  overall_rank: number;
  overall_rank_change: number;
  stage_score: number;
  stage_rank: number;
  stage_rider_contributions: Record<string, number>;
}

interface DirectieLeaderboardEntry {
  directie_name: string;
  overall_score: number;
  overall_rank: number;
  overall_rank_change: number;
  stage_score: number;
  stage_rank: number;
  stage_participant_contributions: Array<{ participant_name: string; stage_score: number }>;
  overall_participant_contributions: Array<{ participant_name: string; overall_score: number }>;
}

interface LeaderboardsData {
  leaderboard_by_stage: Record<string, LeaderboardEntry[]>;
  directie_leaderboard_by_stage: Record<string, DirectieLeaderboardEntry[]>;
}

interface RiderStageData {
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

interface RiderData {
  team: string;
  total_points: number;
  stages: Record<string, RiderStageData>;
}

type RidersData = Record<string, RiderData>;

interface StageData {
  stage_number: number;
  date: string | null;
  distance: string | null;
  departure_city: string | null;
  arrival_city: string | null;
  stage_type: string | null;
  difficulty: string | null;
  won_how: string | null;
  is_complete: boolean;
  top_20_finishers: Array<{ position: number; rider_name: string; time_gap?: string }>;
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

interface TeamSelection {
  participant_name: string;
  directie_name: string;
  riders: string[];
}

type TeamSelectionsData = Record<string, TeamSelection>;

// ============================================================================
// Metadata Hook
// ============================================================================

export function useMetadata() {
  return useQuery<Metadata>({
    queryKey: ['metadata'],
    queryFn: async () => {
      const response = await fetch('/data/metadata.json');
      if (!response.ok) {
        throw new Error(`Failed to load metadata: ${response.status}`);
      }
      return response.json();
    },
  });
}

// ============================================================================
// Leaderboards Hook
// ============================================================================

export function useLeaderboards() {
  return useQuery<LeaderboardsData>({
    queryKey: ['leaderboards'],
    queryFn: async () => {
      const response = await fetch('/data/leaderboards.json');
      if (!response.ok) {
        throw new Error(`Failed to load leaderboards: ${response.status}`);
      }
      return response.json();
    },
  });
}

// ============================================================================
// Riders Hook
// ============================================================================

export function useRiders() {
  return useQuery<RidersData>({
    queryKey: ['riders'],
    queryFn: async () => {
      const response = await fetch('/data/riders.json');
      if (!response.ok) {
        throw new Error(`Failed to load riders: ${response.status}`);
      }
      return response.json();
    },
  });
}

// ============================================================================
// Stages Data Hook (for admin panel)
// ============================================================================

export function useStagesData() {
  return useQuery<StageData[]>({
    queryKey: ['stagesData'],
    queryFn: async () => {
      const response = await fetch('/data/stages_data.json');
      if (!response.ok) {
        throw new Error(`Failed to load stages data: ${response.status}`);
      }
      return response.json();
    },
  });
}

// ============================================================================
// Team Selections Hook
// ============================================================================

export function useTeamSelections() {
  return useQuery<TeamSelectionsData>({
    queryKey: ['teamSelections'],
    queryFn: async () => {
      const response = await fetch('/data/team_selections.json');
      if (!response.ok) {
        throw new Error(`Failed to load team selections: ${response.status}`);
      }
      return response.json();
    },
  });
}

// ============================================================================
// Refresh Function (for admin panel)
// ============================================================================

/**
 * Use queryClient.invalidateQueries() in components instead
 * This is kept for backwards compatibility
 */
export function refreshTdfData() {
  window.location.reload();
}