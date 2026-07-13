/**
 * One-off idempotent import of the 2026 pool (WP-A3, Q18).
 *
 * Imports data/2026/fixtures/team_selections.json — the ANONYMIZED P-coded
 * set, per owner decision (July 2026): the PoC shows P-codes for now.
 *
 * What it does, idempotently (safe to re-run):
 *   1. resolves every rider name against the riders table
 *      (case-insensitive + accent-folded: the Excel export is ASCII-folded)
 *   2. upserts directies (raw strings; canonicalization/aliases come in WP-B1)
 *   3. upserts participants (name = P-code, ploeg, directie)
 *   4. replaces each participant's 11 selections; an active reserve is
 *      stamped replaced_at_stage = 1 (all observed activations are pre-race
 *      non-starters; the fixture does not say WHICH main rider was replaced,
 *      and a pre-race DNS main scores 0 anyway, so mains stay untouched)
 *
 * Usage:
 *   npm run import:fixtures                  # dry check: report, no writes
 *   npm run import:fixtures -- --apply       # write to the database
 *   npm run import:fixtures -- --apply --create-missing
 *       also inserts riders that are not in the startlist (team ONBEKEND)
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (reads .env.local/.env).
 * Afterwards: enter/process stages via the beheer UI, or force-reprocess
 * existing stages via POST /api/admin/process-stage.
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
const CREATE_MISSING = process.argv.includes('--create-missing');

interface FixtureParticipant {
  id: string;
  directie: string;
  riders: string[];
  reserve: string | null;
  reserve_active: boolean;
  ploeg: string;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn vereist (zet ze in .env.local)');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const fixturePath = join(root, 'data', '2026', 'fixtures', 'team_selections.json');
  const participants = JSON.parse(readFileSync(fixturePath, 'utf8')) as FixtureParticipant[];
  console.log(`Fixture: ${participants.length} deelnemers`);

  // ---- 1. Resolve rider names ---------------------------------------------
  const { data: riders, error: ridersError } = await supabase
    .from('riders')
    .select('id, name');
  if (ridersError) throw new Error(`Renners laden mislukt: ${ridersError.message}`);

  const riderIdByKey = new Map<string, string>();
  for (const rider of riders ?? []) {
    riderIdByKey.set(foldedRiderNameKey(rider.name), rider.id);
  }
  console.log(`Database: ${riders?.length ?? 0} renners`);

  const allNames = new Map<string, string>(); // key -> first-seen raw name
  for (const p of participants) {
    for (const name of [...p.riders, p.reserve ?? '']) {
      if (name && name.trim()) {
        const nameKey = foldedRiderNameKey(name);
        if (!allNames.has(nameKey)) allNames.set(nameKey, name.trim());
      }
    }
  }

  const missing = [...allNames.entries()].filter(([nameKey]) => !riderIdByKey.has(nameKey));
  if (missing.length > 0) {
    console.log(`\n${missing.length} renners niet gevonden in de database:`);
    for (const [, raw] of missing) console.log(`  - ${raw}`);
    if (!CREATE_MISSING) {
      console.error(
        '\nGestopt. Importeer eerst de startlijst, of draai met --create-missing ' +
          'om ze aan te maken met team ONBEKEND.'
      );
      process.exit(1);
    }
    if (APPLY) {
      for (const [nameKey, raw] of missing) {
        const { data, error } = await supabase
          .from('riders')
          .insert({ name: raw, team: 'ONBEKEND', is_active: true })
          .select('id')
          .single();
        if (error || !data) throw new Error(`Renner aanmaken mislukt (${raw}): ${error?.message}`);
        riderIdByKey.set(nameKey, data.id);
      }
      console.log(`${missing.length} renners aangemaakt met team ONBEKEND`);
    }
  }

  if (!APPLY) {
    const activeReserves = participants.filter((p) => p.reserve_active).length;
    console.log(
      `\nDry run klaar: ${allNames.size} unieke renners, ` +
        `${new Set(participants.map((p) => p.directie)).size} directies, ` +
        `${activeReserves} actieve reserves. Draai met --apply om te schrijven.`
    );
    return;
  }

  // ---- 2. Directies ----------------------------------------------------------
  const directieIdByName = new Map<string, string>();
  for (const name of new Set(participants.map((p) => p.directie))) {
    const { data, error } = await supabase
      .from('directie')
      .upsert({ name }, { onConflict: 'name' })
      .select('id')
      .single();
    if (error || !data) throw new Error(`Directie upsert mislukt (${name}): ${error?.message}`);
    directieIdByName.set(name, data.id);
  }
  console.log(`${directieIdByName.size} directies`);

  // ---- 3 + 4. Participants + selections --------------------------------------
  for (const p of participants) {
    const { data: participant, error: participantError } = await supabase
      .from('participants')
      .upsert(
        { name: p.id, directie_id: directieIdByName.get(p.directie), ploeg: p.ploeg },
        { onConflict: 'name' }
      )
      .select('id')
      .single();
    if (participantError || !participant) {
      throw new Error(`Deelnemer upsert mislukt (${p.id}): ${participantError?.message}`);
    }

    const { error: deleteError } = await supabase
      .from('participant_rider_selections')
      .delete()
      .eq('participant_id', participant.id);
    if (deleteError) throw new Error(`Selecties wissen mislukt (${p.id}): ${deleteError.message}`);

    const rows: Array<Record<string, unknown>> = [];
    const riderNames = p.riders.filter((name) => name && name.trim());
    riderNames.forEach((name, index) => {
      rows.push({
        participant_id: participant.id,
        rider_id: riderIdByKey.get(foldedRiderNameKey(name)),
        position: index + 1,
        is_active: true,
        replaced_at_stage: null,
      });
    });
    if (p.reserve && p.reserve.trim()) {
      rows.push({
        participant_id: participant.id,
        rider_id: riderIdByKey.get(foldedRiderNameKey(p.reserve)),
        position: 11,
        is_active: p.reserve_active,
        replaced_at_stage: p.reserve_active ? 1 : null,
      });
    }

    const { error: insertError } = await supabase
      .from('participant_rider_selections')
      .insert(rows);
    if (insertError) throw new Error(`Selecties invoegen mislukt (${p.id}): ${insertError.message}`);
  }

  console.log(`${participants.length} deelnemers geïmporteerd met selecties`);
  console.log(
    'Klaar. Herbereken bestaande etappes via POST /api/admin/process-stage ' +
      '{"stage_number": N, "force": true} en de site is bij.'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
