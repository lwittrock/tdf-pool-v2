/**
 * Scoring core tests (WP-A3).
 *
 * The DNS-substitution scenario is the test that would have caught the F3
 * bug (a substituted reserve scoring 0 forever); the force-reprocess
 * scenario proves roster-as-of-stage (an early stage recomputed after a
 * later substitution uses the roster as it was then).
 */

import { describe, expect, it } from 'vitest';
import {
  computeRiderStagePoints,
  computeParticipantStagePoints,
  selectionCountsForStage,
  dagploegBonus,
  deriveRosterStamps,
  type SelectionInput,
} from '../lib/scoring';

describe('dagploegBonus (WP-B1)', () => {
  it('awards +6 on a ploeg match, case/spacing-insensitively', () => {
    expect(dagploegBonus('UAE TEAM EMIRATES XRG', 'UAE TEAM EMIRATES XRG')).toBe(6);
    expect(dagploegBonus('uae team  emirates xrg ', 'UAE TEAM EMIRATES XRG')).toBe(6);
  });

  it('awards nothing on a different team, a missing ploeg, or a stage without dagploeg', () => {
    expect(dagploegBonus('LIDL-TREK', 'UAE TEAM EMIRATES XRG')).toBe(0);
    expect(dagploegBonus(null, 'UAE TEAM EMIRATES XRG')).toBe(0);
    expect(dagploegBonus('LIDL-TREK', null)).toBe(0);
    expect(dagploegBonus('LIDL-TREK', '')).toBe(0);
  });
});

const P1 = 'participant-1';

function selection(overrides: Partial<SelectionInput> & { rider_id: string }): SelectionInput {
  return {
    participant_id: P1,
    position: 1,
    replaced_at_stage: null,
    ...overrides,
  };
}

/** 10 main riders r1..r10 plus reserve r11. */
function fullTeam(replacedMain?: { rider: string; atStage: number }): SelectionInput[] {
  const selections: SelectionInput[] = [];
  for (let i = 1; i <= 10; i++) {
    selections.push(
      selection({
        rider_id: `r${i}`,
        position: i,
        replaced_at_stage: replacedMain?.rider === `r${i}` ? replacedMain.atStage : null,
      })
    );
  }
  selections.push(
    selection({
      rider_id: 'r11',
      position: 11,
      replaced_at_stage: replacedMain ? replacedMain.atStage : null,
    })
  );
  return selections;
}

/** casualtiesByStage literal: { effectiveStage: [rider ids] } */
function casualties(entries: Record<number, string[]>): Map<number, Set<string>> {
  return new Map(Object.entries(entries).map(([s, r]) => [Number(s), new Set(r)]));
}

describe('deriveRosterStamps (finding 5: reconciliation)', () => {
  it('stamps a casualty main and activates the reserve from the same stage', () => {
    const { stampByPosition, substitution } = deriveRosterStamps(fullTeam(), casualties({ 5: ['r3'] }));
    expect(stampByPosition.get(3)).toBe(5);
    expect(stampByPosition.get(11)).toBe(5);
    expect(substitution).toEqual({ stageNumber: 5, riderOut: 'r3', riderIn: 'r11' });
  });

  it('clears stamps whose casualty was retracted (the write-only bug)', () => {
    const team = fullTeam({ rider: 'r3', atStage: 5 }); // stamped by an earlier run
    const { stampByPosition, substitution } = deriveRosterStamps(team, casualties({}));
    expect(stampByPosition.get(3)).toBeNull();
    expect(stampByPosition.get(11)).toBeNull();
    expect(substitution).toBeNull();
  });

  it('activates the reserve at most once; later casualties only lose their rider', () => {
    const { stampByPosition, substitution } = deriveRosterStamps(
      fullTeam(),
      casualties({ 3: ['r1'], 6: ['r2'] })
    );
    expect(stampByPosition.get(1)).toBe(3);
    expect(stampByPosition.get(2)).toBe(6);
    expect(stampByPosition.get(11)).toBe(3);
    expect(substitution).toEqual({ stageNumber: 3, riderOut: 'r1', riderIn: 'r11' });
  });

  it('does not activate a reserve that is itself a casualty of that stage', () => {
    const { stampByPosition, substitution } = deriveRosterStamps(
      fullTeam(),
      casualties({ 5: ['r1', 'r11'] })
    );
    expect(stampByPosition.get(1)).toBe(5);
    expect(stampByPosition.get(11)).toBeNull();
    expect(substitution).toBeNull();
  });

  it('keeps a pre-race activation (reserve stamp 1, no casualty backing) and counts it as the one substitution', () => {
    const team = fullTeam();
    team.find((s) => s.position === 11)!.replaced_at_stage = 1;
    const { stampByPosition, substitution } = deriveRosterStamps(team, casualties({ 4: ['r2'] }));
    expect(stampByPosition.get(11)).toBe(1); // seeded, not cleared
    expect(stampByPosition.get(2)).toBe(4); // casualty main still loses its rider
    expect(substitution).toBeNull(); // reserve already used pre-race
  });
});

