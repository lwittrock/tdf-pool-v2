/**
 * Golden fixture test (WP-A3 seed of the full WP-B9 suite).
 *
 * Recomputes all 128 participants × stages 1–4 of the 2026 Tour from
 * data/2026/fixtures/ and compares against expected_standings.json (the
 * live Excel administration). The fixtures are the acceptance test for all
 * scoring work: never "fix" the fixtures to match the code.
 *
 * The Dagploeg +6 rule is not implemented in the engine yet (WP-B1); this
 * test applies it externally from the fixture's per-stage `dagploeg` field
 * so the roster/points core is still verified against the real totals.
 * When WP-B1 lands, move the +6 into the engine and delete it here.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeRiderStagePoints,
  computeParticipantStagePoints,
  type SelectionInput,
  type StageJerseyInput,
} from '../lib/scoring';
import { foldedRiderNameKey, riderNameKey } from '../lib/rider-names';
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
  dagploeg: string;
  /** Mid-Tour DNS riders (activate the reserve, Q1/Q3). */
  dns?: string[];
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

// Mid-Tour DNS substitutions (Q1: also mid-race; Q2: from that stage on;
// Q4: at most one — the reserve only activates while still unused), driven
// by the fixtures' dns lists exactly like lib/pipeline updateActiveSelections.
const byParticipant = new Map<string, SelectionInput[]>();
for (const selection of selections) {
  const list = byParticipant.get(selection.participant_id) ?? [];
  list.push(selection);
  byParticipant.set(selection.participant_id, list);
}
for (const stage of stages) {
  const dns = new Set((stage.dns ?? []).map(foldedRiderNameKey));
  if (dns.size === 0) continue;
  for (const list of byParticipant.values()) {
    const reserve = list.find((s) => s.position === 11);
    for (const main of list) {
      if (main.position > 10 || !dns.has(main.rider_id) || main.replaced_at_stage != null) continue;
      main.replaced_at_stage = stage.stage_number;
      if (reserve && reserve.replaced_at_stage == null && !dns.has(reserve.rider_id)) {
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
        // Dagploeg +6 — WP-B1 rule, applied externally for now (see header).
        const dagploegBonus =
          riderNameKey(participant.ploeg) === riderNameKey(stage.dagploeg) ? 6 : 0;
        const stageTotal =
          (participantPoints.get(participant.id)?.total_points ?? 0) + dagploegBonus;

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
