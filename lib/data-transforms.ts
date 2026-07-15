/**
 * Data Transformation Utilities
 * 
 * Reusable functions for transforming and calculating data.
 * Eliminates duplicate logic across components.
 */

import type {
  RiderData,
  RidersData,
  StageInfo,
  MedalCounts,
  LeaderboardsData,
} from './types';
import { MEDAL_POSITIONS, formatMedalDisplay } from './scoring-constants.js';

// ============================================================================
// Rider Stage Transformations
// ============================================================================

/**
 * Convert rider stages object to sorted array of StageInfo
 */
export function getRiderStages(
  ridersData: RidersData,
  riderName: string
): StageInfo[] {
  const rider = ridersData[riderName];
  if (!rider?.stages) return [];

  return Object.entries(rider.stages)
    .map(([stageKey, stageData]) => ({
      stageNum: parseInt(stageKey.replace('stage_', '')),
      stageKey,
      date: stageData.date,
      stage_finish_points: stageData.stage_finish_points,
      stage_finish_position: stageData.stage_finish_position,
      jersey_points: stageData.jersey_points,
      stage_total: stageData.stage_total,
      cumulative_total: stageData.cumulative_total,
    }))
    .sort((a, b) => a.stageNum - b.stageNum);
}

/**
 * Get stage info from RiderData
 */
export function getRiderStagesFromData(rider: RiderData): StageInfo[] {
  if (!rider?.stages) return [];

  return Object.entries(rider.stages)
    .map(([stageKey, stageData]) => ({
      stageNum: parseInt(stageKey.replace('stage_', '')),
      stageKey,
      date: stageData.date,
      stage_finish_points: stageData.stage_finish_points,
      stage_finish_position: stageData.stage_finish_position,
      jersey_points: stageData.jersey_points,
      stage_total: stageData.stage_total,
      cumulative_total: stageData.cumulative_total,
    }))
    .sort((a, b) => a.stageNum - b.stageNum);
}

// ============================================================================
// Jersey Utilities
// ============================================================================

/**
 * Get stage awards (jerseys + combativity)
 */
export function getStageAwards(stage: StageInfo): {
  jerseys: string[];
  hasCombative: boolean;
} {
  const jerseys: string[] = [];
  
  if (!stage.jersey_points) {
    return { jerseys: [], hasCombative: false };
  }
  
  if ((stage.jersey_points.yellow ?? 0) > 0) jerseys.push('yellow');
  if ((stage.jersey_points.green ?? 0) > 0) jerseys.push('green');
  if ((stage.jersey_points.polka_dot ?? 0) > 0) jerseys.push('polka_dot');
  if ((stage.jersey_points.white ?? 0) > 0) jerseys.push('white');

  return {
    jerseys,
    hasCombative: (stage.jersey_points.combative ?? 0) > 0,
  };
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