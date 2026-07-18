/**
 * Turns the raw PCS prefill payload (/api/admin/prefill-stage) into a stage
 * entry form patch (pure, unit-tested — the beheer UI applies it).
 *
 * Matching philosophy = the paste flow's: resolve what is certain, leave
 * the rest visibly unresolved for the admin. Top-20 rows that don't match
 * keep their raw PCS text in place (dropping them would shift positions);
 * single-value fields (jerseys, strijdlust, Dagploeg) stay empty with a
 * feedback line instead — an empty required field can't be saved unseen,
 * a silently wrong one could.
 *
 * Teams need their own matcher: the DB stores the pool-Excel's team
 * spellings ("UAE Team Emirates"), PCS its own ("UAE Team Emirates - XRG").
 * A pool team matches when all its tokens appear in the PCS name (or vice
 * versa); the largest token overlap wins, a tie never guesses.
 */

import { matchRiderName } from './parse-results.js';
import { foldedRiderNameKey } from './rider-names.js';

export interface PcsPrefillData {
  stage_number: number;
  top20: Array<{ position: number; rider: string; team: string }>;
  jerseys: {
    yellow: string | null;
    green: string | null;
    polka_dot: string | null;
    white: string | null;
  };
  abandons: Array<{ rider: string; status: 'DNF' | 'DNS' | 'OTL' | 'DSQ' }>;
  won_how: string | null;
  team_day_winner: string | null;
  combativity: string | null;
  warnings: string[];
}

export interface PrefillPatch {
  top_20_finishers: Array<{ rider_name: string; position: number }>;
  jerseys: { yellow: string; green: string; polka_dot: string; white: string };
  combativity: string;
  dagploeg: string;
  dnf_riders: string[];
  dns_riders: string[];
  won_how: string;
}

export interface PrefillOutcome {
  patch: PrefillPatch;
  /** Review notes for the admin, in form order. */
  feedback: string[];
  matchedCount: number;
}

function teamTokens(name: string): string[] {
  return foldedRiderNameKey(name)
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1); // drop connector scraps ("B", "&")
}

export function matchTeamName(raw: string, teamNames: string[]): string | null {
  const rawTokens = new Set(teamTokens(raw));
  if (rawTokens.size === 0) return null;
  let best: { name: string; overlap: number } | null = null;
  let tie = false;
  for (const name of teamNames) {
    const own = teamTokens(name);
    if (own.length === 0) continue;
    const contained = own.every((t) => rawTokens.has(t));
    const contains = [...rawTokens].every((t) => own.includes(t));
    if (!contained && !contains) continue;
    const overlap = own.filter((t) => rawTokens.has(t)).length;
    if (!best || overlap > best.overlap) {
      best = { name, overlap };
      tie = false;
    } else if (overlap === best.overlap && name !== best.name) {
      tie = true;
    }
  }
  return best && !tie ? best.name : null;
}

const JERSEY_LABELS: Record<keyof PcsPrefillData['jerseys'], string> = {
  yellow: 'gele trui',
  green: 'groene trui',
  polka_dot: 'bolletjestrui',
  white: 'witte trui',
};

export function buildPrefillPatch(
  data: PcsPrefillData,
  riders: Array<{ name: string; team?: string; aliases?: string[] }>
): PrefillOutcome {
  const riderNames = riders.map((r) => r.name);
  // Aliases (rider_aliases via riders-list) resolve spellings the token
  // matcher can't, e.g. PCS "GATE Aaron" vs DB "AARON MURRAY GATE".
  const aliasToCanonical = new Map<string, string>();
  for (const rider of riders) {
    for (const alias of rider.aliases ?? []) {
      if (!aliasToCanonical.has(alias)) aliasToCanonical.set(alias, rider.name);
    }
  }
  const resolveRider = (raw: string): string | null => {
    const direct = matchRiderName(raw, riderNames);
    if (direct) return direct;
    const viaAlias = matchRiderName(raw, [...aliasToCanonical.keys()]);
    return viaAlias ? (aliasToCanonical.get(viaAlias) ?? null) : null;
  };
  const teamNames = [
    ...new Set(
      riders
        .map((r) => r.team)
        .filter((t): t is string => Boolean(t) && t !== 'ONBEKEND')
    ),
  ];
  const feedback: string[] = [];
  let matchedCount = 0;

  const top_20_finishers = Array.from({ length: 20 }, (_, i) => {
    const row = data.top20[i];
    if (!row) return { rider_name: '', position: i + 1 };
    const matched = resolveRider(row.rider);
    if (matched) {
      matchedCount++;
    } else {
      feedback.push(`Positie ${i + 1}: "${row.rider}" niet herkend — controleer.`);
    }
    return { rider_name: matched ?? row.rider, position: i + 1 };
  });

  const jerseys = { yellow: '', green: '', polka_dot: '', white: '' };
  for (const key of Object.keys(JERSEY_LABELS) as Array<keyof typeof JERSEY_LABELS>) {
    const raw = data.jerseys[key];
    if (!raw) {
      feedback.push(`Geen ${JERSEY_LABELS[key]} gevonden op PCS.`);
      continue;
    }
    const matched = resolveRider(raw);
    if (matched) {
      jerseys[key] = matched;
    } else {
      feedback.push(`${JERSEY_LABELS[key]}: "${raw}" niet herkend.`);
    }
  }

  let combativity = '';
  if (data.combativity) {
    const matched = resolveRider(data.combativity);
    if (matched) {
      combativity = matched;
    } else {
      feedback.push(`Strijdlust: "${data.combativity}" niet herkend.`);
    }
  }

  let dagploeg = '';
  if (data.team_day_winner) {
    const matched = matchTeamName(data.team_day_winner, teamNames);
    if (matched) {
      dagploeg = matched;
    } else {
      feedback.push(`Dagploeg: "${data.team_day_winner}" niet herkend als poolploeg.`);
    }
  }

  const dnf_riders: string[] = [];
  const dns_riders: string[] = [];
  for (const abandon of data.abandons) {
    const matched = resolveRider(abandon.rider);
    if (!matched) {
      feedback.push(`Opgave (${abandon.status}): "${abandon.rider}" niet herkend.`);
      continue;
    }
    // Pool rule mirrors PCS statuses: DNS = missed the start (reserve from
    // this stage); DNF/OTL/DSQ = left during the stage (reserve from the
    // next stage) — lib/scoring.ts.
    if (abandon.status === 'DNS') {
      dns_riders.push(matched);
    } else {
      dnf_riders.push(matched);
    }
  }

  return {
    patch: {
      top_20_finishers,
      jerseys,
      combativity,
      dagploeg,
      dnf_riders,
      dns_riders,
      won_how: data.won_how ?? '',
    },
    feedback,
    matchedCount,
  };
}
