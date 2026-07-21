/**
 * Tie-aware display ranking tests.
 *
 * Snapshots ship dense server ranks (sort desc → index+1, no tie handling);
 * the frontend derives standard competition ranks (1,2,2,4) from points at
 * render time. These tests pin that derivation and its medal consequences
 * (a tie for gold skips silver that stage).
 */

import { describe, expect, it } from 'vitest';
import {
  assignCompetitionRanks,
  competitionRankMap,
  getAllParticipantMedals,
  getParticipantStages,
  stageWinCounts,
  combativityPointsByParticipant,
  classificationLeaders,
} from '../lib/data-transforms';
import { formatMedalDisplay } from '../lib/scoring-constants';
import type {
  LeaderboardEntry,
  LeaderboardsData,
  RidersData,
  RiderStageData,
  TeamSelectionsData,
} from '../lib/types';

function entry(
  participant_name: string,
  stage_score: number,
  overrides: Partial<LeaderboardEntry> = {}
): LeaderboardEntry {
  return {
    participant_name,
    directie_name: 'Directie X',
    overall_score: 0,
    overall_rank: 0,
    overall_rank_change: 0,
    stage_score,
    stage_rank: 0,
    stage_rider_contributions: {},
    ...overrides,
  };
}

function leaderboards(
  byStage: Record<string, LeaderboardEntry[]>
): LeaderboardsData {
  return { leaderboard_by_stage: byStage, directie_leaderboard_by_stage: {} };
}

