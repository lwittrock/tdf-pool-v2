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

import { createRiderMatcher } from './parse-results.js';
import { foldedRiderNameKey } from './rider-names.js';

export interface PcsPrefillData {
  stage_number: number;
  top20: Array<{ position: number; rank?: number; rider: string; team: string }>;
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
  /** `matched: false` rows carry raw PCS text — appliers must not let
   *  them overwrite a value the admin already filled in by hand. */
  top_20_finishers: Array<{ rider_name: string; position: number; matched: boolean }>;
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
  const matchDirect = createRiderMatcher(riderNames);
  const matchAlias = createRiderMatcher([...aliasToCanonical.keys()]);
  const resolveRider = (raw: string): string | null => {
    const direct = matchDirect(raw);
    if (direct) return direct;
    const viaAlias = matchAlias(raw);
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
    if (!row) return { rider_name: '', position: i + 1, matched: false };
    const matched = resolveRider(row.rider);
    if (matched) {
      matchedCount++;
    } else {
      feedback.push(`Positie ${i + 1}: "${row.rider}" niet herkend — controleer.`);
    }
    return { rider_name: matched ?? row.rider, position: i + 1, matched: matched !== null };
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

/** The form fields the prefill touches (structural subset of the form). */
export interface PrefillableFields {
  top_20_finishers: Array<{ rider_name: string; position: number }>;
  jerseys: { yellow: string; green: string; polka_dot: string; white: string };
  combativity: string;
  dagploeg: string;
  dnf_riders: string[];
  dns_riders: string[];
  won_how: string;
}

const FIELD_LABELS: Array<[key: 'combativity' | 'dagploeg', label: string]> = [
  ['combativity', 'Strijdlust'],
  ['dagploeg', 'Dagploeg'],
];

/**
 * Merge a prefill patch into the current form (pure — the UI applies the
 * result). The contract with the admin: a re-tap refreshes PCS data but
 * NEVER silently discards something they entered or corrected by hand.
 *
 *   - top-20: matched names land (PCS corrections should flow through);
 *     unmatched raw text only fills empty slots.
 *   - single-value fields (jerseys, strijdlust, Dagploeg, won how): fill
 *     when empty; when the form already holds a different value, keep it
 *     and surface the difference as a note instead of overwriting.
 *   - DNF/DNS: PCS's list replaces the form's when PCS reports any
 *     abandons (so a corrected false abandon disappears on re-tap), with
 *     a note for every removed name; when PCS reports none, the form's
 *     lists stay untouched.
 */
export function mergePrefillIntoForm(
  prev: PrefillableFields,
  patch: PrefillPatch
): { fields: PrefillableFields; notes: string[] } {
  const notes: string[] = [];

  const single = (label: string, prevValue: string, patchValue: string): string => {
    if (!patchValue) return prevValue;
    if (!prevValue.trim()) return patchValue;
    if (prevValue.trim() !== patchValue) {
      notes.push(`${label}: PCS zegt "${patchValue}", formulier houdt "${prevValue}".`);
    }
    return prevValue;
  };

  const jerseys = {
    yellow: single('Gele trui', prev.jerseys.yellow, patch.jerseys.yellow),
    green: single('Groene trui', prev.jerseys.green, patch.jerseys.green),
    polka_dot: single('Bolletjestrui', prev.jerseys.polka_dot, patch.jerseys.polka_dot),
    white: single('Witte trui', prev.jerseys.white, patch.jerseys.white),
  };

  const fields: PrefillableFields = {
    top_20_finishers: prev.top_20_finishers.map((f, i) => {
      const p = patch.top_20_finishers[i];
      const take = p && p.rider_name && (p.matched || !f.rider_name.trim());
      return take ? { rider_name: p.rider_name, position: i + 1 } : f;
    }),
    jerseys,
    combativity: prev.combativity,
    dagploeg: prev.dagploeg,
    won_how: single('Gewonnen door', prev.won_how, patch.won_how),
    dnf_riders: prev.dnf_riders,
    dns_riders: prev.dns_riders,
  };
  for (const [key, label] of FIELD_LABELS) {
    fields[key] = single(label, prev[key], patch[key]);
  }

  if (patch.dnf_riders.length + patch.dns_riders.length > 0) {
    const kept = new Set([...patch.dnf_riders, ...patch.dns_riders]);
    for (const name of [...prev.dnf_riders, ...prev.dns_riders]) {
      if (!kept.has(name)) {
        notes.push(`Opgave verwijderd (niet meer op PCS): ${name} — controleer.`);
      }
    }
    fields.dnf_riders = patch.dnf_riders;
    fields.dns_riders = patch.dns_riders;
  }

  return { fields, notes };
}
