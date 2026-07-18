/**
 * Fetcher for ProCyclingStats pages.
 *
 * PCS sits behind Cloudflare bot protection (the procyclingstats python
 * package ships a cloudscraper fallback for exactly this), so a plain
 * datacenter fetch may be answered with a 403 or a "Just a moment…"
 * challenge page instead of content. Strategy:
 *
 *   1. direct fetch with browser-like headers (works ⇢ done);
 *   2. when PCS_FETCH_PROXY is set — a URL template containing `{url}`,
 *      e.g. a scraping-proxy endpoint — retry through it;
 *   3. otherwise fail with kind 'blocked' so callers can tell "PCS said no"
 *      apart from "PCS is down" and show the right message.
 */

export type PcsFetchFailureKind = 'blocked' | 'http' | 'network';

export class PcsFetchError extends Error {
  constructor(
    message: string,
    public readonly kind: PcsFetchFailureKind
  ) {
    super(message);
    this.name = 'PcsFetchError';
  }
}

// Full modern-Chrome header set: Cloudflare's cheaper bot checks score on
// header completeness (sec-ch-ua / sec-fetch), not just User-Agent.
// Verified 2026-07-18: Vercel egress IPs DO get blocked with a minimal
// header set — this fuller set is the first mitigation, PCS_FETCH_PROXY
// the reliable one.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.7,nl;q=0.5',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

function looksBlocked(status: number, body: string): boolean {
  if (status === 403 || status === 503) return true;
  return /just a moment|cf-browser-verification|challenge-platform/i.test(
    body.slice(0, 4000)
  );
}

async function fetchOnce(url: string, timeoutMs: number): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
  } catch (error: any) {
    throw new PcsFetchError(
      `Netwerkfout bij ophalen van ${url}: ${error?.message ?? error}`,
      'network'
    );
  }
  const body = await response.text();
  if (looksBlocked(response.status, body)) {
    throw new PcsFetchError(
      `PCS blokkeert dit verzoek (status ${response.status}, Cloudflare-challenge)`,
      'blocked'
    );
  }
  if (!response.ok) {
    throw new PcsFetchError(
      `PCS antwoordde met status ${response.status} voor ${url}`,
      'http'
    );
  }
  return body;
}

export async function fetchPcsPage(
  url: string,
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {}
): Promise<string> {
  try {
    return await fetchOnce(url, timeoutMs);
  } catch (error) {
    const proxyTemplate = process.env.PCS_FETCH_PROXY;
    const blocked = error instanceof PcsFetchError && error.kind === 'blocked';
    if (!proxyTemplate || !blocked) throw error;
    const proxied = proxyTemplate.replace('{url}', encodeURIComponent(url));
    return await fetchOnce(proxied, Math.max(timeoutMs, 30_000));
  }
}
