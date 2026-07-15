/**
 * Normalize directie names and merge duplicate/variant rows, then republish.
 *
 * Rules (owner ruling, July 2026):
 *   - any case variant of "dte"  -> "DTE"
 *   - "Consumenten"              -> "DC"
 *   - anything with "i-domein"   -> "DI"
 *   - "Vrienden van ..."         -> "Vrienden"
 *   - everything else            -> unchanged
 *
 * When a normalized target already exists as its own directie row, the variant
 * rows are *merged*: their participants are reassigned to the target row and the
 * variant rows are deleted (their directie_stage_points cascade away — those are
 * not used by snapshot generation, which derives directie standings from
 * participant_stage_points grouped by participants.directie_id). When no target
 * row exists yet (e.g. "Vrienden"), the single source row is simply renamed.
 *
 * Idempotent: re-running after a successful apply finds nothing to do.
 *
 * Usage:
 *   npm run normalize:directies            # dry run: prints the plan
 *   npm run normalize:directies -- --apply # merge/rename + republish
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

type DirectieRow = { id: string; name: string };

function normalize(name: string): string {
  const n = name.trim();
  if (/^dte$/i.test(n)) return 'DTE';
  if (/^consumenten$/i.test(n)) return 'DC';
  if (/i-?domein/i.test(n)) return 'DI';
  if (/^vrienden\b/i.test(n)) return 'Vrienden';
  return n;
}

async function main() {
  const { getServiceClient } = await import('../lib/supabase-server.js');
  const supabase = getServiceClient();

  const { data: directies, error } = await supabase.from('directie').select('id, name');
  if (error) throw error;
  const rows = (directies ?? []) as DirectieRow[];

  const { data: participants, error: pErr } = await supabase
    .from('participants')
    .select('id, directie_id');
  if (pErr) throw pErr;
  const countById = new Map<string, number>();
  for (const p of participants ?? []) {
    if (!p.directie_id) continue;
    countById.set(p.directie_id, (countById.get(p.directie_id) ?? 0) + 1);
  }

  // Group source rows by their normalized target name.
  const groups = new Map<string, DirectieRow[]>();
  for (const row of rows) {
    const target = normalize(row.name);
    const list = groups.get(target) ?? [];
    list.push(row);
    groups.set(target, list);
  }

  type Plan = {
    target: string;
    keeper: DirectieRow;
    rename: boolean;
    merges: DirectieRow[];
  };
  const plans: Plan[] = [];

  for (const [target, groupRows] of groups) {
    // Prefer a row that already carries the canonical name as the keeper.
    const keeper = groupRows.find((r) => r.name === target) ?? groupRows[0];
    const merges = groupRows.filter((r) => r.id !== keeper.id);
    const rename = keeper.name !== target;
    if (!rename && merges.length === 0) continue; // nothing to do for this group
    plans.push({ target, keeper, rename, merges });
  }

  if (plans.length === 0) {
    console.log('\nNothing to normalize — all directie names already canonical.\n');
    return;
  }

  console.log('\nPlanned changes:');
  for (const p of plans) {
    if (p.rename) {
      console.log(`  rename "${p.keeper.name}" -> "${p.target}" (${countById.get(p.keeper.id) ?? 0} participants)`);
    } else {
      console.log(`  keep   "${p.target}" (${countById.get(p.keeper.id) ?? 0} participants)`);
    }
    for (const m of p.merges) {
      console.log(`  merge  "${m.name}" -> "${p.target}" (reassign ${countById.get(m.id) ?? 0} participants, delete row)`);
    }
  }

  if (!APPLY) {
    console.log('\nDRY RUN — pass --apply to merge/rename and republish.\n');
    return;
  }

  for (const p of plans) {
    // Reassign participants from each merged row to the keeper, then delete it.
    for (const m of p.merges) {
      const { error: uErr } = await supabase
        .from('participants')
        .update({ directie_id: p.keeper.id })
        .eq('directie_id', m.id);
      if (uErr) throw new Error(`reassign participants from ${m.name}: ${uErr.message}`);

      const { error: dErr } = await supabase.from('directie').delete().eq('id', m.id);
      if (dErr) throw new Error(`delete directie ${m.name}: ${dErr.message}`);
    }
    if (p.rename) {
      const { error: rErr } = await supabase
        .from('directie')
        .update({ name: p.target })
        .eq('id', p.keeper.id);
      if (rErr) throw new Error(`rename ${p.keeper.name} -> ${p.target}: ${rErr.message}`);
    }
  }
  console.log('\nApplied. Republishing…');

  const { generateAndPublish } = await import('../lib/pipeline.js');
  const result = await generateAndPublish();
  console.log('Published:', JSON.stringify(result));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
