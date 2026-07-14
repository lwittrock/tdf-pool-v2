/**
 * Stage-processing pipeline as a plain library (WP-A2, internals WP-B2).
 *
 * Replaces the browser-orchestrated chain manual-entry → process-stage →
 * (HTTP self-fetch) update-active-selections + calculate-points. Everything
 * here is a direct function call; one authenticated route (enter-stage)
 * drives it.
 *
 * WP-B2: all inputs are fetched in a handful of paginated bulk queries and
 * computed in memory (the v1-ported N+1 loops took ~7 minutes per stage by
 * stage 9 and — worse — un-ranged selects silently truncate at PostgREST's
 * 1000-row cap, which dropped ~400 of the 1405 selection rows from scoring).
 * Cumulative totals and overall ranks are recomputed for EVERY completed
 * stage on each run, so reprocessing an old stage ripples forward by itself.
 */

import { getServiceClient, fetchAll } from './supabase-server.js';
import {
  computeRiderStagePoints,
  computeParticipantStagePoints,
  dagploegBonus,
  deriveRosterStamps,
  RESERVE_ACTIVATES_MID_TOUR,
  type SelectionInput,
  type StageJerseyInput,
} from './scoring.js';
import {
  generateMetadataJSON,
  generateLeaderboardsJSON,
  generateRidersJSON,
  generateStagesDataJSON,
  generateTeamSelectionsJSON,
  generateRiderRankingsJSON,
} from './json-generators.js';
import { publishSnapshots, type PublishResult } from './publish.js';
import type { SubstitutionMade } from './types.js';

export interface UpdateSelectionsResult {
  dnsRiders: string[];
  substitutions: SubstitutionMade[];
  participantsAffected: number;
}

export interface ProcessStageResult {
  stageNumber: number;
  selections: UpdateSelectionsResult;
  runId: string;
  pointerUrl: string;
}

async function getStageId(stageNumber: number): Promise<string> {
  const supabase = getServiceClient();
  const { data: stage, error } = await supabase
    .from('stages')
    .select('id')
    .eq('stage_number', stageNumber)
    .single();
  if (error || !stage) {
    throw new Error(`Etappe ${stageNumber} niet gevonden`);
  }
  return stage.id;
}

/**
 * Reconcile every participant's substitution stamps against the FULL
 * stage_dnf history (finding 5). The rules themselves (casualty stage,
 * at most one substitution, pre-race activations) live in
 * scoring.deriveRosterStamps — the golden suite replays the same function.
 *
 * Incremental stamping was write-only: re-entering a stage without the
 * DNS/DNF left the substitution in place. Deriving the desired stamps from
 * scratch on every run and diffing against the stored rows also CLEARS
 * stamps whose casualty was retracted. Reserve rows stamped 1 (pre-race
 * activations from the golden import — no stage_dnf backing) are never
 * touched.
 *
 * stageNumber only scopes the report (dnsRiders/substitutions for the entry
 * UI); the reconciliation itself always covers all stages.
 */
