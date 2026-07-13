/**
 * Replay the 2026 fixture stage results into a fresh database via the
 * deployed /api/admin/enter-stage endpoint (go-live step 5 when the
 * Supabase project is new and holds no stage rows).
 *
 * Per stage in data/2026/fixtures/stage_results/:
 *   1. map the fixture shape to ManualStageEntry
 *      (top_20[].rider → top_20_finishers[].rider_name; no DNF/DNS lists)
 *   2. create riders that appear in the results but were never picked by a
 *      participant (the import script only creates picked riders) — team
 *      ONBEKEND, same as import --create-missing
 *   3. POST with force: true; the endpoint validates, swaps, recalculates
 *      and publishes — so after the last stage the site is live.
 *
 * Usage:
 *   npm run replay:stages                    # dry run: report, no writes
 *   npm run replay:stages -- --apply         # create missing riders + POST
 *   npm run replay:stages -- --apply 3 4     # only stages 3 and 4
 *   npm run replay:stages -- --apply --local 5 6 7 8 9
 *       runs the pipeline in-process instead of via the deployed endpoint —
 *       no Vercel maxDuration limit (the N+1 pipeline outgrows 300s around
 *       stage 4 until WP-B2 lands). Requires BLOB_READ_WRITE_TOKEN.
 *
 * Requires in .env.local (or .env):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — rider check/create (+ --local)
 *   ADMIN_TOKEN, APP_URL                     — endpoint mode only
 *   BLOB_READ_WRITE_TOKEN                    — --local mode only (publish)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { foldedRiderNameKey } from '../lib/rider-names.js';
import type { ManualStageEntry } from '../lib/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

for (const envFile of ['.env.local', '.env']) {
  const path = join(root, envFile);
  if (existsSync(path)) loadEnv({ path });
}

const APPLY = process.argv.includes('--apply');
const LOCAL = process.argv.includes('--local');
const stageArgs = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const STAGES = stageArgs.length > 0 ? stageArgs : [1, 2, 3, 4];

interface FixtureStage {
  stage_number: number;
  top_20: Array<{ position: number; rider: string }>;
  jerseys: { yellow: string; green: string; polka_dot: string; white: string };
  combativity: string | null;
  dagploeg: string;
  /** DNS riders (activate the reserve, Q1/Q3); source: PCS startlist annotations. */
  dns?: string[];
  dnf?: string[];
}

function toEntry(fixture: FixtureStage): ManualStageEntry {
  return {
    stage_number: fixture.stage_number,
    top_20_finishers: fixture.top_20.map((f) => ({
      rider_name: f.rider,
      position: f.position,
    })),
    jerseys: fixture.jerseys,
    combativity: fixture.combativity ?? undefined,
    dns_riders: fixture.dns,
    dnf_riders: fixture.dnf,
    force: true,
  };
}

