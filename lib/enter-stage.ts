/**
 * Atomic stage entry (WP-A2).
 *
 * One flow: fully validate → log raw payload (also when rejected) →
 * transactional swap via the replace_stage_data RPC → recalculate →
 * regenerate → publish. An invalid payload changes nothing in the database
 * (the old flow deleted the stage's rows before validating — fact 4).
 */

import { getServiceClient } from './supabase-server.js';
import { processStage, type ProcessStageResult } from './pipeline.js';
import { riderNameKey } from './rider-names.js';
import type { ManualStageEntry, DNFStatus, JerseyType } from './types.js';

export interface RiderRecord {
  id: string;
  name: string;
  team: string;
}

export interface RiderAlias {
  alias: string;
  rider_id: string;
}

export interface ValidatedEntry {
  results: Array<{ rider_id: string; position: number; time_gap: string | null }>;
  jerseys: Array<{ jersey_type: JerseyType; rider_id: string }>;
  combativityRiderId: string | null;
  dnf: Array<{ rider_id: string; status: DNFStatus }>;
  winningTeam: string;
  /** Canonical team spelling of the Dagploeg (team day classification winner). */
  dagploeg: string | null;
  warnings: string[];
}

export type ValidationResult =
  | { ok: true; value: ValidatedEntry }
  | { ok: false; errors: string[] };

const JERSEY_LABELS_NL: Record<JerseyType, string> = {
  yellow: 'gele trui',
  green: 'groene trui',
  polka_dot: 'bolletjestrui',
  white: 'witte trui',
};

/**
 * Pure validation: everything must resolve before anything is written.
 * An unrecognized rider name is a blocking error, never a silent skip
 * (the old flow only warned — and the UI discarded the warnings, fact 5).
 * Aliases (rider_aliases table) resolve alternative spellings to their
 * canonical rider row (WP-B1).
 */
