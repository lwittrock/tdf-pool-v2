// Script to import stage results from data/stage_results/stage_X.json files
// This populates: stages, stage_results, stage_jerseys, stage_combativity, stage_dnf

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

interface StageData {
  stage_info: {
    date: string;
    distance: string;
    departure_city: string;
    arrival_city: string;
    stage_type_category: string;
    stage_difficulty: string;
    won_how: string;
  };
  dnf_riders: string[];
  top_20_finishers: Array<{
    rider_name: string;
    rank: string;
    time: string;
    team: string;
    bib: string;
  }>;
  top_gc_rider: { rider_name: string; rank: string } | null;
  top_kom_rider: { rider_name: string; rank: string } | null;
  top_points_rider: { rider_name: string; rank: string } | null;
  top_youth_rider: { rider_name: string; rank: string } | null;
  combative_rider: { rider_name: string; rank: string } | null;
}

async function importStageResults(stageNumber: number, dryRun = false) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Importing Stage ${stageNumber}${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('='.repeat(50));

  // Read the JSON file
  const filePath = path.join(__dirname, `../data/stage_results/stage_${stageNumber}.json`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`✗ File not found: ${filePath}`);
    return false;
  }

  const stageData: StageData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Get all riders for name -> ID mapping
  const { data: riders, error: ridersError } = await supabase
    .from('riders')
    .select('id, name');

  if (ridersError || !riders) {
    console.error('✗ Error fetching riders:', ridersError);
    return false;
  }

  const riderMap = new Map(riders.map(r => [r.name, r.id]));

  // Helper to get rider ID by name
  const getRiderId = (name: string): string | null => {
    const id = riderMap.get(name);
    if (!id) {
      console.warn(`  ⚠ Rider not found: ${name}`);
    }
    return id || null;
  };

  if (dryRun) {
    console.log('\n📋 Stage Info:');
    console.log(`  Date: ${stageData.stage_info.date}`);
    console.log(`  Route: ${stageData.stage_info.departure_city} → ${stageData.stage_info.arrival_city}`);
    console.log(`  Distance: ${stageData.stage_info.distance}`);
    console.log(`  Type: ${stageData.stage_info.stage_type_category} (${stageData.stage_info.stage_difficulty})`);
    console.log(`  Won how: ${stageData.stage_info.won_how}`);
    
    console.log('\n📋 Would import:');
    console.log(`  - ${stageData.top_20_finishers.length} top finishers`);
    console.log(`  - 4 jersey holders`);
    console.log(`  - ${stageData.combative_rider ? '1' : '0'} combative rider`);
    console.log(`  - ${stageData.dnf_riders.length} DNF riders`);
    
    // Check for missing riders
    const allRiderNames = [
      ...stageData.top_20_finishers.map(f => f.rider_name),
      ...stageData.dnf_riders,
      stageData.top_gc_rider?.rider_name,
      stageData.top_kom_rider?.rider_name,
      stageData.top_points_rider?.rider_name,
      stageData.top_youth_rider?.rider_name,
      stageData.combative_rider?.rider_name,
    ].filter(Boolean) as string[];

    const missingRiders = allRiderNames.filter(name => !riderMap.has(name));
    if (missingRiders.length > 0) {
      console.warn('\n⚠ Missing riders in database:');
      missingRiders.forEach(name => console.warn(`  - ${name}`));
    }

    return true;
  }

  // Step 1: Create or update stage
  console.log('\n1️⃣ Creating stage...');
  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .upsert(
      {
        stage_number: stageNumber,
        date: stageData.stage_info.date,
        distance: stageData.stage_info.distance,
        departure_city: stageData.stage_info.departure_city,
        arrival_city: stageData.stage_info.arrival_city,
        stage_type: stageData.stage_info.stage_type_category,
        difficulty: stageData.stage_info.stage_difficulty,
        won_how: stageData.stage_info.won_how,
        is_complete: false, // Will be set to true after points calculation
      },
      { onConflict: 'stage_number' }
    )
    .select('id')
    .single();

  if (stageError || !stage) {
    console.error('✗ Error creating stage:', stageError);
    return false;
  }

  const stageId = stage.id;
  console.log(`  ✓ Stage created/updated (${stageId})`);

  // Step 2: Clear existing data for this stage (in case of re-import)
  console.log('\n2️⃣ Clearing existing stage data...');
  await supabase.from('stage_results').delete().eq('stage_id', stageId);
  await supabase.from('stage_jerseys').delete().eq('stage_id', stageId);
  await supabase.from('stage_combativity').delete().eq('stage_id', stageId);
  await supabase.from('stage_dnf').delete().eq('stage_id', stageId);
  console.log('  ✓ Cleared');

  // Step 3: Insert top 20 finishers
  console.log('\n3️⃣ Inserting top 20 finishers...');
  const resultsToInsert = [];
  for (const finisher of stageData.top_20_finishers) {
    const riderId = getRiderId(finisher.rider_name);
    if (!riderId) continue;

    resultsToInsert.push({
      stage_id: stageId,
      rider_id: riderId,
      position: parseInt(finisher.rank),
      time_gap: finisher.time === 's.t.' ? 's.t.' : finisher.time,
    });
  }

  if (resultsToInsert.length > 0) {
    const { error: resultsError } = await supabase
      .from('stage_results')
      .insert(resultsToInsert);

    if (resultsError) {
      console.error('✗ Error inserting results:', resultsError);
      return false;
    }
    console.log(`  ✓ Inserted ${resultsToInsert.length} finishers`);
  }

  // Step 4: Insert jerseys
  console.log('\n4️⃣ Inserting jersey holders...');
  const jerseyInserts = [];
  
  const jerseyMapping = [
    { type: 'yellow', data: stageData.top_gc_rider },
    { type: 'green', data: stageData.top_points_rider },
    { type: 'polka_dot', data: stageData.top_kom_rider },
    { type: 'white', data: stageData.top_youth_rider },
  ];

  for (const { type, data } of jerseyMapping) {
    if (!data) {
      console.warn(`  ⚠ No ${type} jersey holder in data`);
      continue;
    }

    const riderId = getRiderId(data.rider_name);
    if (!riderId) continue;

    jerseyInserts.push({
      stage_id: stageId,
      jersey_type: type,
      rider_id: riderId,
    });
  }

  if (jerseyInserts.length > 0) {
    const { error: jerseysError } = await supabase
      .from('stage_jerseys')
      .insert(jerseyInserts);

    if (jerseysError) {
      console.error('✗ Error inserting jerseys:', jerseysError);
      return false;
    }
    console.log(`  ✓ Inserted ${jerseyInserts.length} jerseys`);
  }

  // Step 5: Insert combative rider
  console.log('\n5️⃣ Inserting combative rider...');
  if (stageData.combative_rider) {
    const riderId = getRiderId(stageData.combative_rider.rider_name);
    if (riderId) {
      const { error: combativityError } = await supabase
        .from('stage_combativity')
        .insert({
          stage_id: stageId,
          rider_id: riderId,
        });

      if (combativityError) {
        console.error('✗ Error inserting combativity:', combativityError);
      } else {
        console.log(`  ✓ ${stageData.combative_rider.rider_name}`);
      }
    }
  } else {
    console.log('  ⚠ No combative rider in data');
  }

  // Step 6: Insert DNF riders
  console.log('\n6️⃣ Inserting DNF riders...');
  if (stageData.dnf_riders && stageData.dnf_riders.length > 0) {
    const dnfInserts = [];
    
    for (const riderName of stageData.dnf_riders) {
      const riderId = getRiderId(riderName);
      if (!riderId) continue;

      dnfInserts.push({
        stage_id: stageId,
        rider_id: riderId,
        status: 'DNF' as const,
      });
    }

    if (dnfInserts.length > 0) {
      const { error: dnfError } = await supabase
        .from('stage_dnf')
        .insert(dnfInserts);

      if (dnfError) {
        console.error('✗ Error inserting DNF riders:', dnfError);
      } else {
        console.log(`  ✓ Inserted ${dnfInserts.length} DNF riders`);
      }
    }
  } else {
    console.log('  ℹ No DNF riders');
  }

  console.log('\n✅ Stage import complete!');
  return true;
}

// Main function to import multiple stages
async function importAllStages(startStage: number, endStage: number, dryRun = false) {
  console.log(`\nImporting stages ${startStage}-${endStage}${dryRun ? ' (DRY RUN)' : ''}...\n`);

  for (let stageNum = startStage; stageNum <= endStage; stageNum++) {
    const success = await importStageResults(stageNum, dryRun);
    if (!success) {
      console.error(`\n❌ Failed to import stage ${stageNum}`);
      break;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Import complete!');
  console.log('='.repeat(50));
}

// CLI usage
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage:');
  console.log('  Import single stage: npm run seed-stages 1');
  console.log('  Import range: npm run seed-stages 1 5');
  console.log('  Dry run: npm run seed-stages 1 5 --dry-run');
} else {
  const startStage = parseInt(args[0]);
  const endStage = args[1] ? parseInt(args[1]) : startStage;
  const dryRun = args.includes('--dry-run');
  
  importAllStages(startStage, endStage, dryRun).catch(console.error);
}