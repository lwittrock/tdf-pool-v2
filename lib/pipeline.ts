/**
 * Stage-processing pipeline as a plain library (WP-A2).
 *
 * Replaces the browser-orchestrated chain manual-entry → process-stage →
 * (HTTP self-fetch) update-active-selections + calculate-points. Everything
 * here is a direct function call; one authenticated route (enter-stage)
 * drives it.
 *
 * The point calculations are a faithful port of the previous API routes —
 * still query-heavy (N+1), which is acceptable mid-Tour with few stages;
 * WP-B2 replaces the internals with bulk queries. WP-A3 fixes the
 * roster-as-of-stage semantics.
 */

import { getServiceClient } from './supabase-server.js';
import {
  computeRiderStagePoints,
  computeParticipantStagePoints,
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
 * Handle DNS substitutions for a stage: deactivate DNS'd main riders
 * (recording replaced_at_stage) and activate the position-11 reserve
 * (recording the activation stage on the reserve row — WP-A3 scoring reads
 * that to build the roster-as-of-stage). DNS only: DNF/OTL/DSQ do not
 * activate the reserve (owner decision Q3/Q20).
 */
export async function updateActiveSelections(stageNumber: number): Promise<UpdateSelectionsResult> {
  const supabase = getServiceClient();
  const stageId = await getStageId(stageNumber);

  if (!RESERVE_ACTIVATES_MID_TOUR && stageNumber > 1) {
    return { dnsRiders: [], substitutions: [], participantsAffected: 0 };
  }

  const { data: dnsRecords } = await supabase
    .from('stage_dnf')
    .select('rider_id, riders!inner(name)')
    .eq('stage_id', stageId)
    .eq('status', 'DNS');

  const dnsRiderIds = new Set(dnsRecords?.map((r) => r.rider_id) || []);
  const dnsRiderNames = dnsRecords?.map((r) => (r.riders as any).name as string) || [];

  if (dnsRiderIds.size === 0) {
    return { dnsRiders: [], substitutions: [], participantsAffected: 0 };
  }

  const { data: participants, error } = await supabase
    .from('participants')
    .select(`
      id,
      name,
      participant_rider_selections!inner(
        id,
        rider_id,
        position,
        is_active,
        replaced_at_stage,
        riders!participant_rider_selections_rider_id_fkey(name)
      )
    `);

  if (error || !participants) {
    throw new Error(`Deelnemers laden mislukt: ${error?.message}`);
  }

  const substitutions: SubstitutionMade[] = [];
  let participantsAffected = 0;

  for (const participant of participants) {
    const selections = (participant.participant_rider_selections as any[]).sort(
      (a, b) => a.position - b.position
    );
    const mainRiders = selections.filter((s) => s.position <= 10);
    const backupRider = selections.find((s) => s.position === 11);
    let affected = false;

    for (const selection of mainRiders) {
      const alreadyReplaced = selection.replaced_at_stage != null;
      if (!dnsRiderIds.has(selection.rider_id) || alreadyReplaced) continue;

      await supabase
        .from('participant_rider_selections')
        .update({ is_active: false, replaced_at_stage: stageNumber })
        .eq('id', selection.id);
      affected = true;

      const backupAvailable =
        backupRider &&
        backupRider.replaced_at_stage == null && // reserve not yet activated
        !dnsRiderIds.has(backupRider.rider_id);

      if (backupAvailable) {
        // replaced_at_stage on the reserve row = stage from which it scores
        await supabase
          .from('participant_rider_selections')
          .update({
            is_active: true,
            replaced_at_stage: stageNumber,
            replacement_for_rider_id: selection.rider_id,
          })
          .eq('id', backupRider.id);

        substitutions.push({
          participant_name: participant.name,
          rider_out: selection.riders.name,
          rider_in: backupRider.riders.name,
        });
      }
    }

    if (affected) participantsAffected++;
  }

  return { dnsRiders: dnsRiderNames, substitutions, participantsAffected };
}

/**
 * Calculate and persist rider + participant points for one stage, then
 * cumulative totals and ranks. Ported from api/admin/calculate-points.
 */
export async function calculatePointsForStage(stageNumber: number): Promise<void> {
  const supabase = getServiceClient();
  const stageId = await getStageId(stageNumber);

  // Clear existing points for this stage (reprocessing)
  await Promise.all([
    supabase.from('rider_stage_points').delete().eq('stage_id', stageId),
    supabase.from('participant_stage_points').delete().eq('stage_id', stageId),
    supabase.from('participant_rider_contributions').delete().eq('stage_id', stageId),
  ]);

  // ---- Rider points (pure core: lib/scoring.ts) ----------------------------
  const { data: stageResults } = await supabase
    .from('stage_results')
    .select('rider_id, position')
    .eq('stage_id', stageId)
    .order('position');

  const { data: jerseys } = await supabase
    .from('stage_jerseys')
    .select('rider_id, jersey_type')
    .eq('stage_id', stageId);

  const { data: combativity } = await supabase
    .from('stage_combativity')
    .select('rider_id')
    .eq('stage_id', stageId)
    .maybeSingle();

  const riderPointsMap = computeRiderStagePoints(
    stageResults ?? [],
    (jerseys ?? []) as StageJerseyInput[],
    combativity?.rider_id ?? null
  );

  const riderInserts = [...riderPointsMap.entries()].map(([riderId, p]) => ({
    stage_id: stageId,
    rider_id: riderId,
    ...p,
    stage_rank: null,
  }));

  if (riderInserts.length > 0) {
    const { error } = await supabase.from('rider_stage_points').insert(riderInserts);
    if (error) throw new Error(`Rennerpunten opslaan mislukt: ${error.message}`);
  }

  const { data: allRiderPoints } = await supabase
    .from('rider_stage_points')
    .select('id, total_points')
    .eq('stage_id', stageId)
    .order('total_points', { ascending: false });
  for (let i = 0; i < (allRiderPoints?.length ?? 0); i++) {
    await supabase
      .from('rider_stage_points')
      .update({ stage_rank: i + 1 })
      .eq('id', allRiderPoints![i].id);
  }

  // ---- Participant points -------------------------------------------------
  const { data: participants } = await supabase.from('participants').select('id, name');
  if (!participants) throw new Error('Deelnemers laden mislukt');

  // Roster-as-of-stage (WP-A3, fixes F3): scoring no longer trusts the
  // global is_active flag or position <= 10 — it derives each stage's
  // roster from replaced_at_stage, so a substituted reserve scores from
  // its activation stage and a force-reprocessed early stage uses the
  // roster as it was then.
  const { data: allSelections } = await supabase
    .from('participant_rider_selections')
    .select('participant_id, rider_id, position, replaced_at_stage');
  if (!allSelections) throw new Error('Selecties laden mislukt');

  const participantPointsMap = computeParticipantStagePoints(
    riderPointsMap,
    allSelections as SelectionInput[],
    stageNumber
  );
  // Participants without any selection row still get a 0-point row.
  for (const participant of participants) {
    if (!participantPointsMap.has(participant.id)) {
      participantPointsMap.set(participant.id, { total_points: 0, contributions: new Map() });
    }
  }

  const participantInserts = [...participantPointsMap.entries()].map(([participantId, d]) => ({
    stage_id: stageId,
    participant_id: participantId,
    stage_points: d.total_points,
    stage_rank: null,
    cumulative_points: 0,
    overall_rank: null,
  }));
  if (participantInserts.length > 0) {
    const { error } = await supabase.from('participant_stage_points').insert(participantInserts);
    if (error) throw new Error(`Deelnemerspunten opslaan mislukt: ${error.message}`);
  }

  const contributionInserts: Array<{
    participant_id: string;
    stage_id: string;
    rider_id: string;
    points_contributed: number;
  }> = [];
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
  if (contributionInserts.length > 0) {
    const { error } = await supabase
      .from('participant_rider_contributions')
      .insert(contributionInserts);
    if (error) throw new Error(`Bijdragen opslaan mislukt: ${error.message}`);
  }

  // ---- Ranks --------------------------------------------------------------
  const { data: byStagePoints } = await supabase
    .from('participant_stage_points')
    .select('id, stage_points')
    .eq('stage_id', stageId)
    .order('stage_points', { ascending: false });
  for (let i = 0; i < (byStagePoints?.length ?? 0); i++) {
    await supabase
      .from('participant_stage_points')
      .update({ stage_rank: i + 1 })
      .eq('id', byStagePoints![i].id);
  }

  // ---- Cumulative totals + overall ranks ----------------------------------
  const { data: completedStages } = await supabase
    .from('stages')
    .select('id, stage_number')
    .eq('is_complete', true)
    .lte('stage_number', stageNumber)
    .order('stage_number');
  if (!completedStages) throw new Error('Etappes laden mislukt');

  for (const participant of participants) {
    let cumulative = 0;
    for (const stage of completedStages) {
      const { data: sp } = await supabase
        .from('participant_stage_points')
        .select('stage_points')
        .eq('participant_id', participant.id)
        .eq('stage_id', stage.id)
        .maybeSingle();
      if (sp) cumulative += sp.stage_points;
      await supabase
        .from('participant_stage_points')
        .update({ cumulative_points: cumulative })
        .eq('participant_id', participant.id)
        .eq('stage_id', stage.id);
    }
  }

  const { data: byOverall } = await supabase
    .from('participant_stage_points')
    .select('id, cumulative_points')
    .eq('stage_id', stageId)
    .order('cumulative_points', { ascending: false });
  for (let i = 0; i < (byOverall?.length ?? 0); i++) {
    await supabase
      .from('participant_stage_points')
      .update({ overall_rank: i + 1 })
      .eq('id', byOverall![i].id);
  }

  // ---- Rank changes vs previous stage --------------------------------------
  if (stageNumber > 1) {
    const { data: previousStage } = await supabase
      .from('stages')
      .select('id')
      .eq('stage_number', stageNumber - 1)
      .single();
    if (previousStage) {
      for (const participant of participants) {
        const { data: current } = await supabase
          .from('participant_stage_points')
          .select('overall_rank')
          .eq('participant_id', participant.id)
          .eq('stage_id', stageId)
          .single();
        const { data: previous } = await supabase
          .from('participant_stage_points')
          .select('overall_rank')
          .eq('participant_id', participant.id)
          .eq('stage_id', previousStage.id)
          .maybeSingle();
        if (current?.overall_rank && previous?.overall_rank) {
          await supabase
            .from('participant_stage_points')
            .update({ overall_rank_change: previous.overall_rank - current.overall_rank })
            .eq('participant_id', participant.id)
            .eq('stage_id', stageId);
        }
      }
    }
  }
}

/** Regenerate all six snapshots and publish a new versioned run. */
export async function generateAndPublish(): Promise<PublishResult> {
  const [metadata, leaderboards, riders, stagesData, teamSelections, riderRankings] =
    await Promise.all([
      generateMetadataJSON(),
      generateLeaderboardsJSON(),
      generateRidersJSON(),
      generateStagesDataJSON(),
      generateTeamSelectionsJSON(),
      generateRiderRankingsJSON(),
    ]);

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
