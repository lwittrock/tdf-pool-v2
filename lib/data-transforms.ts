/**
 * Data Transformation Utilities
 * 
 * Reusable functions for transforming and calculating data.
 * Eliminates duplicate logic across components.
 */

import type {
  RiderData,
  RidersData,
  RiderStageData,
  StageInfo,
  StageData,
  MedalCounts,
  LeaderboardsData,
  TeamSelectionsData,
} from './types';
import { MEDAL_POSITIONS, formatMedalDisplay } from './scoring-constants.js';

// ============================================================================
// Display Formatting
// ============================================================================

/**
 * Dutch date for the page-header freshness line, e.g. "15 juli".
 * Returns null when the input isn't a valid date.
 */
export function formatLastUpdated(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
}

// ============================================================================
// Rider Stage Transformations
// ============================================================================

/** A gap-filled placeholder for a stage in which the rider scored nothing. */
function emptyStage(stageNum: number, cumulative_total: number): StageInfo {
  return {
    stageNum,
    stageKey: `stage_${stageNum}`,
    date: '',
    stage_finish_points: 0,
    stage_finish_position: 0,
    stage_total: 0,
    cumulative_total,
  };
}

/**
 * Insert zero-point placeholders for every stage from 1..upToStage that the
 * rider isn't already scored in, so the per-stage list has no silent gaps
 * (a zero stage is indistinguishable from missing data otherwise). Carries the
 * running cumulative forward through the filled stages.
 */
function fillStageGaps(stages: StageInfo[], upToStage: number): StageInfo[] {
  const byNum = new Map(stages.map((s) => [s.stageNum, s]));
  const filled: StageInfo[] = [];
  let cumulative = 0;
  for (let n = 1; n <= upToStage; n++) {
    const present = byNum.get(n);
    if (present) {
      cumulative = present.cumulative_total;
      filled.push(present);
    } else {
      filled.push(emptyStage(n, cumulative));
    }
  }
  return filled;
}

function toStageInfo(stageKey: string, stageData: RiderStageData): StageInfo {
  return {
    stageNum: parseInt(stageKey.replace('stage_', '')),
    stageKey,
    date: stageData.date,
    stage_finish_points: stageData.stage_finish_points,
    stage_finish_position: stageData.stage_finish_position,
    jersey_points: stageData.jersey_points,
    stage_total: stageData.stage_total,
    cumulative_total: stageData.cumulative_total,
  };
}

/**
 * Convert rider stages object to sorted array of StageInfo.
 * Pass `upToStage` to gap-fill absent stages with zero placeholders.
 */
export function getRiderStages(
  ridersData: RidersData,
  riderName: string,
  upToStage?: number
): StageInfo[] {
  const rider = ridersData[riderName];
  if (!rider?.stages) return [];

  const stages = Object.entries(rider.stages)
    .map(([stageKey, stageData]) => toStageInfo(stageKey, stageData))
    .sort((a, b) => a.stageNum - b.stageNum);

  return upToStage ? fillStageGaps(stages, upToStage) : stages;
}

/**
 * Get stage info from RiderData.
 * Pass `upToStage` to gap-fill absent stages with zero placeholders.
 */
export function getRiderStagesFromData(rider: RiderData, upToStage?: number): StageInfo[] {
  if (!rider?.stages) return [];

  const stages = Object.entries(rider.stages)
    .map(([stageKey, stageData]) => toStageInfo(stageKey, stageData))
    .sort((a, b) => a.stageNum - b.stageNum);

  return upToStage ? fillStageGaps(stages, upToStage) : stages;
}

/**
 * Set of rider names who have abandoned (DNF or DNS in any stage), from the
 * stages_data snapshot. Used to mark abandoned riders on the rider lists (5.5).
 */
export function abandonedRiderSet(stages: StageData[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const stage of stages ?? []) {
    for (const name of stage.dnf_riders ?? []) out.add(name);
    for (const name of stage.dns_riders ?? []) out.add(name);
  }
  return out;
}

// ============================================================================
// Medal Calculations (UNIFIED)
// ============================================================================

/**
 * Calculate medals from an array of positions
 * This is the SINGLE source of truth for medal calculation
 */
export function calculateMedalsFromPositions(positions: number[]): MedalCounts {
  let gold = 0;
  let silver = 0;
  let bronze = 0;

  for (const pos of positions) {
    if (pos === MEDAL_POSITIONS.GOLD) gold++;
    else if (pos === MEDAL_POSITIONS.SILVER) silver++;
    else if (pos === MEDAL_POSITIONS.BRONZE) bronze++;
  }

  return {
    gold,
    silver,
    bronze,
    display: formatMedalDisplay(gold, silver, bronze),
  };
}