describe('computeRiderStagePoints', () => {
  it('awards 25/19/18…1 for positions, jerseys stack, combativity optional', () => {
    const points = computeRiderStagePoints(
      [
        { rider_id: 'a', position: 1 },
        { rider_id: 'b', position: 2 },
        { rider_id: 'c', position: 20 },
      ],
      [
        { rider_id: 'a', jersey_type: 'yellow' },
        { rider_id: 'a', jersey_type: 'polka_dot' },
        { rider_id: 'b', jersey_type: 'green' },
      ],
      null // combativity can be absent (2026 stage 1)
    );

    expect(points.get('a')!.total_points).toBe(25 + 15 + 10);
    expect(points.get('b')!.total_points).toBe(19 + 10);
    expect(points.get('c')!.total_points).toBe(1);
  });

  it('awards 5 for combativity, also to riders outside the top 20', () => {
    const points = computeRiderStagePoints([{ rider_id: 'a', position: 1 }], [], 'x');
    expect(points.get('x')!.combativity_points).toBe(5);
    expect(points.get('x')!.total_points).toBe(5);
  });
});

describe('roster-as-of-stage (F3 fix)', () => {
  // r1 DNSes before stage 2 → reserve r11 takes over from stage 2 onward.
  const team = fullTeam({ rider: 'r1', atStage: 2 });

  it('substituted reserve scores from the activation stage (the F3 bug)', () => {
    // Stage 2: reserve r11 wins the stage.
    const riderPoints = computeRiderStagePoints([{ rider_id: 'r11', position: 1 }], [], null);
    const result = computeParticipantStagePoints(riderPoints, team, 2);

    // Old engine: reserve stuck at position 11 → 0 points forever.
    expect(result.get(P1)!.total_points).toBe(25);
    expect(result.get(P1)!.contributions.get('r11')).toBe(25);
  });

  it('the replaced rider no longer scores from the DNS stage', () => {
    // Hypothetical: r1 somehow appears in results for stage 2 (bad entry) —
    // roster logic must not count a replaced rider.
    const riderPoints = computeRiderStagePoints([{ rider_id: 'r1', position: 1 }], [], null);
    const result = computeParticipantStagePoints(riderPoints, team, 2);
    expect(result.get(P1)!.total_points).toBe(0);
  });

  it('force-reprocessing an earlier stage uses the roster as of that stage', () => {
    // Stage 1 (before the DNS): r1 scored, r11 did not count yet.
    const riderPoints = computeRiderStagePoints(
      [
        { rider_id: 'r1', position: 1 },
        { rider_id: 'r11', position: 2 },
      ],
      [],
      null
    );
    const result = computeParticipantStagePoints(riderPoints, team, 1);

    // Only r1's 25 counts; the reserve's 19 must NOT (Q2: never retroactive).
    expect(result.get(P1)!.total_points).toBe(25);
    expect(result.get(P1)!.contributions.has('r11')).toBe(false);
  });

  it('an untouched reserve never scores', () => {
    const untouched = fullTeam();
    const riderPoints = computeRiderStagePoints([{ rider_id: 'r11', position: 1 }], [], null);
    for (const stage of [1, 2, 21]) {
      const result = computeParticipantStagePoints(riderPoints, untouched, stage);
      expect(result.get(P1)!.total_points).toBe(0);
    }
  });

  it('selectionCountsForStage boundary: DNS stage itself excludes the main rider', () => {
    const main = selection({ rider_id: 'r1', position: 1, replaced_at_stage: 5 });
    const reserve = selection({ rider_id: 'r11', position: 11, replaced_at_stage: 5 });
    expect(selectionCountsForStage(main, 4)).toBe(true);
    expect(selectionCountsForStage(main, 5)).toBe(false);
    expect(selectionCountsForStage(reserve, 4)).toBe(false);
    expect(selectionCountsForStage(reserve, 5)).toBe(true);
  });
});

describe('roster edge cases', () => {
  it('a 9-rider roster sums what exists (the 2026 pool has one)', () => {
    const nineRiders: SelectionInput[] = [];
    for (let i = 1; i <= 9; i++) {
      nineRiders.push(selection({ rider_id: `r${i}`, position: i }));
    }
    const riderPoints = computeRiderStagePoints(
      [
        { rider_id: 'r1', position: 1 },
        { rider_id: 'r9', position: 2 },
      ],
      [],
      null
    );
    const result = computeParticipantStagePoints(riderPoints, nineRiders, 1);
    expect(result.get(P1)!.total_points).toBe(25 + 19);
  });

  it('second casualty: no second substitution, participant rides with 9 scorers (Q4)', () => {
    // r1 replaced at stage 2 (reserve used); r2 DNSes later — nothing to
    // substitute, r2 simply stops appearing in results and scores 0.
    const team = fullTeam({ rider: 'r1', atStage: 2 });
    const riderPoints = computeRiderStagePoints(
      [
        { rider_id: 'r3', position: 1 },
        { rider_id: 'r11', position: 2 },
      ],
      [],
      null
    );
    const result = computeParticipantStagePoints(riderPoints, team, 3);
    expect(result.get(P1)!.total_points).toBe(25 + 19);
  });
});
