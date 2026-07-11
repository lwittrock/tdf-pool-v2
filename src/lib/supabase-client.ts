/**
 * Browser-side Supabase client — ONLY for Auth (OTP login, WP-A4).
 * The public site never reads data from Supabase (architecture decision);
 * data comes from published snapshots.
 *
 * Null when VITE_SUPABASE_* is not configured; the login screen then falls
 * back to the static beheertoken.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseAuth: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;