export async function updateActiveSelections(stageNumber: number): Promise<UpdateSelectionsResult> {
  const supabase = getServiceClient();
  await getStageId(stageNumber); // fail early on an unknown stage

  if (!RESERVE_ACTIVATES_MID_TOUR && stageNumber > 1) {
    return { dnsRiders: [], substitutions: [], participantsAffected: 0 };
  }

  const [{ data: stages }, { data: dnfRows }, { data: riders }, { data: participants }] =
    await Promise.all([
      supabase.from('stages').select('id, stage_number'),
      supabase.from('stage_dnf').select('stage_id, rider_id, status'),
      supabase.from('riders').select('id, name'),
      supabase.from('participants').select('id, name'),
    ]);
  if (!participants) throw new Error('Deelnemers laden mislukt');
  const stageNumberById = new Map((stages ?? []).map((s) => [s.id, s.stage_number]));
  const riderNameById = new Map((riders ?? []).map((r) => [r.id, r.name]));
  const participantNameById = new Map(participants.map((p) => [p.id, p.name]));

  // DNS'd riders drop out from their DNS stage; DNF/OTL/DSQ'd riders from
  // the stage after (owner ruling July 14 2026, supersedes DNS-only Q3/Q20).
  const casualtiesByStage = new Map<number, Set<string>>();
  for (const row of dnfRows ?? []) {
    const recordedAt = stageNumberById.get(row.stage_id);
    if (recordedAt == null) continue;
    const effectiveStage = row.status === 'DNS' ? recordedAt : recordedAt + 1;
    const set = casualtiesByStage.get(effectiveStage) ?? new Set<string>();
    set.add(row.rider_id);
    casualtiesByStage.set(effectiveStage, set);
  }

  interface SelectionRow {
    id: string;
    participant_id: string;
    rider_id: string;
    position: number;
    replaced_at_stage: number | null;
    replacement_for_rider_id: string | null;
  }
  const selectionRows = await fetchAll<SelectionRow>((from, to) =>
    supabase
      .from('participant_rider_selections')
      .select('id, participant_id, rider_id, position, replaced_at_stage, replacement_for_rider_id')
      .order('id')
      .range(from, to)
  );
  const rowsByParticipant = new Map<string, SelectionRow[]>();
  for (const row of selectionRows) {
    const list = rowsByParticipant.get(row.participant_id) ?? [];
    list.push(row);
    rowsByParticipant.set(row.participant_id, list);
  }

  const dnsRiderNames = [...(casualtiesByStage.get(stageNumber) ?? [])].map(
    (riderId) => riderNameById.get(riderId) ?? 'Onbekend'
  );

  const substitutions: SubstitutionMade[] = [];
  const affectedParticipants = new Set<string>();

  for (const [participantId, rows] of rowsByParticipant) {
    const { stampByPosition, substitution } = deriveRosterStamps(rows, casualtiesByStage);

    if (substitution && substitution.stageNumber === stageNumber) {
      substitutions.push({
        participant_name: participantNameById.get(participantId) ?? 'Onbekend',
        rider_out: riderNameById.get(substitution.riderOut) ?? 'Onbekend',
        rider_in: riderNameById.get(substitution.riderIn) ?? 'Onbekend',
      });
    }

    for (const row of rows) {
      const isReserve = row.position === 11;
      if (isReserve && row.replaced_at_stage === 1) continue; // pre-race activation: immutable
      const desiredStamp = stampByPosition.get(row.position) ?? null;
      const desiredReplacementFor = isReserve ? (substitution?.riderOut ?? null) : null;
      const stampChanged = row.replaced_at_stage !== desiredStamp;
      const replacementChanged = isReserve && row.replacement_for_rider_id !== desiredReplacementFor;
      if (!stampChanged && !replacementChanged) continue;

      const { error: updateError } = await supabase
        .from('participant_rider_selections')
        .update({
          replaced_at_stage: desiredStamp,
          is_active: isReserve ? desiredStamp != null : desiredStamp == null,
          ...(isReserve ? { replacement_for_rider_id: desiredReplacementFor } : {}),
        })
        .eq('id', row.id);
      if (updateError) throw new Error(`Selectie bijwerken mislukt: ${updateError.message}`);
      affectedParticipants.add(participantId);
    }
  }

  return { dnsRiders: dnsRiderNames, substitutions, participantsAffected: affectedParticipants.size };
}

/**
 * Calculate and persist rider + participant points for one stage, then
 * cumulative totals and overall ranks for EVERY completed stage (WP-B2:
 * bulk fetches + in-memory computation; the pure rules live in scoring.ts).
 */
