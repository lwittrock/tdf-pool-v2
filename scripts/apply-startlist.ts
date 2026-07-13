/**
 * Load the real 2026 startlist (data/2026/startlist.json) into the riders
 * table: set the team on existing riders (matched accent/case-insensitively,
 * so the DB's Excel spellings are preserved) and insert startlist riders
 * that don't exist yet. Afterwards, stages.winning_team is refreshed for
 * completed stages from the position-1 finisher's (now real) team.
 *
 * Usage:
 *   npm run apply:startlist              # dry run: report, no writes
 *   npm run apply:startlist -- --apply   # write
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (reads .env.local/.env).
 * Note: the site shows the new teams after the next publish (stage entry or
 * republish) — this script only updates the database.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { foldedRiderNameKey } from '../lib/rider-names.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

for (const envFile of ['.env.local', '.env']) {
  const path = join(root, envFile);
  if (existsSync(path)) loadEnv({ path });
}

const APPLY = process.argv.includes('--apply');

interface Startlist {
  teams: Array<{ name: string; riders: string[] }>;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn vereist (zet ze in .env.local)');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const startlist = JSON.parse(
    readFileSync(join(root, 'data', '2026', 'startlist.json'), 'utf8')
  ) as Startlist;
  const teamByKey = new Map<string, { team: string; name: string }>();
  for (const team of startlist.teams) {
    for (const rider of team.riders) {
      teamByKey.set(foldedRiderNameKey(rider), { team: team.name, name: rider });
    }
  }
  console.log(`Startlijst: ${teamByKey.size} renners, ${startlist.teams.length} ploegen`);

  const { data: riders, error } = await supabase.from('riders').select('id, name, team');
  if (error || !riders) throw new Error(`Renners laden mislukt: ${error?.message}`);

  // ---- 1. Team on existing riders ------------------------------------------
  let updated = 0;
  const matchedKeys = new Set<string>();
  const unmatched: string[] = [];
  for (const rider of riders) {
    const hit = teamByKey.get(foldedRiderNameKey(rider.name));
    if (!hit) {
      unmatched.push(rider.name);
      continue;
    }
    matchedKeys.add(foldedRiderNameKey(rider.name));
    if (rider.team !== hit.team) {
      updated++;
      if (APPLY) {
        const { error: updateError } = await supabase
          .from('riders')
          .update({ team: hit.team })
          .eq('id', rider.id);
        if (updateError) throw new Error(`Team bijwerken mislukt (${rider.name}): ${updateError.message}`);
      }
    }
  }
  console.log(`${updated} bestaande renners krijgen hun ploeg${APPLY ? '' : ' (dry run)'}`);
  if (unmatched.length > 0) {
    console.log(`${unmatched.length} renners in de database staan NIET op de startlijst (blijven ${'`'}ONBEKEND${'`'}):`);
    for (const name of unmatched) console.log(`  - ${name}`);
  }

  // ---- 2. Startlist riders missing from the DB ------------------------------
  const missing = [...teamByKey.entries()].filter(([nameKey]) => !matchedKeys.has(nameKey));
  console.log(`${missing.length} startlijstrenners nog niet in de database${APPLY ? ', worden aangemaakt' : ' (dry run)'}`);
  if (APPLY) {
    for (const [, { team, name }] of missing) {
      const { error: insertError } = await supabase
        .from('riders')
        .insert({ name, team, is_active: true });
      if (insertError) throw new Error(`Renner aanmaken mislukt (${name}): ${insertError.message}`);
    }
  }

  // ---- 3. Refresh stages.winning_team from the winner's real team ----------
  const { data: stages } = await supabase
    .from('stages')
    .select('id, stage_number, winning_team')
    .eq('is_complete', true)
    .order('stage_number');
  for (const stage of stages ?? []) {
    const { data: winner } = await supabase
      .from('stage_results')
      .select('rider_id, riders!inner(name, team)')
      .eq('stage_id', stage.id)
      .eq('position', 1)
      .maybeSingle();
    if (!winner) continue;
    const winnerRider = winner.riders as unknown as { name: string; team: string };
    const team = teamByKey.get(foldedRiderNameKey(winnerRider.name))?.team ?? winnerRider.team;
    if (team && team !== stage.winning_team) {
      console.log(`Etappe ${stage.stage_number}: winning_team ${stage.winning_team} → ${team}`);
      if (APPLY) {
        await supabase.from('stages').update({ winning_team: team }).eq('id', stage.id);
      }
    }
  }

  console.log(APPLY ? 'Klaar. De site is bij na de eerstvolgende publish.' : '\nDry run klaar. Draai met --apply om te schrijven.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
