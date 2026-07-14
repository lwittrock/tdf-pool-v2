/**
 * Admin authorization for API routes.
 *
 * Phase A interim lockdown (WP-A0/P1): every write route and every admin GET
 * route requires a bearer token. One static token is accepted:
 *   - ADMIN_TOKEN  — used by the admin UI until OTP sessions land (WP-A4)
 *
 * WP-A4 extends this with Supabase Auth sessions: a JWT whose verified email
 * is in the ADMIN_EMAILS allowlist is accepted as a third credential.
 */

import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export type AdminIdentity =
  | { kind: 'admin-token' }
  | { kind: 'user'; email: string };

export type AdminCheck =
  | { ok: true; identity: AdminIdentity }
  | { ok: false; status: number; error: string };

/** Constant-time comparison; never leaks how much of the token matched. */
function tokenMatches(candidate: string, expected: string | undefined): boolean {
  if (!expected || expected.length === 0) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function getBearerToken(req: VercelRequest): string {
  const raw = req.headers.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header || !header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

export async function checkAdmin(req: VercelRequest): Promise<AdminCheck> {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: 'Niet ingelogd: autorisatie ontbreekt' };
  }

  if (tokenMatches(token, process.env.ADMIN_TOKEN)) {
    return { ok: true, identity: { kind: 'admin-token' } };
  }

  const userCheck = await checkSupabaseUser(token);
  if (userCheck) return userCheck;

  return { ok: false, status: 401, error: 'Niet ingelogd: ongeldige autorisatie' };
}

/**
 * WP-A4: verify a Supabase Auth JWT and check the email allowlist.
 * Returns null when the token is not a valid Supabase session (so static
 * token failures fall through to a uniform 401).
 */
async function checkSupabaseUser(token: string): Promise<AdminCheck | null> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const allowlist = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!url || !serviceKey || allowlist.length === 0) return null;

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, serviceKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return null;

  const email = data.user.email.toLowerCase();
  if (!allowlist.includes(email)) {
    return { ok: false, status: 403, error: 'Geen toegang: dit account is geen beheerder' };
  }
  return { ok: true, identity: { kind: 'user', email } };
}

/**
 * Guard for route handlers. Sends a 401/403 JSON response and returns null
 * when the request is not authorized; returns the identity otherwise.
 *
 *   const identity = await requireAdmin(req, res);
 *   if (!identity) return;
 */
export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<AdminIdentity | null> {
  const check = await checkAdmin(req);
  if (!check.ok) {
    res.status(check.status).json({ success: false, error: check.error });
    return null;
  }
  return check.identity;
}