/**
 * Tie-aware stage medal counts for ALL participants, computed once.
 * Ranks are derived per stage from stage_score (competition ranking), so
 * tied participants each earn the medal. Note: a tie for gold means the
 * next rank is 3 — silver is skipped that stage, by 1,2,2,4 semantics.
 */
export function getAllParticipantMedals(
  leaderboardsData: LeaderboardsData
): Map<string, MedalCounts> {
  const counts = new Map<string, { gold: number; silver: number; bronze: number }>();

  Object.values(leaderboardsData.leaderboard_by_stage).forEach((stageData) => {
    assignCompetitionRanks(stageData, (e) => e.stage_score).forEach(({ item, rank }) => {
      if (rank > MEDAL_POSITIONS.BRONZE) return;
      const entry = counts.get(item.participant_name) ?? { gold: 0, silver: 0, bronze: 0 };
      if (rank === MEDAL_POSITIONS.GOLD) entry.gold++;
      else if (rank === MEDAL_POSITIONS.SILVER) entry.silver++;
      else entry.bronze++;
      counts.set(item.participant_name, entry);
    });
  });

  const medals = new Map<string, MedalCounts>();
  counts.forEach(({ gold, silver, bronze }, name) => {
    medals.set(name, { gold, silver, bronze, display: formatMedalDisplay(gold, silver, bronze) });
  });
  return medals;
}

// ============================================================================
// Jersey classifications (Klassement markers)
// ============================================================================
//
// Three season-long side competitions surfaced next to the main standings:
//   • yellow  = current overall leader (computed in the page from overall_score)
//   • green   = most daily stage wins (stageWinCounts)
//   • polka   = most combativity points on your roster (combativityPointsByParticipant)
// Green rewards day-to-day spikes, polka rewards picking non-GC breakaway
// attackers — axes the yellow (GC consistency) competition doesn't reward.

/**
 * Daily-win count per participant: how many stages they topped the daily
 * (stage_score) ranking. Tie-aware — co-leaders sharing the top stage_score
 * each get a win, matching the 1,2,2,4 semantics used for medals. Stages where
 * nobody scored (top score 0) award no win. Feeds the green-jersey marker.
 */
export function stageWinCounts(leaderboardsData: LeaderboardsData): Map<string, number> {
  const wins = new Map<string, number>();
  Object.values(leaderboardsData.leaderboard_by_stage).forEach((stageData) => {
    assignCompetitionRanks(stageData, (e) => e.stage_score).forEach(({ item, rank }) => {
      if (rank !== 1 || item.stage_score <= 0) return;
      wins.set(item.participant_name, (wins.get(item.participant_name) ?? 0) + 1);
    });
  });
  return wins;
}

/**
 * Combativity points accumulated by each participant's roster across the Tour:
 * the sum of jersey_points.combative over every rider on their team, every
 * stage. Combativity is a flat COMBATIVITY_POINTS award to the day's most
 * aggressive rider, so this rewards picking breakaway attackers (Simmons,
 * Pidcock…) rather than GC favourites. Feeds the polka-dot competition (#13).
 */
export function combativityPointsByParticipant(
  ridersData: RidersData,
  teamSelections: TeamSelectionsData
): Map<string, number> {
  const totals = new Map<string, number>();
  Object.values(teamSelections).forEach(({ participant_name, riders }) => {
    let sum = 0;
    riders.forEach((riderName) => {
      const rider = ridersData[riderName];
      if (!rider) return;
      Object.values(rider.stages).forEach((s) => {
        sum += s.jersey_points?.combative ?? 0;
      });
    });
    totals.set(participant_name, sum);
  });
  return totals;
}

/**
 * Names holding the maximum value in a classification map (ties share the
 * lead). Returns an empty set when every value is 0 — i.e. no jersey is
 * awarded before anyone has scored in that competition.
 */
export function classificationLeaders(scores: Map<string, number>): Set<string> {
  let max = 0;
  scores.forEach((v) => {
    if (v > max) max = v;
  });
  if (max <= 0) return new Set();
  const leaders = new Set<string>();
  scores.forEach((v, name) => {
    if (v === max) leaders.add(name);
  });
  return leaders;
}

// ============================================================================
// Participant Stage History
// ============================================================================

/**
 * Get all stages for a participant with their scores.
 * stage_rank is the tie-aware competition rank derived from stage_score,
 * not the dense server rank stored in the snapshot.
 */
