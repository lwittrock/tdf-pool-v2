/**
 * Paste-parser for stage results (pure, unit-tested).
 *
 * Turns a pasted block of text into an ordered top-N list of canonical
 * rider names. Accepts, per line:
 *   - a bare rider name in DB spelling ("TADEJ POGACAR")
 *   - a numbered line ("1. Tadej Pogacar", "1e TADEJ POGACAR")
 *   - a ProCyclingStats-style row ("1  POGAČAR Tadej  UAE Team Emirates - XRG  4:15:03")
 *
 * Matching is accent/case-insensitive and word-order-independent: a known
 * rider matches when all of their name tokens appear in the line. When
 * several riders match, the longest name wins; a genuine tie is treated as
 * unmatched (never guess). Header/empty lines are skipped; a line with
 * letters that matches nobody is kept verbatim so the admin sees and fixes
 * it — silently dropping a line would shift every position below it.
 */

import { foldedRiderNameKey } from './rider-names.js';

export interface ParsedResultLine {
  position: number;
  /** Canonical DB rider name when matched; the raw line text otherwise. */
  rider_name: string;
  matched: boolean;
  raw: string;
}

export interface ParseResultsOutcome {
  entries: ParsedResultLine[];
  /** Raw text of lines that contained content but matched no rider. */
  unmatched: string[];
}

const HEADER_LINE =
  /^\s*(rnk|rank|rider|renner|team|ploeg|uitslag|etappe|stage|points?|punten|bonis|bonus|time|tijd|gap|resultaten|pos\.?)\b/i;

function tokens(line: string): string[] {
  return foldedRiderNameKey(line)
    .replace(/[^A-Z' -]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 0);
}

export function parseResultsPaste(
  text: string,
  riderNames: string[],
  maxEntries = 20
): ParseResultsOutcome {
  const riders = riderNames.map((name) => ({
    name,
    tokens: tokens(name),
  }));

  const entries: ParsedResultLine[] = [];
  const unmatched: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    if (entries.length >= maxEntries) break;
    const line = rawLine.trim();
    if (!line || !/[A-Za-zÀ-ž]/.test(line)) continue;
    if (HEADER_LINE.test(line) && !/\d/.test(line.slice(0, 4))) continue;

    // Strip a leading rank ("1", "1.", "1e", "12)").
    const withoutRank = line.replace(/^\s*\d{1,3}\s*[.e)]?\s+/i, '');
    const lineTokens = new Set(tokens(withoutRank));
    if (lineTokens.size === 0) continue;

    const hits = riders.filter((r) => r.tokens.every((t) => lineTokens.has(t)));
    let best: { name: string } | null = null;
    if (hits.length === 1) {
      best = hits[0];
    } else if (hits.length > 1) {
      const sorted = hits.slice().sort((a, b) => b.tokens.length - a.tokens.length);
      if (sorted[0].tokens.length > sorted[1].tokens.length) best = sorted[0];
    }

    const position = entries.length + 1;
    if (best) {
      entries.push({ position, rider_name: best.name, matched: true, raw: line });
    } else {
      entries.push({ position, rider_name: withoutRank, matched: false, raw: line });
      unmatched.push(line);
    }
  }

  return { entries, unmatched };
}
