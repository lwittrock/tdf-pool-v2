/**
 * Server-side Supabase client factory.
 *
 * A factory instead of a module-scope client (fact 29): importing lib modules
 * in tests must not throw when SUPABASE_* env vars are absent — the client is
 * only created when actually used.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  cached = createClient(url, key);
  return cached;
}

const PAGE_SIZE = 1000;

/**
 * Fetch every row of a query, paginating past PostgREST's max-rows cap
 * (1000 by default — a plain .select() SILENTLY truncates beyond it; with
 * 128 participants × 11 selections that broke scoring, WP-B2).
 * The builder must apply a deterministic .order(...) for stable pages;
 * .range() is applied here.
 */
export async function fetchAll<Row>(
  build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
}
