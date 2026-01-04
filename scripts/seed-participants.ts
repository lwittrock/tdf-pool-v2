// Script to import participants from participant_selections_anon.json
// Run this AFTER you've populated the riders table

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ParticipantSelection {
  name: string;
  directie: string;
  main_riders: string[];
  reserve_rider: string;
  team?: string;
}

async function seedParticipants() {
  console.log('Starting participant seed...\n');

  // Read the JSON file
  const dataPath = path.join(__dirname, '../data/participant_selections_anon.json');
  const participantsData: ParticipantSelection[] = JSON.parse(
    fs.readFileSync(dataPath, 'utf-8')
  );

  console.log(`Found ${participantsData.length} participants to import\n`);

  // Step 1: Get or create directie entries
  const directieMap = new Map<string, string>(); // name -> id
  const uniqueDirecties = [...new Set(participantsData.map(p => p.directie))];

  for (const directieName of uniqueDirecties) {
    // Try to get existing
    let { data: existing } = await supabase
      .from('directie')
      .select('id, name')
      .eq('name', directieName)
      .single();

    if (!existing) {
      // Create new
      const { data: created, error } = await supabase
        .from('directie')
        .insert({ name: directieName })
        .select('id, name')
        .single();

      if (error) {
        console.error(`Error creating directie ${directieName}:`, error);
        continue;
      }
      existing = created;
    }

    if (existing) {
      directieMap.set(directieName, existing.id);
      console.log(`✓ Directie: ${directieName} (${existing.id})`);
    }
  }

  console.log(`\n✓ Processed ${directieMap.size} directies\n`);

  // Step 2: Get all riders for name -> ID mapping
  const { data: riders, error: ridersError } = await supabase
    .from('riders')
    .select('id, name');

  if (ridersError || !riders) {
    console.error('Error fetching riders:', ridersError);
    return;
  }

  const riderMap = new Map(riders.map(r => [r.name, r.id]));
  console.log(`✓ Loaded ${riderMap.size} riders\n`);

  // Step 3: Import participants and their selections
  let successCount = 0;
  let errorCount = 0;

  for (const participantData of participantsData) {
    try {
      console.log(`Processing: ${participantData.name}...`);

      const directieId = directieMap.get(participantData.directie);
      if (!directieId) {
        console.error(`  ✗ Directie not found: ${participantData.directie}`);
        errorCount++;
        continue;
      }

      // Create participant
      const { data: participant, error: participantError } = await supabase
        .from('participants')
        .insert({
          name: participantData.name,
          directie_id: directieId,
        })
        .select('id')
        .single();

      if (participantError || !participant) {
        console.error(`  ✗ Error creating participant:`, participantError);
        errorCount++;
        continue;
      }

      // Add main riders (positions 1-10)
      const selections = [];
      for (let i = 0; i < participantData.main_riders.length; i++) {
        const riderName = participantData.main_riders[i];
        const riderId = riderMap.get(riderName);

        if (!riderId) {
          console.warn(`  ⚠ Rider not found: ${riderName} - skipping`);
          continue;
        }

        selections.push({
          participant_id: participant.id,
          rider_id: riderId,
          position: i + 1,
          is_active: true,
        });
      }

      // Add reserve rider (position 11)
      if (participantData.reserve_rider) {
        const reserveId = riderMap.get(participantData.reserve_rider);
        if (reserveId) {
          selections.push({
            participant_id: participant.id,
            rider_id: reserveId,
            position: 11,
            is_active: false, // Reserve starts as inactive
          });
        } else {
          console.warn(`  ⚠ Reserve rider not found: ${participantData.reserve_rider}`);
        }
      }

      // Insert all selections
      if (selections.length > 0) {
        const { error: selectionsError } = await supabase
          .from('participant_rider_selections')
          .insert(selections);

        if (selectionsError) {
          console.error(`  ✗ Error inserting selections:`, selectionsError);
          errorCount++;
          continue;
        }
      }

      console.log(`  ✓ Created with ${selections.length} riders (${participantData.main_riders.length} main + ${participantData.reserve_rider ? 1 : 0} reserve)`);
      successCount++;

    } catch (err) {
      console.error(`  ✗ Unexpected error:`, err);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✓ Import complete!`);
  console.log(`  - Success: ${successCount} participants`);
  console.log(`  - Errors: ${errorCount}`);
  console.log('='.repeat(50));
}

// Run the seed
seedParticipants().catch(console.error);