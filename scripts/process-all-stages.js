// Script to process all existing stages and generate JSON files
// Run this once to generate tdf_data.json and stages_data.json from existing database data

const VERCEL_URL = process.env.VERCEL_URL || 'http://localhost:3000';

async function processAllStages() {
  console.log('Starting to process all stages...\n');

  // Process stages 1-12
  for (let stageNumber = 1; stageNumber <= 12; stageNumber++) {
    console.log(`\n[Stage ${stageNumber}] Processing...`);
    
    try {
      const response = await fetch(`${VERCEL_URL}/api/admin/process-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          stage_number: stageNumber,
          force: true  // Allow reprocessing completed stages
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(`[Stage ${stageNumber}] ❌ Failed:`, error.error);
        continue;
      }

      const result = await response.json();
      console.log(`[Stage ${stageNumber}] ✅ Success:`, {
        participants: result.results?.participants_calculated,
        points: result.results?.total_points_awarded,
      });

    } catch (error) {
      console.error(`[Stage ${stageNumber}] ❌ Error:`, error.message);
    }
  }

  console.log('\n✅ All stages processed!');
  console.log('\nGenerated files:');
  console.log('  - public/data/tdf_data.json');
  console.log('  - public/data/stages_data.json');
}

processAllStages().catch(console.error);