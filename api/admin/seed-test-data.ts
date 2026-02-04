/**
 * Seed Test Data API
 * 
 * Seeds realistic test data for stages 1 through N.
 * Used for testing and development to quickly populate the database.
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Sample top riders with realistic names
const SAMPLE_RIDERS = [
  'Tadej Pogačar', 'Jonas Vingegaard', 'Remco Evenepoel', 
  'Primož Roglič', 'Egan Bernal', 'Geraint Thomas',
  'Aleksandr Vlasov', 'Simon Yates', 'David Gaudu', 'Enric Mas',
  'Romain Bardet', 'Pello Bilbao', 'Mikel Landa', 'Jack Haig',
  'Sepp Kuss', 'Thymen Arensman', 'João Almeida', 'Carlos Rodríguez',
  'Juan Ayuso', 'Lennard Kämna'
];

// Stage types for variety
const STAGE_TYPES = ['Flat', 'Hilly', 'Mountain', 'Time Trial', 'Mountain Finish'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Very Hard'];

function generateStageResults(stageNum: number, riderMap: Map<string, string>) {
  // Shuffle riders for variety, but keep top contenders near the front
  const shuffled = [...SAMPLE_RIDERS];
  
  // Randomize positions 3-20, keep top 2 somewhat consistent
  for (let i = 2; i < shuffled.length; i++) {
    const j = Math.floor(Math.random() * (shuffled.length - 2)) + 2;
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const results = [];
  for (let i = 0; i < 20; i++) {
    const riderName = shuffled[i];
    const riderId = riderMap.get(riderName);
    
    if (!riderId) continue;

    results.push({
      rider_name: riderName,
      position: i + 1,
      time_gap: i === 0 ? null : `+${Math.floor(Math.random() * 120) + 1}s`
    });
  }

  return results;
}

function generateJerseys(stageNum: number, riderMap: Map<string, string>) {
  // Pogačar usually leads, but add some variety
  const yellowCandidates = ['Tadej Pogačar', 'Jonas Vingegaard', 'Remco Evenepoel'];
  const greenCandidates = ['Jasper Philipsen', 'Tadej Pogačar', 'Jonas Vingegaard'];
  const polkaDotCandidates = ['Tadej Pogačar', 'Romain Bardet', 'Simon Yates'];
  const whiteCandidates = ['Remco Evenepoel', 'Juan Ayuso', 'Carlos Rodríguez'];

  return {
    yellow: yellowCandidates[stageNum % yellowCandidates.length],
    green: greenCandidates[stageNum % greenCandidates.length],
    polka_dot: polkaDotCandidates[stageNum % polkaDotCandidates.length],
    white: whiteCandidates[stageNum % whiteCandidates.length]
  };
}

function generateCombativity(stageNum: number) {
  const combativityCandidates = [
    'Romain Bardet', 'Pello Bilbao', 'Lennard Kämna', 
    'David Gaudu', 'Sepp Kuss'
  ];
  return combativityCandidates[stageNum % combativityCandidates.length];
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed' 
    });
  }

  try {
    const { through_stage } = req.body;

    if (!through_stage || through_stage < 1 || through_stage > 21) {
      return res.status(400).json({ 
        success: false,
        error: 'through_stage must be between 1 and 21' 
      });
    }

    console.log(`[Seed Test Data] Seeding stages 1 through ${through_stage}...`);

    // Get all riders
    const { data: riders, error: ridersError } = await supabase
      .from('riders')
      .select('id, name');

    if (ridersError || !riders) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch riders',
        details: ridersError,
      });
    }

    const riderMap = new Map(riders.map(r => [r.name, r.id]));

    // Check which of our sample riders exist
    const existingSampleRiders = SAMPLE_RIDERS.filter(name => riderMap.has(name));
    
    if (existingSampleRiders.length < 10) {
      return res.status(400).json({
        success: false,
        error: `Not enough sample riders found in database. Found: ${existingSampleRiders.join(', ')}`,
      });
    }

    // Seed each stage
    const manualEntryUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/admin/manual-entry`
      : 'http://localhost:3000/api/admin/manual-entry';

    const processStageUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/admin/process-stage`
      : 'http://localhost:3000/api/admin/process-stage';

    const stagesProcessed = [];

    for (let stageNum = 1; stageNum <= through_stage; stageNum++) {
      console.log(`[Seed Test Data] Processing stage ${stageNum}...`);

      // Generate stage data
      const stageData = {
        stage_number: stageNum,
        date: `2026-07-${String(stageNum).padStart(2, '0')}`,
        distance: Math.floor(Math.random() * 100) + 150,
        departure_city: `City ${stageNum}A`,
        arrival_city: `City ${stageNum}B`,
        stage_type: STAGE_TYPES[stageNum % STAGE_TYPES.length],
        difficulty: DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)],
        won_how: 'Sprint',
        top_20_finishers: generateStageResults(stageNum, riderMap),
        jerseys: generateJerseys(stageNum, riderMap),
        combativity: generateCombativity(stageNum),
        dnf_riders: [],
        dns_riders: [],
        force: true
      };

      // Call manual-entry API
      const entryResponse = await fetch(manualEntryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stageData)
      });

      if (!entryResponse.ok) {
        console.error(`[Seed Test Data] Failed to enter stage ${stageNum}`);
        continue;
      }

      // Call process-stage API
      const processResponse = await fetch(processStageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_number: stageNum })
      });

      if (!processResponse.ok) {
        console.error(`[Seed Test Data] Failed to process stage ${stageNum}`);
        continue;
      }

      stagesProcessed.push(stageNum);
    }

    console.log(`[Seed Test Data] Successfully seeded ${stagesProcessed.length} stages`);

    return res.status(200).json({
      success: true,
      message: `Seeded test data through stage ${through_stage}`,
      stages_processed: stagesProcessed,
    });

  } catch (error: any) {
    console.error('[Seed Test Data] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}
