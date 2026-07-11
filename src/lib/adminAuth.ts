/**
 * Admin credential for the beheer UI.
 *
 * Interim lockdown (WP-A0): a static beheertoken, bewaard in localStorage,
 * meegestuurd als Authorization-header naar alle beheer-API's.
 * WP-A4 vervangt dit door een Supabase OTP-sessie; alleen dit module hoeft
 * dan te veranderen.
 */

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

export function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
