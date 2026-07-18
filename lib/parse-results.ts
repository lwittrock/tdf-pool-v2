/**
 * Paste-parser for stage results (pure, unit-tested).
 *
 * Turns a pasted block of text into an ordered top-N list of canonical
 * rider names. Built for the three real input shapes:
 *   - bare rider names, one per line ("TADEJ POGACAR")
 *   - numbered lines ("1. Tadej Pogacar", "1e TADEJ POGACAR")
 *   - a copied ProCyclingStats results table, which in practice is messy:
 *     ranks and names sometimes on separate lines, the team on its own
 *     line, mixed-case names ("del Toro Isaac"), nav junk above the table.
 *
 * Rules:
 *   - Matching is accent/case-insensitive and word-order-independent: a
 *     rider matches when all of their name tokens appear in the line. On
 *     multiple matches the longest name wins; a genuine tie never guesses.
 *   - A line with a leading rank number is a result row: it either matches
 *     a rider or stays visible as an unmatched entry (silently dropping it
 *     would shift every position below it).
 *   - An un-numbered line only becomes an entry when it matches a rider
 *     (bare-name lists, or PCS names split from their rank). Anything else
 *     (team names, headers, times, nav junk) is ignored but reported.
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
  /** Numbered lines that matched no rider (occupy a position; fix by hand). */
  unmatched: string[];
  /** Ignored non-rider lines (headers, teams, junk) — for the feedback text. */
  ignored: string[];
}

/** Leading rank: "1", "1.", "1e", "12)" — 1 to 3 digits only. */
const LEADING_RANK = /^\s*(\d{1,3})\s*[.e)]?(\s+|$)/i;

function tokens(line: string): string[] {
  return foldedRiderNameKey(line)
    .replace(/[^A-Z' -]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 0);
}

function matchTokens(
  riders: Array<{ name: string; tokens: string[] }>,
  lineTokens: Set<string>
): string | null {
  const hits = riders.filter((r) => r.tokens.every((t) => lineTokens.has(t)));
  if (hits.length === 1) return hits[0].name;
  if (hits.length > 1) {
    const sorted = hits.slice().sort((a, b) => b.tokens.length - a.tokens.length);
    if (sorted[0].tokens.length > sorted[1].tokens.length) return sorted[0].name;
  }
  return null;
}

/**
 * Resolves one piece of free text (a PCS rider cell, a pasted name) to a
 * canonical DB rider name — same rules as the paste parser: all name tokens
 * must appear, longest match wins, a genuine tie never guesses.
 */
export function matchRiderName(text: string, riderNames: string[]): string | null {
  const lineTokens = new Set(tokens(text));
  if (lineTokens.size === 0) return null;
  return matchTokens(
    riderNames.map((name) => ({ name, tokens: tokens(name) })),
    lineTokens
  );
}

export function parseResultsPaste(
  text: string,
  riderNames: string[],
  maxEntries = 20
): ParseResultsOutcome {
  const riders = riderNames.map((name) => ({ name, tokens: tokens(name) }));

  const entries: ParsedResultLine[] = [];
  const unmatched: string[] = [];
  const ignored: string[] = [];

  const matchRider = (lineTokens: Set<string>): string | null =>
    matchTokens(riders, lineTokens);

  for (const rawLine of text.split(/\r?\n/)) {
    if (entries.length >= maxEntries) break;
    const line = rawLine.trim();
    if (!line || !/[A-Za-zÀ-ž]/.test(line)) continue; // empty, ranks alone, times

    const rankMatch = LEADING_RANK.exec(line);
    const content = rankMatch ? line.slice(rankMatch[0].length) : line;
    const lineTokens = new Set(tokens(content));
    const rider = lineTokens.size > 0 ? matchRider(lineTokens) : null;

    if (rider) {
      entries.push({ position: entries.length + 1, rider_name: rider, matched: true, raw: line });
    } else if (rankMatch && lineTokens.size > 0) {
      // A numbered row that resolves to nobody is a real problem — keep it
      // visible in its position instead of shifting everything below it.
      entries.push({
        position: entries.length + 1,
        rider_name: content.trim(),
        matched: false,
        raw: line,
      });
      unmatched.push(line);
    } else {
      ignored.push(line);
    }
  }

  return { entries, unmatched, ignored };
}