export async function calculatePointsForStage(stageNumber: number): Promise<void> {
  const supabase = getServiceClient();
  const stageId = await getStageId(stageNumber);

  // ---- Inputs (bulk) --------------------------------------------------------
  const [
    { data: stageResults },
    { data: jerseys },
    { data: combativity },
    { data: participants },
    { data: stageRow },
  ] = await Promise.all([
    supabase.from('stage_results').select('rider_id, position').eq('stage_id', stageId).order('position'),
    supabase.from('stage_jerseys').select('rider_id, jersey_type').eq('stage_id', stageId),
    supabase.from('stage_combativity').select('rider_id').eq('stage_id', stageId).maybeSingle(),
    supabase.from('participants').select('id, name, ploeg').order('id'),
    supabase.from('stages').select('dagploeg').eq('id', stageId).maybeSingle(),
  ]);
  if (!participants) throw new Error('Deelnemers laden mislukt');
  const stageDagploeg: string | null = stageRow?.dagploeg ?? null;

  const allSelections = await fetchAll<SelectionInput>((from, to) =>
    supabase
      .from('participant_rider_selections')
      .select('participant_id, rider_id, position, replaced_at_stage')
      .order('id')
      .range(from, to)
  );

  // ---- Rider points (pure core: lib/scoring.ts) -----------------------------
  const riderPointsMap = computeRiderStagePoints(
    stageResults ?? [],
    (jerseys ?? []) as StageJerseyInput[],
    combativity?.rider_id ?? null
  );

  const riderInserts = [...riderPointsMap.entries()]
    .sort(([, a], [, b]) => b.total_points - a.total_points)
    .map(([riderId, p], index) => ({
      stage_id: stageId,
      rider_id: riderId,
      ...p,
      stage_rank: index + 1,
    }));

  {
    const { error } = await supabase.from('rider_stage_points').delete().eq('stage_id', stageId);
    if (error) throw new Error(`Rennerpunten wissen mislukt: ${error.message}`);
  }
  if (riderInserts.length > 0) {
    const { error } = await supabase.from('rider_stage_points').insert(riderInserts);
    if (error) throw new Error(`Rennerpunten opslaan mislukt: ${error.message}`);
  }

  // ---- Participant points for this stage (roster-as-of-stage, WP-A3) --------
  const participantPointsMap = computeParticipantStagePoints(
    riderPointsMap,
    allSelections,
    stageNumber
  );
  // Participants without any selection row still get a 0-point row.
  for (const participant of participants) {
    if (!participantPointsMap.has(participant.id)) {
      participantPointsMap.set(participant.id, { total_points: 0, contributions: new Map() });
    }
  }

  // Dagploeg +6 (WP-B1): the participant's Ploeg pick won the stage's team
  // day classification. Included in stage_points (like the sheet does), not
  // in the per-rider contributions.
  for (const participant of participants) {
    const bonus = dagploegBonus((participant as { ploeg?: string | null }).ploeg, stageDagploeg);
    if (bonus > 0) {
      participantPointsMap.get(participant.id)!.total_points += bonus;
    }
  }

  // ---- Cumulative totals + overall ranks for every completed stage ----------
  // The stage being processed counts regardless of is_complete (processStage
  // only marks it complete after this runs). Every completed stage is
  // recomputed from stored stage_points, so a corrected old stage ripples
  // forward without manually reprocessing the later ones.
  const { data: allStages } = await supabase
    .from('stages')
    .select('id, stage_number, is_complete')
    .order('stage_number');
  if (!allStages) throw new Error('Etappes laden mislukt');
  const countingStages = allStages.filter(
    (s) => s.is_complete || s.stage_number === stageNumber
  );

  interface PspRow {
    id: string;
    participant_id: string;
    stage_id: string;
    stage_points: number;
    cumulative_points: number;
    overall_rank: number | null;
    overall_rank_change: number | null;
  }
  const existingRows = await fetchAll<PspRow>((from, to) =>
    supabase
      .from('participant_stage_points')
      .select('id, participant_id, stage_id, stage_points, cumulative_points, overall_rank, overall_rank_change')
      .order('id')
      .range(from, to)
  );
  const rowsByStage = new Map<string, Map<string, PspRow>>();
  for (const row of existingRows) {
    if (row.stage_id === stageId) continue; // being recomputed
    let stageRows = rowsByStage.get(row.stage_id);
    if (!stageRows) rowsByStage.set(row.stage_id, (stageRows = new Map()));
    stageRows.set(row.participant_id, row);
  }

  // stage_points per participant per counting stage (fresh for the current one)
  const pointsFor = (stage: { id: string }, participantId: string): number =>
    stage.id === stageId
      ? participantPointsMap.get(participantId)?.total_points ?? 0
      : rowsByStage.get(stage.id)?.get(participantId)?.stage_points ?? 0;

  const cumulative = new Map<string, number>();
  const overallRanks = new Map<string, Map<string, number>>(); // stage_id → participant → rank
  const cumulativeByStage = new Map<string, Map<string, number>>();
  for (const stage of countingStages) {
    const stageCumulative = new Map<string, number>();
    for (const participant of participants) {
      const total = (cumulative.get(participant.id) ?? 0) + pointsFor(stage, participant.id);
      cumulative.set(participant.id, total);
      stageCumulative.set(participant.id, total);
    }
    cumulativeByStage.set(stage.id, stageCumulative);
    const ranked = [...stageCumulative.entries()].sort((a, b) => b[1] - a[1]);
    overallRanks.set(stage.id, new Map(ranked.map(([pid], index) => [pid, index + 1])));
  }

  // ---- Write the recomputed current stage ------------------------------------
  const stageIndex = countingStages.findIndex((s) => s.id === stageId);
  const previousStage = stageIndex > 0 ? countingStages[stageIndex - 1] : null;
  const stageRanked = [...participantPointsMap.entries()].sort(
    (a, b) => b[1].total_points - a[1].total_points
  );
  const stageRankByParticipant = new Map(stageRanked.map(([pid], index) => [pid, index + 1]));

  const currentRows = participants.map((participant) => {
    const currentRank = overallRanks.get(stageId)?.get(participant.id) ?? null;
    const previousRank = previousStage
      ? rowsByStage.get(previousStage.id)?.get(participant.id)?.overall_rank ?? null
      : null;
    return {
      stage_id: stageId,
      participant_id: participant.id,
      stage_points: participantPointsMap.get(participant.id)?.total_points ?? 0,
      stage_rank: stageRankByParticipant.get(participant.id) ?? null,
      cumulative_points: cumulativeByStage.get(stageId)?.get(participant.id) ?? 0,
      overall_rank: currentRank,
      overall_rank_change:
        currentRank != null && previousRank != null ? previousRank - currentRank : null,
    };
  });

  {
    const { error } = await supabase.from('participant_stage_points').delete().eq('stage_id', stageId);
    if (error) throw new Error(`Deelnemerspunten wissen mislukt: ${error.message}`);
  }
  {
    const { error } = await supabase.from('participant_stage_points').insert(currentRows);
    if (error) throw new Error(`Deelnemerspunten opslaan mislukt: ${error.message}`);
  }

  // ---- Ripple: repair cumulative/rank fields of OTHER stages if changed ------
  const corrections: Array<Record<string, unknown>> = [];
  for (const stage of countingStages) {
    if (stage.id === stageId) continue;
    const stageRows = rowsByStage.get(stage.id);
    if (!stageRows) continue;
    const prevIndex = countingStages.findIndex((s) => s.id === stage.id) - 1;
    const prev = prevIndex >= 0 ? countingStages[prevIndex] : null;
    for (const row of stageRows.values()) {
      const cum = cumulativeByStage.get(stage.id)?.get(row.participant_id) ?? 0;
      const rank = overallRanks.get(stage.id)?.get(row.participant_id) ?? null;
      const prevRank = prev
        ? prev.id === stageId
          ? overallRanks.get(stageId)?.get(row.participant_id) ?? null
          : rowsByStage.get(prev.id)?.get(row.participant_id)?.overall_rank ?? null
        : null;
      const change = rank != null && prevRank != null ? prevRank - rank : row.overall_rank_change;
      if (
        row.cumulative_points !== cum ||
        row.overall_rank !== rank ||
        row.overall_rank_change !== change
      ) {
        corrections.push({
          id: row.id,
          participant_id: row.participant_id,
          stage_id: row.stage_id,
          stage_points: row.stage_points,
          cumulative_points: cum,
          overall_rank: rank,
          overall_rank_change: change,
        });
      }
    }
  }
  if (corrections.length > 0) {
    const { error } = await supabase
      .from('participant_stage_points')
      .upsert(corrections, { onConflict: 'id' });
    if (error) throw new Error(`Cumulatieven bijwerken mislukt: ${error.message}`);
  }

  // ---- Contributions ---------------------------------------------------------
  const contributionInserts: Array<Record<string, unknown>> = [];
  for (const [participantId, d] of participantPointsMap.entries()) {
    for (const [riderId, points] of d.contributions.entries()) {
      contributionInserts.push({
        participant_id: participantId,
        stage_id: stageId,
        rider_id: riderId,
        points_contributed: points,
      });
    }
  }
  {
    const { error } = await supabase
      .from('participant_rider_contributions')
      .delete()
      .eq('stage_id', stageId);
    if (error) throw new Error(`Bijdragen wissen mislukt: ${error.message}`);
  }
  if (contributionInserts.length > 0) {
    const { error } = await supabase
      .from('participant_rider_contributions')
      .insert(contributionInserts);
    if (error) throw new Error(`Bijdragen opslaan mislukt: ${error.message}`);
  }
}

