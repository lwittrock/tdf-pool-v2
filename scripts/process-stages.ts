/**
 * Recompute + republish stages from result rows already in the DB, running
 * the pipeline in-process (no Vercel maxDuration limit — the N+1 pipeline
 * outgrows 300s around stage 4 until WP-B2 lands). Unlike replay:stages this
 * does NOT re-enter results; it recomputes from what is in the database —
 * the repair tool after a rider merge or a corrected old stage.
 *
 * Always process in ascending order and continue through the latest stage:
 * cumulative totals only ripple forward from the stage being processed.
 *
 * Usage:
 *   npm run process:stages -- 2 3 4          # dry run: shows the plan
 *   npm run process:stages -- --apply 2 3 4  # recompute + publish
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
const STAGES = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number).sort((a, b) => a - b);

async function main(): Promise<void> {
  if (STAGES.length === 0) {
    console.error('Geef etappenummers op, bv: npm run process:stages -- --apply 2 3 4');
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY en BLOB_READ_WRITE_TOKEN zijn vereist');
    process.exit(1);
  }
  if (!APPLY) {
    console.log(`Dry run: zou etappes ${STAGES.join(', ')} herberekenen en publiceren. Draai met --apply.`);
    return;
  }
  const { processStage } = await import('../lib/pipeline.js');
  for (const stageNumber of STAGES) {
    console.log(`Etappe ${stageNumber} herberekenen...`);
    const result = await processStage(stageNumber);
    console.log(`  OK — run ${result.runId}`);
  }
  console.log('Klaar. De site volgt binnen ~2 minuten.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
