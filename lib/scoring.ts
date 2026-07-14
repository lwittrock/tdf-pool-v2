/**
 * Pure scoring core (WP-A3).
 *
 * No I/O, no Supabase, no env access — the pipeline feeds it plain rows and
 * the test suite feeds it fixtures. This is the seed of the WP-B2 bulk
 * refactor: keep every scoring rule here, keep persistence in lib/pipeline.
 *
 * Roster-as-of-stage (fixes F3, the backup-rider bug):
 * - A main rider (position 1–10) counts for stage s while
 *   replaced_at_stage is NULL or > s.
 * - The reserve (position 11) counts for stage s once replaced_at_stage
 *   is set and <= s. On the reserve row, replaced_at_stage records the
 *   stage from which the substitution applies.
 * Owner decisions: the reserve activates on any casualty — from the DNS
 * stage itself, or from the stage AFTER a DNF/OTL/DSQ (the rider rode that
 * stage; ruling of July 14 2026, supersedes the earlier DNS-only Q3/Q20) —
 * also mid-Tour (Q1), from the activation stage onward and never
 * retroactively (Q2), and at most one substitution (Q4 — the second
 * casualty just leaves the participant with 9 scorers).
 */

import {
  POINTS_FOR_RANK,
  JERSEY_POINTS,
  COMBATIVITY_POINTS,
  DAGPLOEG_POINTS,
  type JerseyType,
} from './scoring-constants.js';
import { riderNameKey } from './rider-names.js';

/** Q1 — a mid-Tour DNS also activates the reserve for the remaining stages. */
export const RESERVE_ACTIVATES_MID_TOUR = true;

// ============================================================================
// Rider points for one stage
// ============================================================================

export interface StageResultInput {
  rider_id: string;
  position: number;
}

export interface StageJerseyInput {
  rider_id: string;
  jersey_type: JerseyType;
}

export interface RiderStagePointsBreakdown {
  stage_finish_points: number;
  yellow_points: number;
  green_points: number;
  polka_dot_points: number;
  white_points: number;
  combativity_points: number;
  total_points: number;
}

/**
 * Compute every rider's points for one stage. Only riders that scored
 * appear in the result. Combativity may be null (fixture-proven: stage 1
 * of the 2026 Tour has none).
 */
export function computeRiderStagePoints(
  results: StageResultInput[],
  jerseys: StageJerseyInput[],
  combativityRiderId: string | null
): Map<string, RiderStagePointsBreakdown> {
  const points = new Map<string, RiderStagePointsBreakdown>();

  const ensure = (riderId: string): RiderStagePointsBreakdown => {
    let entry = points.get(riderId);
    if (!entry) {
      entry = {
        stage_finish_points: 0,
        yellow_points: 0,
        green_points: 0,
        polka_dot_points: 0,
        white_points: 0,
        combativity_points: 0,
        total_points: 0,
      };
      points.set(riderId, entry);
    }
    return entry;
  };

  for (const result of results) {
    const finishPoints = POINTS_FOR_RANK[result.position] || 0;
    if (finishPoints === 0) continue;
    const entry = ensure(result.rider_id);
    entry.stage_finish_points = finishPoints;
    entry.total_points += finishPoints;
  }

  for (const jersey of jerseys) {
    const jerseyPoints = JERSEY_POINTS[jersey.jersey_type];
    if (!jerseyPoints) continue;
    const entry = ensure(jersey.rider_id);
    if (jersey.jersey_type === 'yellow') entry.yellow_points = jerseyPoints;
    else if (jersey.jersey_type === 'green') entry.green_points = jerseyPoints;
    else if (jersey.jersey_type === 'polka_dot') entry.polka_dot_points = jerseyPoints;
    else if (jersey.jersey_type === 'white') entry.white_points = jerseyPoints;
    entry.total_points += jerseyPoints;
  }

  if (combativityRiderId) {
    const entry = ensure(combativityRiderId);
    entry.combativity_points = COMBATIVITY_POINTS;
    entry.total_points += COMBATIVITY_POINTS;
  }

  return points;
}

// ============================================================================
// Participant roster + points for one stage
// ============================================================================

export interface SelectionInput {
  participant_id: string;
  rider_id: string;
  /** 1–10 main riders, 11 = reserve. */
  position: number;
  /**
   * Main rider: stage from which the rider no longer counts (DNS stage).
   * Reserve: stage from which the reserve DOES count. NULL = untouched.
   */
  replaced_at_stage: number | null;
}

/** Does this selection row score for the given stage? (roster-as-of-stage) */
export function selectionCountsForStage(selection: SelectionInput, stageNumber: number): boolean {
  if (selection.position >= 1 && selection.position <= 10) {
    return selection.replaced_at_stage == null || stageNumber < selection.replaced_at_stage;
  }
  if (selection.position === 11) {
    return selection.replaced_at_stage != null && stageNumber >= selection.replaced_at_stage;
  }
  return false;
}

export interface ParticipantStagePoints {
  total_points: number;
  /** rider_id → points contributed (only riders that scored). */
  contributions: Map<string, number>;
}

/**
 * Dagploeg bonus (WP-B1): +6 when the participant's Ploeg pick equals the
 * stage's team day classification winner. Name-key comparison, matching the
 * sheet's free-text team spellings.
 */
export function dagploegBonus(
  participantPloeg: string | null | undefined,
  stageDagploeg: string | null | undefined
): number {
  if (!participantPloeg?.trim() || !stageDagploeg?.trim()) return 0;
  return riderNameKey(participantPloeg) === riderNameKey(stageDagploeg) ? DAGPLOEG_POINTS : 0;
}

/**
 * Sum each participant's roster-as-of-stage. Rosters smaller than 10 are
 * fine (the 2026 pool has a 9-rider participant): sum what exists.
 */
export function computeParticipantStagePoints(
  riderPoints: Map<string, RiderStagePointsBreakdown>,
  selections: SelectionInput[],
  stageNumber: number
): Map<string, ParticipantStagePoints> {
  const perParticipant = new Map<string, ParticipantStagePoints>();

  for (const selection of selections) {
    let entry = perParticipant.get(selection.participant_id);
    if (!entry) {
      entry = { total_points: 0, contributions: new Map() };
      perParticipant.set(selection.participant_id, entry);
    }
    if (!selectionCountsForStage(selection, stageNumber)) continue;

    const rider = riderPoints.get(selection.rider_id);
    if (rider && rider.total_points > 0) {
      entry.total_points += rider.total_points;
      entry.contributions.set(selection.rider_id, rider.total_points);
    }
  }

  return perParticipant;
}
