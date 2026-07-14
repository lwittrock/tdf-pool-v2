/**
 * Acceptance check: the database's computed standings must equal the golden
 * expected standings (the owner's Excel administration) cell for cell —
 * stage points AND cumulative totals, Dagploeg +6 included (the engine
 * computes it since WP-B1).
 *
 * Run after any reprocess, rebuild, or rule change:
 *   npm run verify:standings
 *
 * Exits 1 (with a diff list) on any mismatch.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (reads .env.local/.env).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { getServiceClient, fetchAll } from '../lib/supabase-server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
for (const envFile of ['.env.local', '.env']) {
  const path = join(root, envFile);
  if (existsSync(path)) loadEnv({ path });
}

interface Expected {
  stages_completed: number;
  participants: Record<
    string,
    { stage_points: Record<string, number>; cumulative: Record<string, number> }
  >;
  directie_groups: Record<string, string[]>;
  /** Average of the top-5 cumulative at stages_completed, 1 decimal (sheet formula). */
  directie_scores_computed: Record<string, number>;
}

async function main(): Promise<void> {
  const expected = JSON.parse(
    readFileSync(join(root, 'data', '2026', 'fixtures', 'expected_standings.json'), 'utf8')
  ) as Expected;
  const supabase = getServiceClient();

  const [{ data: stages }, { data: participants }] = await Promise.all([
    supabase.from('stages').select('id, stage_number').eq('is_complete', true),
    supabase.from('participants').select('id, name'),
  ]);
  const stageNumberById = new Map((stages ?? []).map((s) => [s.id, s.stage_number]));
  const nameById = new Map((participants ?? []).map((p) => [p.id, p.name]));

  const rows = await fetchAll<{
    participant_id: string;
    stage_id: string;
    stage_points: number;
    cumulative_points: number;
  }>((from, to) =>
    supabase
      .from('participant_stage_points')
      .select('participant_id, stage_id, stage_points, cumulative_points')
      .order('id')
      .range(from, to)
  );
  const byKey = new Map(
    rows.map((row) => [
      `${nameById.get(row.participant_id)}|${stageNumberById.get(row.stage_id)}`,
      row,
    ])
  );

  const diffs: string[] = [];
  let checked = 0;
  for (const [pcode, pdata] of Object.entries(expected.participants)) {
    for (let n = 1; n <= expected.stages_completed; n++) {
      const stageKey = `stage_${n}`;
      const row = byKey.get(`${pcode}|${n}`);
      if (!row) {
        diffs.push(`${pcode} ${stageKey}: ontbreekt in de database`);
        continue;
      }
      if (row.stage_points !== pdata.stage_points[stageKey]) {
        diffs.push(
          `${pcode} ${stageKey}: etappepunten ${row.stage_points} (DB) vs ${pdata.stage_points[stageKey]} (golden)`
        );
      }
      if (row.cumulative_points !== pdata.cumulative[stageKey]) {
        diffs.push(
          `${pcode} ${stageKey}: cumulatief ${row.cumulative_points} (DB) vs ${pdata.cumulative[stageKey]} (golden)`
        );
      }
      checked += 2;
    }
  }

  // Directie scores: average of the top-5 cumulative at the last golden stage
  // (owner ruling July 2026 — the sheet's AVERAGE formula, not a sum).
  for (const [directie, members] of Object.entries(expected.directie_groups)) {
    const cumulatives = members
      .map((pcode) => byKey.get(`${pcode}|${expected.stages_completed}`)?.cumulative_points)
      .filter((points): points is number => points !== undefined)
      .sort((a, b) => b - a)
      .slice(0, 5);
    const dbScore =
      cumulatives.length === 0
        ? 0
        : Math.round((cumulatives.reduce((sum, points) => sum + points, 0) / cumulatives.length) * 10) / 10;
    const goldenScore = expected.directie_scores_computed[directie];
    if (dbScore !== goldenScore) {
      diffs.push(`directie ${directie}: top-5-gemiddelde ${dbScore} (DB) vs ${goldenScore} (golden)`);
    }
    checked += 1;
  }

  if (diffs.length > 0) {
    console.error(`AFWIJKINGEN (${diffs.length}) na ${checked} cellen:`);
    for (const d of diffs.slice(0, 30)) console.error(`  - ${d}`);
    if (diffs.length > 30) console.error(`  ... en ${diffs.length - 30} meer`);
    process.exit(1);
  }
  console.log(
    `OK: ${checked} cellen (etappepunten + cumulatief, ${Object.keys(expected.participants).length} deelnemers × ${expected.stages_completed} etappes, plus ${Object.keys(expected.directie_groups).length} directiescores) exact gelijk aan de golden standings.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
