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
