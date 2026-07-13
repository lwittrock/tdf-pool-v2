/**
 * Merge two rider rows that are the same physical person under different
 * spellings (the pool Excel is inconsistent: "TOBIAS JOHANNESSEN" vs
 * "TOBIAS HALLAND JOHANNESSEN"). All references to the removed row are
 * remapped onto the kept row; derived points rows of the removed rider are
 * deleted (they are rebuilt on reprocess).
 *
 * Usage:
 *   npm run merge:riders -- --keep "TOBIAS HALLAND JOHANNESSEN" --remove "TOBIAS JOHANNESSEN"
 *   npm run merge:riders -- --apply --keep "..." --remove "..."
 *
 * AFTERWARDS: recompute every stage from the first one the rider scored in,
 * in order (cumulative totals ripple):
 *   npm run process:stages -- --apply 2 3 4 5 6 7 8 9
 *
 * Note: a merge is a pool ruling layered on top of the faithful import —
 * a fresh import of the fixtures recreates both rows (the golden fixtures
 * reproduce the Excel, which scored the spellings separately).
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
for (const envFile of ['.env.local', '.env']) {
  const path = join(root, envFile);
  if (existsSync(path)) loadEnv({ path });
}

const APPLY = process.argv.includes('--apply');

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const keepName = argValue('--keep');
  const removeName = argValue('--remove');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !keepName || !removeName) {
    console.error('Vereist: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY én --keep "NAAM" --remove "NAAM"');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data: riders, error } = await supabase
    .from('riders')
    .select('id, name, team')
    .in('name', [keepName, removeName]);
  if (error) throw new Error(error.message);
  const keep = riders?.find((r) => r.name === keepName);
  const remove = riders?.find((r) => r.name === removeName);
  if (!keep || !remove) {
    console.error(`Niet gevonden: ${!keep ? keepName : removeName}`);
    process.exit(1);
  }
  console.log(`Behouden:    ${keep.name} (${keep.team})`);
  console.log(`Verwijderen: ${remove.name} (${remove.team})`);

  // References to remap / clean up. Derived tables are deleted, not
  // remapped — reprocessing rebuilds them.
  const remap: Array<[table: string, column: string]> = [
    ['stage_results', 'rider_id'],
    ['stage_jerseys', 'rider_id'],
    ['stage_combativity', 'rider_id'],
    ['stage_dnf', 'rider_id'],
    ['participant_rider_selections', 'rider_id'],
    ['participant_rider_selections', 'replacement_for_rider_id'],
  ];
  const derived: string[] = ['rider_stage_points', 'participant_rider_contributions'];

  for (const [table, column] of remap) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(column, remove.id);
    console.log(`  ${table}.${column}: ${count ?? 0} rijen → ${keep.name}`);
    if (APPLY && (count ?? 0) > 0) {
      const { error: remapError } = await supabase
        .from(table)
        .update({ [column]: keep.id })
        .eq(column, remove.id);
      if (remapError) throw new Error(`${table}: ${remapError.message}`);
    }
  }
  for (const table of derived) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('rider_id', remove.id);
    console.log(`  ${table}: ${count ?? 0} afgeleide rijen verwijderen`);
    if (APPLY && (count ?? 0) > 0) {
      const { error: delError } = await supabase.from(table).delete().eq('rider_id', remove.id);
      if (delError) throw new Error(`${table}: ${delError.message}`);
    }
  }

  if (APPLY) {
    const { error: deleteError } = await supabase.from('riders').delete().eq('id', remove.id);
    if (deleteError) throw new Error(`Renner verwijderen mislukt: ${deleteError.message}`);
    console.log('Klaar. Herbereken nu de etappes (zie usage bovenin dit script).');
  } else {
    console.log('\nDry run klaar. Draai met --apply om samen te voegen.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
