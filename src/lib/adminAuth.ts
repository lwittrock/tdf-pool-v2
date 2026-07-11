/**
 * Admin credential for the beheer UI.
 *
 * WP-A4: the primary credential is the Supabase OTP session; the static
 * beheertoken (localStorage) remains as fallback for when Supabase Auth is
 * not configured yet, and for scripts. The server accepts both
 * (lib/require-admin.ts).
 */

import { supabaseAuth } from './supabase-client';

const STORAGE_KEY = 'tdf-admin-token';

export function getAdminToken(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAdminToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable (private mode) — token lives for this page only
  }
}

/** Authorization header: OTP session first, beheertoken as fallback. */
export async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  if (supabaseAuth) {
    const { data } = await supabaseAuth.auth.getSession();
    const accessToken = data.session?.access_token;
    if (accessToken) return { Authorization: `Bearer ${accessToken}` };
  }
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function signOutAdmin(): Promise<void> {
  if (supabaseAuth) await supabaseAuth.auth.signOut();
  setAdminToken('');
}