export function validateStageEntry(
  entry: ManualStageEntry,
  riders: RiderRecord[],
  aliases: RiderAlias[] = []
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const riderById = new Map(riders.map((r) => [r.id, r]));
  const riderByKey = new Map(riders.map((r) => [riderNameKey(r.name), r]));
  for (const alias of aliases) {
    const rider = riderById.get(alias.rider_id);
    if (rider && !riderByKey.has(riderNameKey(alias.alias))) {
      riderByKey.set(riderNameKey(alias.alias), rider);
    }
  }
  const resolve = (name: string): RiderRecord | undefined => riderByKey.get(riderNameKey(name));

  if (!Number.isInteger(entry.stage_number) || entry.stage_number < 1 || entry.stage_number > 21) {
    errors.push('Etappenummer moet tussen 1 en 21 liggen');
  }

  // --- Finishers ------------------------------------------------------------
  const finishers = (entry.top_20_finishers ?? []).filter((f) => f.rider_name?.trim());
  if (finishers.length === 0) {
    errors.push('De uitslag is leeg: voer minimaal de winnaar in');
  }
  if (finishers.length < 20 && finishers.length > 0) {
    warnings.push(`Uitslag bevat ${finishers.length} van 20 renners`);
  }

  const seenPositions = new Set<number>();
  const seenRiderIds = new Set<string>();
  const results: ValidatedEntry['results'] = [];
  for (const finisher of finishers) {
    if (!Number.isInteger(finisher.position) || finisher.position < 1 || finisher.position > 20) {
      errors.push(`Ongeldige positie ${finisher.position} voor ${finisher.rider_name}`);
      continue;
    }
    if (seenPositions.has(finisher.position)) {
      errors.push(`Positie ${finisher.position} komt twee keer voor in de uitslag`);
    }
    seenPositions.add(finisher.position);

    const rider = resolve(finisher.rider_name);
    if (!rider) {
      errors.push(`Renner niet gevonden in de uitslag: "${finisher.rider_name}"`);
      continue;
    }
    if (seenRiderIds.has(rider.id)) {
      errors.push(`${rider.name} staat twee keer in de uitslag`);
    }
    seenRiderIds.add(rider.id);
    results.push({
      rider_id: rider.id,
      position: finisher.position,
      time_gap: finisher.time_gap || null,
    });
  }

  // --- Jerseys ---------------------------------------------------------------
  const jerseys: ValidatedEntry['jerseys'] = [];
  for (const jerseyType of ['yellow', 'green', 'polka_dot', 'white'] as JerseyType[]) {
    const name = entry.jerseys?.[jerseyType];
    if (!name?.trim()) {
      errors.push(`Drager van de ${JERSEY_LABELS_NL[jerseyType]} ontbreekt`);
      continue;
    }
    const rider = resolve(name);
    if (!rider) {
      errors.push(`Renner niet gevonden voor de ${JERSEY_LABELS_NL[jerseyType]}: "${name}"`);
      continue;
    }
    jerseys.push({ jersey_type: jerseyType, rider_id: rider.id });
  }

  // --- Combativity (optional — fixtures prove it can be absent) --------------
  let combativityRiderId: string | null = null;
  if (entry.combativity?.trim()) {
    const rider = resolve(entry.combativity);
    if (!rider) {
      errors.push(`Renner niet gevonden voor strijdlust: "${entry.combativity}"`);
    } else {
      combativityRiderId = rider.id;
    }
  } else {
    warnings.push('Geen strijdlustigste renner ingevoerd');
  }

  // --- DNF/DNS ----------------------------------------------------------------
  const dnf: ValidatedEntry['dnf'] = [];
  const outRiderIds = new Set<string>();
  const addCasualties = (names: string[] | undefined, status: DNFStatus) => {
    for (const name of names ?? []) {
      if (!name?.trim()) continue;
      const rider = resolve(name);
      if (!rider) {
        errors.push(`Renner niet gevonden bij uitvallers (${status}): "${name}"`);
        continue;
      }
      if (outRiderIds.has(rider.id)) {
        errors.push(`${rider.name} staat twee keer bij de uitvallers`);
        continue;
      }
      outRiderIds.add(rider.id);
      if (status === 'DNS' && seenRiderIds.has(rider.id)) {
        errors.push(`${rider.name} staat in de uitslag én bij DNS — dat kan niet allebei`);
      }
      dnf.push({ rider_id: rider.id, status });
    }
  };
  addCasualties(entry.dnf_riders, 'DNF');
  addCasualties(entry.dns_riders, 'DNS');

  // --- Winning team (R1: derived from the position-1 finisher) ---------------
  const winner = finishers.find((f) => f.position === 1);
  const winnerRider = winner ? resolve(winner.rider_name) : undefined;
  if (!winnerRider && finishers.length > 0) {
    errors.push('Geen winnaar (positie 1) in de uitslag');
  }

  // --- Dagploeg (WP-B1: team day classification winner, +6 rule) -------------
  // Optional — some stages have no team day winner. When provided it must
  // match a known team spelling, so the +6 comparison against the
  // participants' Ploeg picks can never silently miss on a typo.
  let dagploeg: string | null = null;
  if (entry.dagploeg?.trim()) {
    const teamByKey = new Map(
      riders.filter((r) => r.team && r.team !== 'ONBEKEND').map((r) => [riderNameKey(r.team), r.team])
    );
    const match = teamByKey.get(riderNameKey(entry.dagploeg));
    if (!match) {
      errors.push(`Onbekende ploeg voor de dagploeg: "${entry.dagploeg}"`);
    } else {
      dagploeg = match;
    }
  } else {
    warnings.push('Geen dagploeg ingevoerd (geen +6 voor deze etappe)');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      results,
      jerseys,
      combativityRiderId,
      dnf,
      winningTeam: winnerRider!.team,
      dagploeg,
      warnings,
    },
  };
}

