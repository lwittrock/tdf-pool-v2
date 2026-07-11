/**
 * Versioned snapshot publishing (WP-A1).
 *
 * Pattern: immutable versioned paths + one mutable pointer.
 *   data/<season>/<runId>/<name>.json   — long cache, never overwritten
 *   data/current.json                   — pointer, cacheControlMaxAge 60
 *
 * Readers poll the pointer and key their data fetches on run_id, so a pointer
 * flip atomically swaps the whole snapshot set. Rollback = re-point
 * current.json at an earlier runId (manual, no UI — decided).
 *
 * On non-production Vercel deployments everything is written under a
 * `preview/` prefix so a preview can never overwrite production data (R16);
 * the real safeguard is scoping BLOB_READ_WRITE_TOKEN to Production in the
 * Vercel dashboard (Q21) — this is belt and braces.
 */

import { put, list, del } from '@vercel/blob';

export const SNAPSHOT_FILES = [
  'metadata',
  'leaderboards',
  'riders',
  'stages_data',
  'team_selections',
  'rider_rankings',
] as const;

export type SnapshotName = (typeof SNAPSHOT_FILES)[number];
export type SnapshotSet = Record<SnapshotName, unknown>;

export interface SnapshotPointer {
  schema_version: 1;
  season: string;
  run_id: string;
  last_updated: string;
  publish_status: 'ok' | 'failed';
  files: Record<SnapshotName, string>;
}

export interface PublishResult {
  runId: string;
  pointerUrl: string;
  files: Record<SnapshotName, string>;
}

/** Number of past runs kept for manual rollback. */
const KEEP_RUNS = 10;

/** Immutable versioned files can cache long (1 year). */
const IMMUTABLE_MAX_AGE = 31536000;

/** Pointer must propagate fast (60s is the Vercel Blob minimum). */
const POINTER_MAX_AGE = 60;

export function getSeason(): string {
  return process.env.SEASON || '2026';
}

function blobPrefix(): string {
  const env = process.env.VERCEL_ENV;
  return env && env !== 'production' ? 'preview/' : '';
}

export function newRunId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const random = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${random}`;
}

/**
 * Upload a full snapshot set under a fresh runId, then flip the pointer.
 * Old runs beyond KEEP_RUNS are pruned (never `archive/`); pruning failures
 * are logged but do not fail the publish.
 */
export async function publishSnapshots(snapshots: SnapshotSet): Promise<PublishResult> {
  const season = getSeason();
  const runId = newRunId();
  const runBase = `${blobPrefix()}data/${season}/${runId}`;

  const entries = await Promise.all(
    SNAPSHOT_FILES.map(async (name) => {
      const result = await put(`${runBase}/${name}.json`, JSON.stringify(snapshots[name]), {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'application/json',
        cacheControlMaxAge: IMMUTABLE_MAX_AGE,
      });
      return [name, result.url] as const;
    })
  );
  const files = Object.fromEntries(entries) as Record<SnapshotName, string>;

  const pointer: SnapshotPointer = {
    schema_version: 1,
    season,
    run_id: runId,
    last_updated: new Date().toISOString(),
    publish_status: 'ok',
    files,
  };

  const pointerResult = await put(`${blobPrefix()}data/current.json`, JSON.stringify(pointer), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: POINTER_MAX_AGE,
  });

  try {
    await pruneOldRuns(season, runId);
  } catch (error) {
    console.error('[Publish] Pruning old runs failed (non-fatal):', error);
  }

  return { runId, pointerUrl: pointerResult.url, files };
}

/**
 * Delete versioned runs beyond the newest KEEP_RUNS. RunIds start with a
 * UTC timestamp, so lexicographic order is chronological order.
 */
async function pruneOldRuns(season: string, currentRunId: string): Promise<void> {
  const prefix = `${blobPrefix()}data/${season}/`;
  const runIds = new Set<string>();
  const blobsByRun = new Map<string, string[]>();

  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor });
    for (const blob of page.blobs) {
      const rest = blob.pathname.slice(prefix.length);
      const runId = rest.split('/')[0];
      if (!runId) continue;
      runIds.add(runId);
      const urls = blobsByRun.get(runId) ?? [];
      urls.push(blob.url);
      blobsByRun.set(runId, urls);
    }
    cursor = page.cursor ?? undefined;
  } while (cursor);

  const ordered = [...runIds].sort().reverse(); // newest first
  const toDelete = ordered.slice(KEEP_RUNS).filter((id) => id !== currentRunId);

  for (const runId of toDelete) {
    const urls = blobsByRun.get(runId) ?? [];
    if (urls.length > 0) await del(urls);
  }
}