describe('assignCompetitionRanks', () => {
  const score = (x: { s: number }) => x.s;

  it('ranks unique scores 1..n in descending score order', () => {
    const ranked = assignCompetitionRanks([{ s: 10 }, { s: 30 }, { s: 20 }], score);
    expect(ranked.map((r) => [r.item.s, r.rank])).toEqual([
      [30, 1],
      [20, 2],
      [10, 3],
    ]);
  });

  it('gives a tie for 2nd the ranks 1,2,2,4', () => {
    const ranked = assignCompetitionRanks(
      [{ s: 120 }, { s: 95 }, { s: 95 }, { s: 80 }],
      score
    );
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it('gives a tie for 1st the ranks 1,1,3 (no rank 2)', () => {
    const ranked = assignCompetitionRanks([{ s: 95 }, { s: 95 }, { s: 80 }], score);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('ranks everyone 1 when all scores are equal', () => {
    const ranked = assignCompetitionRanks([{ s: 0 }, { s: 0 }, { s: 0 }], score);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1]);
  });

  it('returns [] for an empty list and does not mutate the input', () => {
    expect(assignCompetitionRanks([], score)).toEqual([]);
    const input = [{ s: 1 }, { s: 2 }];
    assignCompetitionRanks(input, score);
    expect(input.map((x) => x.s)).toEqual([1, 2]);
  });

  it('keeps input order within a tie group (stable sort)', () => {
    const ranked = assignCompetitionRanks(
      [
        { s: 50, name: 'first' },
        { s: 50, name: 'second' },
      ],
      (x) => x.s
    );
    expect(ranked.map((r) => r.item.name)).toEqual(['first', 'second']);
  });
});

describe('competitionRankMap', () => {
  it('maps keys to competition ranks', () => {
    const map = competitionRankMap(
      [entry('A', 120), entry('B', 95), entry('C', 95), entry('D', 80)],
      (e) => e.stage_score,
      (e) => e.participant_name
    );
    expect(map.get('A')).toBe(1);
    expect(map.get('B')).toBe(2);
    expect(map.get('C')).toBe(2);
    expect(map.get('D')).toBe(4);
    expect(map.get('unknown')).toBeUndefined();
  });
});

describe('getAllParticipantMedals', () => {
  it('awards gold to both participants tied for a stage win, bronze to the next, no silver', () => {
    const medals = getAllParticipantMedals(
      leaderboards({
        stage_1: [entry('A', 95), entry('B', 95), entry('C', 80), entry('D', 10)],
      })
    );
    expect(medals.get('A')).toMatchObject({ gold: 1, silver: 0, bronze: 0 });
    expect(medals.get('B')).toMatchObject({ gold: 1, silver: 0, bronze: 0 });
    expect(medals.get('C')).toMatchObject({ gold: 0, silver: 0, bronze: 1 });
    expect(medals.get('D')).toBeUndefined();
  });

  it('accumulates medals across stages and formats the display string', () => {
    const medals = getAllParticipantMedals(
      leaderboards({
        stage_1: [entry('A', 100), entry('B', 90), entry('C', 80)],
        stage_2: [entry('A', 100), entry('B', 90), entry('C', 80)],
        stage_3: [entry('B', 100), entry('A', 90), entry('C', 80)],
      })
    );
    expect(medals.get('A')).toMatchObject({ gold: 2, silver: 1, bronze: 0 });
    expect(medals.get('B')).toMatchObject({ gold: 1, silver: 2, bronze: 0 });
    expect(medals.get('C')).toMatchObject({ gold: 0, silver: 0, bronze: 3 });
    expect(medals.get('A')?.display).toBe(formatMedalDisplay(2, 1, 0));
  });

  it('ignores the dense server stage_rank entirely', () => {
    // Server ranked the tied pair 1 and 2; both must still get gold.
    const medals = getAllParticipantMedals(
      leaderboards({
        stage_1: [
          entry('A', 95, { stage_rank: 1 }),
          entry('B', 95, { stage_rank: 2 }),
        ],
      })
    );
    expect(medals.get('B')).toMatchObject({ gold: 1, silver: 0 });
  });
});

describe('getParticipantStages', () => {
  it('returns tie-aware per-stage ranks, not the stored server rank', () => {
    const data = leaderboards({
      stage_1: [
        entry('A', 95, { stage_rank: 1 }),
        entry('B', 95, { stage_rank: 2 }),
        entry('C', 80, { stage_rank: 3 }),
      ],
      stage_2: [
        entry('A', 50, { stage_rank: 3 }),
        entry('B', 70, { stage_rank: 1 }),
        entry('C', 60, { stage_rank: 2 }),
      ],
    });
    expect(getParticipantStages(data, 'B')).toEqual([
      { stageNum: 1, stageKey: 'stage_1', stage_score: 95, stage_rank: 1 },
      { stageNum: 2, stageKey: 'stage_2', stage_score: 70, stage_rank: 1 },
    ]);
    expect(getParticipantStages(data, 'C').map((s) => s.stage_rank)).toEqual([3, 2]);
  });
});

// ---- Jersey classifications -------------------------------------------------

/** RiderData carrying only the per-stage combativity points the tests read. */
function riderWithCombative(perStage: number[]): RidersData[string] {
  const stages: Record<string, RiderStageData> = {};
  perStage.forEach((combative, i) => {
    stages[`stage_${i + 1}`] = {
      date: '',
      stage_finish_points: 0,
      stage_finish_position: 0,
      jersey_points: { yellow: 0, green: 0, polka_dot: 0, white: 0, combative },
      stage_total: combative,
      cumulative_total: 0,
    };
  });
  return { team: 'T', total_points: 0, stages };
}

function team(participant_name: string, riders: string[]): TeamSelectionsData[string] {
  return { participant_name, directie_name: 'D', riders };
}

describe('stageWinCounts', () => {
  it('counts daily wins tie-aware and ignores zero-point stages', () => {
    const data = leaderboards({
      stage_1: [entry('A', 95), entry('B', 95), entry('C', 80)], // A & B share the win
      stage_2: [entry('A', 50), entry('B', 70), entry('C', 60)], // B wins
      stage_3: [entry('A', 0), entry('B', 0), entry('C', 0)], // nobody scored → no win
    });
    const wins = stageWinCounts(data);
    expect(wins.get('A')).toBe(1);
    expect(wins.get('B')).toBe(2);
    expect(wins.get('C')).toBeUndefined();
  });
});

describe('combativityPointsByParticipant', () => {
  it('sums roster combativity across stages, skips unknown riders', () => {
    const riders: RidersData = {
      Simmons: riderWithCombative([5, 0, 5]),
      Pidcock: riderWithCombative([0, 5, 0]),
      Pogacar: riderWithCombative([0, 0, 0]),
    };
    const selections: TeamSelectionsData = {
      Alice: team('Alice', ['Simmons', 'Pogacar', 'Ghost']), // Ghost not in ridersData
      Bob: team('Bob', ['Pidcock']),
    };
    const totals = combativityPointsByParticipant(riders, selections);
    expect(totals.get('Alice')).toBe(10);
    expect(totals.get('Bob')).toBe(5);
  });
});

describe('classificationLeaders', () => {
  it('returns all names tied at the max', () => {
    const leaders = classificationLeaders(new Map([['A', 3], ['B', 3], ['C', 1]]));
    expect(leaders).toEqual(new Set(['A', 'B']));
  });

  it('is empty when nobody has scored', () => {
    expect(classificationLeaders(new Map([['A', 0], ['B', 0]])).size).toBe(0);
  });
});