export function getParticipantStages(
  leaderboardsData: LeaderboardsData,
  participantName: string
): Array<{
  stageNum: number;
  stageKey: string;
  stage_score: number;
  stage_rank: number;
}> {
  const stages: Array<{
    stageNum: number;
    stageKey: string;
    stage_score: number;
    stage_rank: number;
  }> = [];

  Object.entries(leaderboardsData.leaderboard_by_stage).forEach(
    ([stageKey, stageData]) => {
      const ranked = assignCompetitionRanks(stageData, (e) => e.stage_score);
      const found = ranked.find(({ item }) => item.participant_name === participantName);
      if (found) {
        stages.push({
          stageNum: parseInt(stageKey.replace('stage_', '')),
          stageKey,
          stage_score: found.item.stage_score,
          stage_rank: found.rank,
        });
      }
    }
  );

  return stages.sort((a, b) => a.stageNum - b.stageNum);
}

// ============================================================================
// Ranking Utilities
// ============================================================================

/**
 * Standard competition ranking ("1224"): stable sort by score desc; equal
 * scores share a rank; the next distinct score skips ranks. Client-side
 * display only — snapshots keep their dense server ranks.
 */
export function assignCompetitionRanks<T>(
  items: readonly T[],
  getScore: (item: T) => number
): Array<{ item: T; rank: number }> {
  const sorted = [...items].sort((a, b) => getScore(b) - getScore(a));
  let prevScore = Number.NaN;
  let prevRank = 0;
  return sorted.map((item, idx) => {
    const score = getScore(item);
    const rank = score === prevScore ? prevRank : idx + 1;
    prevScore = score;
    prevRank = rank;
    return { item, rank };
  });
}

/**
 * Key → competition rank, derived from the FULL list (build before any
 * search filtering so filtering never renumbers).
 */
export function competitionRankMap<T>(
  items: readonly T[],
  getScore: (item: T) => number,
  getKey: (item: T) => string
): Map<string, number> {
  return new Map(
    assignCompetitionRanks(items, getScore).map(({ item, rank }) => [getKey(item), rank])
  );
}

/**
 * Key → tie-aware rank change (previous competition rank − current), so a
 * positive number means "moved up". Both sides use standard competition ranks
 * (1,2,2,4), so co-leaders who stay tied register 0 and only a real position
 * change shows an arrow — matching the displayed Positie. Keys absent from the
 * previous list (new entrants, or stage 1) map to null (no arrow).
 *
 * The snapshot's stored *_rank_change is derived from dense server ranks and is
 * wrong across ties, so the frontend computes this instead.
 */
export function rankChangeMap<T>(
  current: readonly T[],
  previous: readonly T[],
  getScore: (item: T) => number,
  getKey: (item: T) => string
): Map<string, number | null> {
  const currRanks = competitionRankMap(current, getScore, getKey);
  const prevRanks = competitionRankMap(previous, getScore, getKey);
  const out = new Map<string, number | null>();
  currRanks.forEach((rank, key) => {
    const prev = prevRanks.get(key);
    out.set(key, prev === undefined ? null : prev - rank);
  });
  return out;
}

/**
 * Create overall rank map for riders
 */
export function createRiderRankMap(ridersData: RidersData): Record<string, number> {
  const ranked = Object.entries(ridersData)
    .map(([name, rider]) => ({ name, total_points: rider.total_points }))
    .sort((a, b) => b.total_points - a.total_points);

  const rankMap: Record<string, number> = {};
  ranked.forEach((rider, index) => {
    rankMap[rider.name] = index + 1;
  });

  return rankMap;
}

// ============================================================================
// Selection Statistics
// ============================================================================

/**
 * Calculate rider selection counts from team selections
 */
export function calculateSelectionCounts(
  teamSelections: Record<string, { riders: string[] }>
): Record<string, number> {
  const counts: Record<string, number> = {};

  Object.values(teamSelections).forEach((team) => {
    team.riders.forEach((riderName) => {
      counts[riderName] = (counts[riderName] || 0) + 1;
    });
  });

  return counts;
}

/**
 * Calculate selection percentage
 */
export function calculateSelectionPercentage(
  count: number,
  totalParticipants: number
): number {
  return totalParticipants > 0 ? Math.round((count / totalParticipants) * 100) : 0;
}

// ============================================================================
// Filtering & Searching
// ============================================================================

/**
 * Generic search filter for text fields
 */
export function matchesSearch(text: string, searchTerm: string): boolean {
  return text.toLowerCase().includes(searchTerm.toLowerCase().trim());
}