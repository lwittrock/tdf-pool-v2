/**
 * TdF Data Fetching Hooks (WP-A1: versioned snapshots + pointer)
 *
 * The public site polls one small pointer file (data/current.json) and keys
 * every data query on the pointer's run_id. A pointer flip therefore swaps
 * the whole snapshot set atomically: all hooks re-fetch from the new run's
 * immutable URLs, and immutable URLs may cache forever.
 */

import { useQuery } from '@tanstack/react-query';
import { config } from '../../lib/config';
import { POINTER_POLL_INTERVAL_MS } from '../../lib/constants';
import type {
  Metadata,
  LeaderboardsData,
  RidersData,
  TeamSelectionsData,
  StageData,
  RiderRankingsData,
} from '../../lib/types';

// ============================================================================
// Pointer
// ============================================================================

export type SnapshotName =
  | 'metadata'
  | 'leaderboards'
  | 'riders'
  | 'stages_data'
  | 'team_selections'
  | 'rider_rankings';

export interface SnapshotPointer {
  schema_version: number;
  season: string;
  run_id: string;
  last_updated: string;
  publish_status: 'ok' | 'failed';
  files: Record<SnapshotName, string>;
}

/**
 * Fetch JSON with a content-type guard (R22): a misconfigured base URL makes
 * the SPA catch-all serve index.html with status 200 — surface that as a
 * readable error instead of a JSON parse exception.
 */
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Kon data niet laden (${response.status})`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    throw new Error('Kon data niet laden (geen geldige databron geconfigureerd)');
  }
  return response.json() as Promise<T>;
}

/**
 * The snapshot pointer. Polled while the tab is visible; fetched with
 * cache: 'no-store' so browser caching never delays a publish (P2) —
 * the blob CDN still absorbs the request load.
 */
export function useSnapshotPointer() {
  return useQuery<SnapshotPointer>({
    queryKey: ['snapshot-pointer'],
    queryFn: () => fetchJson<SnapshotPointer>(config.data.pointer(), { cache: 'no-store' }),
    refetchInterval: POINTER_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: false,
    staleTime: 30_000,
    retry: 1,
  });
}

// ============================================================================
// Snapshot data queries (keyed on run_id)
// ============================================================================

function useSnapshot<T>(name: SnapshotName) {
  const pointerQuery = useSnapshotPointer();
  const url = pointerQuery.data?.files?.[name];
  const runId = pointerQuery.data?.run_id;

  const dataQuery = useQuery<T>({
    queryKey: ['snapshot', name, runId],
    queryFn: () => fetchJson<T>(url as string),
    enabled: Boolean(url),
    // Versioned URLs are immutable; a new run_id makes a new cache entry.
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  // Merge pointer failures in, so pages show an error instead of loading forever.
  return {
    ...dataQuery,
    isLoading: pointerQuery.isLoading || dataQuery.isLoading,
    isError: pointerQuery.isError || dataQuery.isError,
    error: pointerQuery.error ?? dataQuery.error,
  };
}

/** Fetch metadata (current stage, last updated, etc.) */
export function useMetadata() {
  return useSnapshot<Metadata>('metadata');
}

/** Fetch leaderboards (participant and directie rankings by stage) */
export function useLeaderboards() {
  return useSnapshot<LeaderboardsData>('leaderboards');
}

/** Fetch riders data (all riders with their points and stage breakdowns) */
export function useRiders() {
  return useSnapshot<RidersData>('riders');
}

/** Fetch complete stage data (for the beheer interface) */
export function useStagesData() {
  return useSnapshot<StageData[]>('stages_data');
}

/** Fetch team selections (which riders each participant selected) */
export function useTeamSelections() {
  return useSnapshot<TeamSelectionsData>('team_selections');
}

/** Fetch pre-computed rider rankings (stage and total) */
export function useRiderRankings() {
  return useSnapshot<RiderRankingsData>('rider_rankings');
}