function stageNames(fixture: FixtureStage): string[] {
  return [
    ...fixture.top_20.map((f) => f.rider),
    ...Object.values(fixture.jerseys),
    ...(fixture.combativity ? [fixture.combativity] : []),
    ...(fixture.dns ?? []),
    ...(fixture.dnf ?? []),
  ];
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminToken = process.env.ADMIN_TOKEN;
  const appUrl = (process.env.APP_URL ?? '').replace(/\/+$/, '');
  if (!url || !key) {
    console.error('SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn vereist (zet ze in .env.local)');
    process.exit(1);
  }
  if (LOCAL && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('--local vereist BLOB_READ_WRITE_TOKEN in .env.local (Vercel → Settings → Environment Variables)');
    process.exit(1);
  }
  if (!LOCAL && (!adminToken || !appUrl)) {
    console.error('ADMIN_TOKEN en APP_URL zijn vereist (of gebruik --local)');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const fixtures = STAGES.map((n) => {
    const path = join(root, 'data', '2026', 'fixtures', 'stage_results', `stage_${n}.json`);
    return JSON.parse(readFileSync(path, 'utf8')) as FixtureStage;
  });

  // ---- 1. Riders in the results that are not in the DB yet -----------------
  const { data: riders, error: ridersError } = await supabase.from('riders').select('name');
  if (ridersError) throw new Error(`Renners laden mislukt: ${ridersError.message}`);
  if ((riders?.length ?? 0) === 0) {
    console.error(
      'De riders-tabel is leeg — draai eerst de deelnemersimport: ' +
        'npm run import:fixtures -- --apply --create-missing'
    );
    process.exit(1);
  }
  const knownKeys = new Set((riders ?? []).map((r) => foldedRiderNameKey(r.name)));

  const missing = new Map<string, string>(); // key -> first-seen raw name
  for (const fixture of fixtures) {
    for (const name of stageNames(fixture)) {
      const nameKey = foldedRiderNameKey(name);
      if (!knownKeys.has(nameKey) && !missing.has(nameKey)) missing.set(nameKey, name.trim());
    }
  }

  if (missing.size > 0) {
    console.log(`${missing.size} renners uit de uitslagen staan nog niet in de database:`);
    for (const raw of missing.values()) console.log(`  - ${raw}`);
    if (APPLY) {
      for (const raw of missing.values()) {
        const { error } = await supabase
          .from('riders')
          .insert({ name: raw, team: 'ONBEKEND', is_active: true });
        if (error) throw new Error(`Renner aanmaken mislukt (${raw}): ${error.message}`);
      }
      console.log('Aangemaakt met team ONBEKEND.');
    }
  }

  if (!APPLY) {
    console.log(
      `\nDry run klaar: etappes ${STAGES.join(', ')} → ` +
        (LOCAL ? 'lokale pipeline (enterStage)' : `POST ${appUrl}/api/admin/enter-stage`) +
        '. Draai met --apply om in te sturen.'
    );
    return;
  }

  // ---- 2. Enter stages in order (each one recalculates + publishes) --------
  for (const fixture of fixtures) {
    const entry = toEntry(fixture);
    console.log(`\nEtappe ${entry.stage_number} insturen${LOCAL ? ' (lokaal)' : ''}...`);

    let runId: string | undefined;
    let warnings: string[] = [];
    let substitutions: unknown[] = [];
    if (LOCAL) {
      const { enterStage } = await import('../lib/enter-stage.js');
      const result = await enterStage(entry, 'replay-script-local');
      if (!result.ok) {
        console.error(`Etappe ${entry.stage_number} geweigerd (${result.status}):`);
        for (const err of result.errors) console.error(`  - ${err}`);
        process.exit(1);
      }
      runId = result.process.runId;
      warnings = result.warnings;
      substitutions = result.process.selections.substitutions;
    } else {
      const response = await fetch(`${appUrl}/api/admin/enter-stage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(entry),
      });
      const body = (await response.json()) as {
        success: boolean;
        error?: string;
        validation_errors?: string[];
        data?: { run_id: string; warnings: string[]; substitutions: unknown[] };
      };
      if (!response.ok || !body.success) {
        console.error(`Etappe ${entry.stage_number} geweigerd (${response.status}):`);
        for (const err of body.validation_errors ?? [body.error ?? 'onbekende fout']) {
          console.error(`  - ${err}`);
        }
        process.exit(1);
      }
      runId = body.data?.run_id;
      warnings = body.data?.warnings ?? [];
      substitutions = body.data?.substitutions ?? [];
    }

    console.log(
      `  OK — run ${runId}` +
        (warnings.length ? ` — waarschuwingen: ${warnings.join('; ')}` : '') +
        (substitutions.length ? ` — vervangingen: ${JSON.stringify(substitutions)}` : '')
    );
  }

  console.log('\nKlaar. De site volgt binnen ~2 minuten (pointer-cache + poll-interval).');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
