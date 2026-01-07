import { useState, useEffect } from 'react';

/**
 * Configuration for JSON file URLs
 * These should point to your Vercel Blob storage URLs after first deployment
 * 
 * For local development with static files in /public/data:
 * - Use relative paths like '/data/metadata.json'
 * 
 * For production with Vercel Blob:
 * - Use the blob URLs returned from process-stage endpoint
 * - Or set environment variables for the blob URLs
 */

const USE_BLOB_STORAGE = import.meta.env.VITE_USE_BLOB_STORAGE === 'true';

const BLOB_BASE_URL = import.meta.env.VITE_BLOB_BASE_URL || '';

function getDataUrl(filename: string): string {
  if (USE_BLOB_STORAGE && BLOB_BASE_URL) {
    return `${BLOB_BASE_URL}/${filename}`;
  }
  // Fallback to local public/data directory
  return `/data/${filename}`;
}

// ============================================================================
// Metadata Hook
// ============================================================================

interface Metadata {
  current_stage: number;
  top_n_participants_for_directie: number;
  last_updated: string;
}

export function useMetadata() {
  const [data, setData] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(getDataUrl('metadata.json'));
        
        if (!response.ok) {
          throw new Error(`Failed to load metadata: ${response.status}`);
        }
        
        const json = await response.json();
        setData(json);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch metadata:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { data, loading, error };
}

// ============================================================================
// Leaderboards Hook
// ============================================================================

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

export function useLeaderboards() {
  const [data, setData] = useState<LeaderboardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(getDataUrl('leaderboards.json'));
        
        if (!response.ok) {
          throw new Error(`Failed to load leaderboards: ${response.status}`);
        }
        
        const json = await response.json();
        setData(json);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch leaderboards:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { data, loading, error };
}

// ============================================================================
// Riders Hook
// ============================================================================

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

export function useRiders() {
  const [data, setData] = useState<RidersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(getDataUrl('riders.json'));
        
        if (!response.ok) {
          throw new Error(`Failed to load riders: ${response.status}`);
        }
        
        const json = await response.json();
        setData(json);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch riders:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { data, loading, error };
}

// ============================================================================
// Stages Data Hook (for admin panel)
// ============================================================================

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

export function useStagesData() {
  const [data, setData] = useState<StageData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(getDataUrl('stages_data.json'));
        
        if (!response.ok) {
          throw new Error(`Failed to load stages data: ${response.status}`);
        }
        
        const json = await response.json();
        setData(json);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch stages data:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { data, loading, error };
}

// ============================================================================
// Combined Hook (for pages that need multiple data sources)
// ============================================================================

interface CombinedTdfData {
  metadata: Metadata | null;
  leaderboards: LeaderboardsData | null;
  riders: RidersData | null;
}

export function useTdfData() {
  const { data: metadata, loading: metadataLoading, error: metadataError } = useMetadata();
  const { data: leaderboards, loading: leaderboardsLoading, error: leaderboardsError } = useLeaderboards();
  const { data: riders, loading: ridersLoading, error: ridersError } = useRiders();

  const loading = metadataLoading || leaderboardsLoading || ridersLoading;
  const error = metadataError || leaderboardsError || ridersError;

  const data: CombinedTdfData | null = 
    metadata && leaderboards && riders
      ? { metadata, leaderboards, riders }
      : null;

  return { data, loading, error };
}

// ============================================================================
// Refresh Function (for admin panel)
// ============================================================================

/**
 * Manually trigger a refresh of the JSON data by reloading the page
 * Useful after processing a new stage
 */
export function refreshTdfData() {
  window.location.reload();
}