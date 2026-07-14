/**
 * Golden fixture test (WP-A3 seed of the full WP-B9 suite).
 *
 * Recomputes all 128 participants × stages 1–4 of the 2026 Tour from
 * data/2026/fixtures/ and compares against expected_standings.json (the
 * live Excel administration). The fixtures are the acceptance test for all
 * scoring work: never "fix" the fixtures to match the code.
 *
 * The Dagploeg +6 is the engine's dagploegBonus (WP-B1), fed from the
 * fixture's per-stage `dagploeg` field (winner of the stage's team day
 * classification — may be absent).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeRiderStagePoints,
  computeParticipantStagePoints,
  dagploegBonus,
  type SelectionInput,
  type StageJerseyInput,
} from '../lib/scoring';
import { foldedRiderNameKey } from '../lib/rider-names';
import type { JerseyType } from '../lib/types';

const FIXTURES = join(__dirname, '..', 'data', '2026', 'fixtures');

interface FixtureParticipant {
  id: string;
  directie: string;
  riders: string[];
  reserve: string | null;
  reserve_active: boolean;
  ploeg: string;
}

interface FixtureStage {
  stage_number: number;
  top_20: Array<{ position: number; rider: string }>;
  jerseys: Record<JerseyType, string>;
  combativity: string | null;
  dagploeg: string | null;
  /** Mid-Tour DNS riders (reserve activates from this stage). */
  dns?: string[];
  /** DNF/OTL/DSQ riders (reserve activates from the NEXT stage). */
  dnf?: string[];
}

interface ExpectedStandings {
  stages_completed: number;
  participants: Record<
    string,
    { stage_points: Record<string, number>; cumulative: Record<string, number> }
  >;
}

function loadJson<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(FIXTURES, ...parts), 'utf8')) as T;
}

const teamSelections = loadJson<FixtureParticipant[]>('team_selections.json');
const expected = loadJson<ExpectedStandings>('expected_standings.json');
const stages: FixtureStage[] = [];
for (let n = 1; n <= expected.stages_completed; n++) {
  stages.push(loadJson<FixtureStage>('stage_results', `stage_${n}.json`));
}

// Rider "ids" in this test are folded name keys: the fixture is
// case-inconsistent and ASCII-folded, so exact keys would silently drop
// contributions (exactly what must not happen).
const selections: SelectionInput[] = [];
for (const participant of teamSelections) {
  const riderNames = participant.riders.filter((name) => name && name.trim());
  riderNames.forEach((name, index) => {
    selections.push({
      participant_id: participant.id,
      rider_id: foldedRiderNameKey(name),
      position: index + 1,
      replaced_at_stage: null,
    });
  });
  if (participant.reserve && participant.reserve.trim()) {
    selections.push({
      participant_id: participant.id,
      rider_id: foldedRiderNameKey(participant.reserve),
      position: 11,
      // Pre-race activations (non-starters, or P115's 9-rider roster where
      // the reserve counts from the start) → from stage 1.
      replaced_at_stage: participant.reserve_active ? 1 : null,
    });
  }
}

// Mid-Tour substitutions (Q1: also mid-race; Q2: from the activation stage
// on; Q4: at most one — the reserve only activates while still unused),
// driven by the fixtures' casualty lists exactly like lib/pipeline
// updateActiveSelections: DNS at stage s activates from s, DNF/OTL/DSQ at
// stage s activates from s+1 (owner ruling July 14 2026).
const byParticipant = new Map<string, SelectionInput[]>();
for (const selection of selections) {
  const list = byParticipant.get(selection.participant_id) ?? [];
  list.push(selection);
  byParticipant.set(selection.participant_id, list);
}
const stageByNumber = new Map(stages.map((s) => [s.stage_number, s]));
for (const stage of stages) {
  const previous = stageByNumber.get(stage.stage_number - 1);
  const casualties = new Set([
    ...(stage.dns ?? []).map(foldedRiderNameKey),
    ...(previous?.dnf ?? []).map(foldedRiderNameKey),
  ]);
  if (casualties.size === 0) continue;
  for (const list of byParticipant.values()) {
    const reserve = list.find((s) => s.position === 11);
    for (const main of list) {
      if (main.position > 10 || !casualties.has(main.rider_id) || main.replaced_at_stage != null)
        continue;
      main.replaced_at_stage = stage.stage_number;
      if (reserve && reserve.replaced_at_stage == null && !casualties.has(reserve.rider_id)) {
        reserve.replaced_at_stage = stage.stage_number;
      }
    }
  }
}

describe(`golden fixtures 2026 (128 participants × ${expected.stages_completed} stages)`, () => {
  it('reproduces every stage total and cumulative total exactly', () => {
    const cumulative = new Map<string, number>();
    let checked = 0;

    for (const stage of stages) {
      const riderPoints = computeRiderStagePoints(
        stage.top_20.map((entry) => ({
          rider_id: foldedRiderNameKey(entry.rider),
          position: entry.position,
        })),
        Object.entries(stage.jerseys)
          .filter(([, name]) => name)
          .map(
            ([jerseyType, name]): StageJerseyInput => ({
              jersey_type: jerseyType as JerseyType,
              rider_id: foldedRiderNameKey(name),
            })
          ),
        stage.combativity ? foldedRiderNameKey(stage.combativity) : null
      );

      const participantPoints = computeParticipantStagePoints(
        riderPoints,
        selections,
        stage.stage_number
      );

      for (const participant of teamSelections) {
        const stageTotal =
          (participantPoints.get(participant.id)?.total_points ?? 0) +
          dagploegBonus(participant.ploeg, stage.dagploeg);

        const stageKey = `stage_${stage.stage_number}`;
        const expectedParticipant = expected.participants[participant.id];
        expect(
          stageTotal,
          `${participant.id} ${stageKey} (directie ${participant.directie})`
        ).toBe(expectedParticipant.stage_points[stageKey]);

        const runningTotal = (cumulative.get(participant.id) ?? 0) + stageTotal;
        cumulative.set(participant.id, runningTotal);
        expect(runningTotal, `${participant.id} cumulative ${stageKey}`).toBe(
          expectedParticipant.cumulative[stageKey]
        );
        checked++;
      }
    }

    expect(checked).toBe(teamSelections.length * stages.length);
  });
});