/** Regenerate all six snapshots and publish a new versioned run. */
export async function generateAndPublish(): Promise<PublishResult> {
  const [metadata, leaderboards, riders, stagesData, teamSelections] = await Promise.all([
    generateMetadataJSON(),
    generateLeaderboardsJSON(),
    generateRidersJSON(),
    generateStagesDataJSON(),
    generateTeamSelectionsJSON(),
  ]);
  const riderRankings = await generateRiderRankingsJSON(riders);

  return publishSnapshots({
    metadata,
    leaderboards,
    riders,
    stages_data: stagesData,
    team_selections: teamSelections,
    rider_rankings: riderRankings,
  });
}

/**
 * Full pipeline for a stage whose result rows are already in the DB:
 * substitutions → points → mark complete → regenerate → publish.
 */
export async function processStage(stageNumber: number): Promise<ProcessStageResult> {
  const supabase = getServiceClient();

  const selections = await updateActiveSelections(stageNumber);
  await calculatePointsForStage(stageNumber);

  const { error } = await supabase
    .from('stages')
    .update({ is_complete: true })
    .eq('stage_number', stageNumber);
  if (error) throw new Error(`Etappe afronden mislukt: ${error.message}`);

  const published = await generateAndPublish();

  return {
    stageNumber,
    selections,
    runId: published.runId,
    pointerUrl: published.pointerUrl,
  };
}