export type EnterStageResult =
  | {
      ok: true;
      stageNumber: number;
      winningTeam: string;
      warnings: string[];
      process: ProcessStageResult;
    }
  | { ok: false; status: number; errors: string[] };

export async function enterStage(
  entry: ManualStageEntry,
  submittedBy: string
): Promise<EnterStageResult> {
  const supabase = getServiceClient();

  const { data: riders, error: ridersError } = await supabase
    .from('riders')
    .select('id, name, team');
  if (ridersError || !riders) {
    throw new Error(`Renners laden mislukt: ${ridersError?.message}`);
  }

  // Aliases are optional infrastructure (phase-b1.sql); tolerate absence.
  const { data: aliases, error: aliasError } = await supabase
    .from('rider_aliases')
    .select('alias, rider_id');
  if (aliasError) {
    console.error('[Enter Stage] rider_aliases niet beschikbaar:', aliasError.message);
  }

  const validation = validateStageEntry(entry, riders, aliases ?? []);

  // Audit trail first — also (especially) for rejected payloads.
  const { error: logError } = await supabase.from('stage_entry_log').insert({
    stage_number: entry.stage_number ?? 0,
    payload: entry as unknown as Record<string, unknown>,
    submitted_by: submittedBy,
    accepted: validation.ok,
    errors: validation.ok ? null : validation.errors,
  });
  if (logError) {
    // Never block a live-Tour entry on the audit log, but make it visible.
    console.error('[Enter Stage] stage_entry_log insert failed:', logError.message);
  }

  if (!validation.ok) {
    return { ok: false, status: 400, errors: validation.errors };
  }

  // Refuse to overwrite a processed stage unless explicitly forced.
  const { data: existingStage } = await supabase
    .from('stages')
    .select('id, is_complete')
    .eq('stage_number', entry.stage_number)
    .maybeSingle();
  if (existingStage?.is_complete && !entry.force) {
    return {
      ok: false,
      status: 409,
      errors: [
        `Etappe ${entry.stage_number} is al verwerkt. Verstuur opnieuw met bevestiging om te overschrijven.`,
      ],
    };
  }

  // Upsert stage metadata — only the fields actually provided, so a
  // results-only re-entry can never null out existing metadata (R10).
  const stageRow: Record<string, unknown> = {
    stage_number: entry.stage_number,
    is_complete: false,
  };
  if (entry.date) stageRow.date = entry.date;
  if (entry.distance) stageRow.distance = entry.distance;
  if (entry.departure_city) stageRow.departure_city = entry.departure_city;
  if (entry.arrival_city) stageRow.arrival_city = entry.arrival_city;
  if (entry.stage_type) stageRow.stage_type = entry.stage_type;
  if (entry.difficulty) stageRow.difficulty = entry.difficulty;
  if (entry.won_how) stageRow.won_how = entry.won_how;
  if (validation.value.dagploeg) stageRow.dagploeg = validation.value.dagploeg;

  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .upsert(stageRow, { onConflict: 'stage_number' })
    .select('id')
    .single();
  if (stageError || !stage) {
    throw new Error(`Etappe opslaan mislukt: ${stageError?.message}`);
  }

  // Transactional swap: delete + insert inside one Postgres function (R7).
  const v = validation.value;
  const { error: swapError } = await supabase.rpc('replace_stage_data', {
    p_stage_id: stage.id,
    p_results: v.results,
    p_jerseys: v.jerseys,
    p_combativity_rider: v.combativityRiderId,
    p_dnf: v.dnf,
    p_winning_team: v.winningTeam,
  });
  if (swapError) {
    throw new Error(`Uitslag wegschrijven mislukt: ${swapError.message}`);
  }

  const process = await processStage(entry.stage_number);

  return {
    ok: true,
    stageNumber: entry.stage_number,
    winningTeam: v.winningTeam,
    warnings: v.warnings,
    process,
  };
}
