/**
 * TdF Data Fetching Hooks
 * 
 * React Query hooks for fetching static JSON data.
 * Updated to use shared types from lib/types.ts
 */

import { useQuery } from '@tanstack/react-query';
import { DATA_PATHS, CACHE_CONFIG } from '../../lib/constants';
import type {
  Metadata,
  LeaderboardsData,
  RidersData,
  TeamSelectionsData,
  StageData,
} from '../../lib/types';

// ============================================================================
// Metadata Hook
// ============================================================================

/**
 * Fetch metadata (current stage, last updated, etc.)
 */
export function useMetadata() {
  return useQuery<Metadata>({
    queryKey: ['metadata'],
    queryFn: async () => {
      const response = await fetch(DATA_PATHS.METADATA);
      if (!response.ok) {
        throw new Error(`Failed to load metadata: ${response.status}`);
      }
      return response.json();
    },
    staleTime: CACHE_CONFIG.STALE_TIME,
    gcTime: CACHE_CONFIG.GC_TIME,
    refetchOnWindowFocus: CACHE_CONFIG.REFETCH_ON_WINDOW_FOCUS,
    refetchOnMount: CACHE_CONFIG.REFETCH_ON_MOUNT,
    refetchOnReconnect: CACHE_CONFIG.REFETCH_ON_RECONNECT,
    retry: CACHE_CONFIG.RETRY,
  });
}

// ============================================================================
// Leaderboards Hook
// ============================================================================

/**
 * Fetch leaderboards (participant and directie rankings by stage)
 */
export function useLeaderboards() {
  return useQuery<LeaderboardsData>({
    queryKey: ['leaderboards'],
    queryFn: async () => {
      const response = await fetch(DATA_PATHS.LEADERBOARDS);
      if (!response.ok) {
        throw new Error(`Failed to load leaderboards: ${response.status}`);
      }
      return response.json();
    },
    staleTime: CACHE_CONFIG.STALE_TIME,
    gcTime: CACHE_CONFIG.GC_TIME,
    refetchOnWindowFocus: CACHE_CONFIG.REFETCH_ON_WINDOW_FOCUS,
    refetchOnMount: CACHE_CONFIG.REFETCH_ON_MOUNT,
    refetchOnReconnect: CACHE_CONFIG.REFETCH_ON_RECONNECT,
    retry: CACHE_CONFIG.RETRY,
  });
}

// ============================================================================
// Riders Hook
// ============================================================================

/**
 * Fetch riders data (all riders with their points and stage breakdowns)
 */
export function useRiders() {
  return useQuery<RidersData>({
    queryKey: ['riders'],
    queryFn: async () => {
      const response = await fetch(DATA_PATHS.RIDERS);
      if (!response.ok) {
        throw new Error(`Failed to load riders: ${response.status}`);
      }
      return response.json();
    },
    staleTime: CACHE_CONFIG.STALE_TIME,
    gcTime: CACHE_CONFIG.GC_TIME,
    refetchOnWindowFocus: CACHE_CONFIG.REFETCH_ON_WINDOW_FOCUS,
    refetchOnMount: CACHE_CONFIG.REFETCH_ON_MOUNT,
    refetchOnReconnect: CACHE_CONFIG.REFETCH_ON_RECONNECT,
    retry: CACHE_CONFIG.RETRY,
  });
}

// ============================================================================
// Stages Data Hook (for admin panel)
// ============================================================================

/**
 * Fetch complete stage data (for admin/management interface)
 */
export function useStagesData() {
  return useQuery<StageData[]>({
    queryKey: ['stagesData'],
    queryFn: async () => {
      const response = await fetch(DATA_PATHS.STAGES);
      if (!response.ok) {
        throw new Error(`Failed to load stages data: ${response.status}`);
      }
      return response.json();
    },
    staleTime: CACHE_CONFIG.STALE_TIME,
    gcTime: CACHE_CONFIG.GC_TIME,
    refetchOnWindowFocus: CACHE_CONFIG.REFETCH_ON_WINDOW_FOCUS,
    refetchOnMount: CACHE_CONFIG.REFETCH_ON_MOUNT,
    refetchOnReconnect: CACHE_CONFIG.REFETCH_ON_RECONNECT,
    retry: CACHE_CONFIG.RETRY,
  });
}

// ============================================================================
// Team Selections Hook
// ============================================================================

/**
 * Fetch team selections (which riders each participant selected)
 */
export function useTeamSelections() {
  return useQuery<TeamSelectionsData>({
    queryKey: ['teamSelections'],
    queryFn: async () => {
      const response = await fetch(DATA_PATHS.TEAM_SELECTIONS);
      if (!response.ok) {
        throw new Error(`Failed to load team selections: ${response.status}`);
      }
      return response.json();
    },
    staleTime: CACHE_CONFIG.STALE_TIME,
    gcTime: CACHE_CONFIG.GC_TIME,
    refetchOnWindowFocus: CACHE_CONFIG.REFETCH_ON_WINDOW_FOCUS,
    refetchOnMount: CACHE_CONFIG.REFETCH_ON_MOUNT,
    refetchOnReconnect: CACHE_CONFIG.REFETCH_ON_RECONNECT,
    retry: CACHE_CONFIG.RETRY,
  });
}

// ============================================================================
// Refresh Function (for admin panel)
// ============================================================================

/**
 * Force refresh all data
 */

export function refreshTdfData() {
  window.location.reload();
}