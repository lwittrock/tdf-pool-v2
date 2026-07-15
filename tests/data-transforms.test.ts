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
} from '../lib/data-transforms';
import { formatMedalDisplay } from '../lib/scoring-constants';
import type { LeaderboardEntry, LeaderboardsData } from '../lib/types';

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
