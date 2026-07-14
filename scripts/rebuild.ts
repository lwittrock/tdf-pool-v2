/**
 * One-command rebuild (WP-B7): reconstruct the full database + published
 * snapshots from the repo, e.g. after losing the Supabase project (free
 * tier has no backups — this script plus the entry log IS the disaster
 * recovery). Idempotent: safe on an existing database too (it converges to
 * the same state).
 *
 * Prerequisite (manual, once per fresh project): run the SQL migrations in
 * the Supabase SQL editor, in order:
 *   supabase/migrations/000_base_schema.sql
 *   supabase/migrations/001_phase_a.sql
 *   supabase/migrations/002_phase_b1.sql
 * This script checks they ran and stops with instructions if not.
 *
 * Then:
 *   npm run rebuild             # dry run: prints the plan + schema check
 *   npm run rebuild -- --apply  # execute all steps
 *
 * Steps: import participants → load startlist/teams → replay all fixture
 * stages (validates, computes, publishes) → re-apply owner rulings
 * (data/2026/rulings.json) → reprocess all stages → verify against the
 * golden standings.
 *
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BLOB_READ_WRITE_TOKEN.
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { getServiceClient } from '../lib/supabase-server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
for (const envFile of ['.env.local', '.env']) {
  const path = join(root, envFile);
  if (existsSync(path)) loadEnv({ path });
}

const APPLY = process.argv.includes('--apply');

interface Ruling {
  type: string;
  keep?: string;
  remove?: string;
}

function run(command: string): void {
  console.log(`\n>>> ${command}`);
  execSync(command, { cwd: root, stdio: 'inherit' });
}

async function checkSchema(): Promise<void> {
  const supabase = getServiceClient();
  const probes: Array<[string, string]> = [
    ['riders', '000_base_schema.sql'],
    ['stage_entry_log', '001_phase_a.sql'],
    ['rider_aliases', '002_phase_b1.sql'],
  ];
  const missing: string[] = [];
  for (const [table, migration] of probes) {
    const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' }).limit(1);
    if (error) missing.push(`${migration} (tabel ${table}: ${error.message})`);
  }
  if (missing.length > 0) {
    console.error('Schema onvolledig. Draai eerst in de Supabase SQL-editor, in volgorde:');
    for (const m of missing) console.error(`  - supabase/migrations/${m}`);
    process.exit(1);
  }
  console.log('Schema-check OK (base, phase A, phase B1).');
}

async function main(): Promise<void> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY en BLOB_READ_WRITE_TOKEN zijn vereist (.env.local/.env)');
    process.exit(1);
  }
  await checkSchema();

  const stageFiles = readdirSync(join(root, 'data', '2026', 'fixtures', 'stage_results'))
    .filter((f) => /^stage_\d+\.json$/.test(f)).length;
  const rulings = (
    JSON.parse(readFileSync(join(root, 'data', '2026', 'rulings.json'), 'utf8')) as { rulings: Ruling[] }
  ).rulings;

  console.log(`\nPlan: import 128 deelnemers → startlijst/ploegen → replay ${stageFiles} etappes → ${rulings.length} ruling(s) → herbereken alles → verifieer tegen golden standings.`);
  if (!APPLY) {
    console.log('Dry run klaar. Draai met --apply om uit te voeren.');
    return;
  }

  run('npm run import:fixtures -- --apply --create-missing');
  run('npm run apply:startlist -- --apply');
  run('npm run replay:stages -- --apply --local');
  for (const ruling of rulings) {
    if (ruling.type === 'merge_riders' && ruling.keep && ruling.remove) {
      run(`npm run merge:riders -- --apply --keep "${ruling.keep}" --remove "${ruling.remove}"`);
    } else {
      throw new Error(`Onbekende ruling: ${JSON.stringify(ruling)}`);
    }
  }
  const allStages = Array.from({ length: stageFiles }, (_, i) => i + 1).join(' ');
  run(`npm run process:stages -- --apply ${allStages}`);
  run('npm run verify:standings');
  console.log('\nRebuild klaar en geverifieerd.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
