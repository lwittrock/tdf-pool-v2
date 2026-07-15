/**
 * Backfill the `stages` table from the official 2026 route
 * (lib/stage-schedule.ts) and republish snapshots.
 *
 * Idempotent and non-destructive: only fills route/date/distance/type that are
 * currently NULL on existing stage rows, and inserts rows for stages that don't
 * exist yet (is_complete defaults to false). Never touches results, is_complete,
 * difficulty, won_how, or scoring. `generateAndPublish` then regenerates the
 * snapshots from the current DB.
 *
 * Usage:
 *   npm run apply:stage-schedule            # dry run: prints the plan
 *   npm run apply:stage-schedule -- --apply # write + republish
 *
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BLOB_READ_WRITE_TOKEN.
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
for (const envFile of ['.env.local', '.env']) {
  const path = join(root, envFile);
  if (existsSync(path)) loadEnv({ path });
}

const APPLY = process.argv.includes('--apply');

type StageRow = {
  stage_number: number;
  date: string | null;
  distance: string | null;
  departure_city: string | null;
  arrival_city: string | null;
  stage_type: string | null;
};

async function main() {
  const { getServiceClient } = await import('../lib/supabase-server.js');
  const { STAGE_SCHEDULE } = await import('../lib/stage-schedule.js');
  const supabase = getServiceClient();

  const { data: existing, error } = await supabase
    .from('stages')
    .select('stage_number, date, distance, departure_city, arrival_city, stage_type');
  if (error) throw error;
  const byNum = new Map<number, StageRow>((existing ?? []).map((s) => [s.stage_number, s as StageRow]));

  const inserts: Record<string, unknown>[] = [];
  const updates: { stage_number: number; patch: Record<string, unknown> }[] = [];

  for (const sched of Object.values(STAGE_SCHEDULE)) {
    const cur = byNum.get(sched.stage_number);
    if (!cur) {
      inserts.push({
        stage_number: sched.stage_number,
        date: sched.date,
        distance: sched.distance,
        departure_city: sched.departure_city,
        arrival_city: sched.arrival_city,
        stage_type: sched.stage_type,
      });
      continue;
    }
    const patch: Record<string, unknown> = {};
    if (!cur.date) patch.date = sched.date;
    if (!cur.distance) patch.distance = sched.distance;
    if (!cur.departure_city) patch.departure_city = sched.departure_city;
    if (!cur.arrival_city) patch.arrival_city = sched.arrival_city;
    if (!cur.stage_type && sched.stage_type) patch.stage_type = sched.stage_type;
    if (Object.keys(patch).length > 0) updates.push({ stage_number: sched.stage_number, patch });
  }

  console.log(`\nInserts (${inserts.length}):`, inserts.map((i) => i.stage_number).join(', ') || '—');
  console.log(`Updates (${updates.length}):`);
  for (const u of updates) console.log(`  stage ${u.stage_number}: ${Object.keys(u.patch).join(', ')}`);

  if (!APPLY) {
    console.log('\nDRY RUN — pass --apply to write and republish.\n');
    return;
  }

  for (const ins of inserts) {
    const { error: e } = await supabase.from('stages').insert(ins);
    if (e) throw new Error(`insert stage ${ins.stage_number}: ${e.message}`);
  }
  for (const u of updates) {
    const { error: e } = await supabase.from('stages').update(u.patch).eq('stage_number', u.stage_number);
    if (e) throw new Error(`update stage ${u.stage_number}: ${e.message}`);
  }
  console.log(`\nWrote ${inserts.length} inserts, ${updates.length} updates. Republishing…`);

  const { generateAndPublish } = await import('../lib/pipeline.js');
  const result = await generateAndPublish();
  console.log('Published:', JSON.stringify(result));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
