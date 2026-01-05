import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { writeFileSync } from 'fs';
import { join } from 'path';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const POINTS_FOR_RANK: Record<number, number> = {
  1: 25, 2: 19, 3: 18, 4: 17, 5: 16, 6: 15, 7: 14, 8: 13,
  9: 12, 10: 11, 11: 10, 12: 9, 13: 8, 14: 7, 15: 6,
  16: 5, 17: 4, 18: 3, 19: 2, 20: 1,
};

interface ProcessStageRequest {
  stage_number: number;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { stage_number }: ProcessStageRequest = req.body;

    if (!stage_number) {
      return res.status(400).json({ error: 'stage_number is required' });
    }

    console.log(`[Process Stage] Starting stage ${stage_number}`);

    // Step 1: Update active selections (handle DNS substitutions)
    const updateResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/admin/update-active-selections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_number }),
    });

    if (!updateResponse.ok) {
      throw new Error('Failed to update active selections');
    }

    const updateResult = await updateResponse.json();

    // Step 2: Calculate points
    const calculateResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/admin/calculate-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_number }),
    });

    if (!calculateResponse.ok) {
      const errorData = await calculateResponse.json();
      throw new Error(`Points calculation failed: ${errorData.error}`);
    }

    const calculateResult = await calculateResponse.json();

    // Step 3: Generate static JSON file
    console.log('[Process Stage] Generating static JSON...');
    await generateStaticJSON();

    return res.status(200).json({
      success: true,
      stage_number,
      steps_completed: {
        update_active_selections: true,
        calculate_points: true,
        generate_json: true,
      },
      results: {
        substitutions_made: updateResult.substitutions_made || [],
        participants_calculated: calculateResult.participants_calculated,
        total_points_awarded: calculateResult.total_points_awarded,
      },
    });

  } catch (error: any) {
    console.error('[Process Stage] Error:', error);
    return res.status(500).json({
      error: 'Stage processing failed',
      details: error.message,
    });
  }
}

async function generateStaticJSON() {
  // Get current stage
  const { data: currentStageData } = await supabase
    .from('stages')
    .select('stage_number')
    .eq('is_complete', true)
    .order('stage_number', { ascending: false })
    .limit(1)
    .single();

  const currentStage = currentStageData?.stage_number || 0;

  // Get all completed stages
  const { data: stagesData } = await supabase
    .from('stages')
    .select('id, stage_number, date')
    .eq('is_complete', true)
    .order('stage_number');

  if (!stagesData) throw new Error('Failed to fetch stages');

  const stageIdToNumber = new Map(stagesData.map(s => [s.id, s.stage_number]));
  const stageIdToDate = new Map(stagesData.map(s => [s.id, s.date]));

  // Get all participant points
  const { data: participantPointsData } = await supabase
    .from('participant_stage_points')
    .select(`
      participant_id,
      stage_id,
      stage_points,
      stage_rank,
      cumulative_points,
      overall_rank,
      overall_rank_change,
      participants:participant_id (
        name,
        directie:directie_id (name)
      )
    `)
    .order('stage_id');

  // Get all directie points
  const { data: directiePointsData } = await supabase
    .from('directie_stage_points')
    .select(`
      directie_id,
      stage_id,
      stage_points,
      stage_rank,
      cumulative_points,
      overall_rank,
      overall_rank_change,
      top_contributors,
      directie:directie_id (name)
    `)
    .order('stage_id');

  // Get all breakdowns
  const { data: breakdownData } = await supabase
    .from('participant_stage_points_breakdown')
    .select(`
      participant_id,
      stage_id,
      rider_id,
      points_value,
      riders:rider_id (name)
    `);

  // Build leaderboard_by_stage
  const leaderboardByStage: Record<string, any[]> = {};
  
  if (participantPointsData) {
    for (const p of participantPointsData) {
      const stageNum = stageIdToNumber.get(p.stage_id);
      if (!stageNum) continue;
      
      const stageKey = `stage_${stageNum}`;
      if (!leaderboardByStage[stageKey]) {
        leaderboardByStage[stageKey] = [];
      }

      const participant = (p as any).participants;
      leaderboardByStage[stageKey].push({
        participant_name: participant.name,
        directie_name: participant.directie?.name || 'Unknown',
        overall_score: p.cumulative_points,
        overall_rank: p.overall_rank,
        overall_rank_change: p.overall_rank_change || 0,
        stage_score: p.stage_points,
        stage_rank: p.stage_rank,
        stage_rider_contributions: {},
      });
    }
  }

  // Add rider contributions
  if (breakdownData) {
    for (const b of breakdownData) {
      const stageNum = stageIdToNumber.get(b.stage_id);
      if (!stageNum) continue;
      
      const stageKey = `stage_${stageNum}`;
      const stageLeaderboard = leaderboardByStage[stageKey];
      if (!stageLeaderboard) continue;

      const participantEntry = stageLeaderboard.find(
        p => p.participant_name === (participantPointsData?.find(
          pp => pp.participant_id === b.participant_id
        ) as any)?.participants?.name
      );

      if (participantEntry) {
        const riderName = (b as any).riders?.name;
        if (riderName) {
          participantEntry.stage_rider_contributions[riderName] = 
            (participantEntry.stage_rider_contributions[riderName] || 0) + b.points_value;
        }
      }
    }
  }

  // Build directie_leaderboard_by_stage
  const directieLeaderboardByStage: Record<string, any[]> = {};
  
  if (directiePointsData) {
    for (const d of directiePointsData) {
      const stageNum = stageIdToNumber.get(d.stage_id);
      if (!stageNum) continue;
      
      const stageKey = `stage_${stageNum}`;
      if (!directieLeaderboardByStage[stageKey]) {
        directieLeaderboardByStage[stageKey] = [];
      }

      directieLeaderboardByStage[stageKey].push({
        directie_name: (d as any).directie?.name || 'Unknown',
        overall_score: d.cumulative_points,
        overall_rank: d.overall_rank,
        overall_rank_change: d.overall_rank_change || 0,
        stage_score: d.stage_points,
        stage_rank: d.stage_rank,
        stage_participant_contributions: d.top_contributors?.stage || [],
        overall_participant_contributions: d.top_contributors?.overall || [],
      });
    }
  }

  // Build riders object
  const { data: ridersData } = await supabase.from('riders').select('id, name, team');
  const { data: resultsData } = await supabase.from('stage_results').select('rider_id, stage_id, position');
  const { data: jerseysData } = await supabase.from('stage_jerseys').select('rider_id, stage_id, jersey_type');
  const { data: combativityData } = await supabase.from('stage_combativity').select('rider_id, stage_id');

  const ridersObject: Record<string, any> = {};

  if (ridersData) {
    for (const rider of ridersData) {
      const stagesObj: Record<string, any> = {};
      let totalPoints = 0;

      const riderResults = resultsData?.filter(r => r.rider_id === rider.id) || [];
      
      for (const result of riderResults) {
        const stageNum = stageIdToNumber.get(result.stage_id);
        if (!stageNum) continue;

        const stageKey = `stage_${stageNum}`;
        const finishPoints = POINTS_FOR_RANK[result.position] || 0;

        const jerseyPoints: any = {
          yellow: 0,
          green: 0,
          polka_dot: 0,
          white: 0,
          combative: 0,
        };

        const stageJerseys = jerseysData?.filter(
          j => j.rider_id === rider.id && j.stage_id === result.stage_id
        ) || [];

        for (const j of stageJerseys) {
          if (j.jersey_type === 'yellow') jerseyPoints.yellow = 15;
          if (j.jersey_type === 'green') jerseyPoints.green = 10;
          if (j.jersey_type === 'polka_dot') jerseyPoints.polka_dot = 10;
          if (j.jersey_type === 'white') jerseyPoints.white = 10;
        }

        const hasCombativity = combativityData?.some(
          c => c.rider_id === rider.id && c.stage_id === result.stage_id
        );
        if (hasCombativity) {
          jerseyPoints.combative = 5;
        }

        const jerseyTotal = Object.values(jerseyPoints).reduce((a, b) => (a as number) + (b as number), 0) as number;
        const stageTotal = finishPoints + jerseyTotal;
        totalPoints += stageTotal;

        stagesObj[stageKey] = {
          date: stageIdToDate.get(result.stage_id),
          stage_finish_points: finishPoints,
          stage_finish_position: result.position,
          jersey_points: jerseyPoints,
          stage_total: stageTotal,
          cumulative_total: totalPoints,
        };
      }

      ridersObject[rider.name] = {
        team: rider.team,
        total_points: totalPoints,
        stages: stagesObj,
      };
    }
  }

  // Build final JSON
  const tdfData = {
    metadata: {
      current_stage: currentStage,
      top_n_participants_for_directie: 3,
    },
    leaderboard_by_stage: leaderboardByStage,
    directie_leaderboard_by_stage: directieLeaderboardByStage,
    riders: ridersObject,
  };

  // Write to public/data/tdf_data.json
  const outputPath = join(process.cwd(), 'public', 'data', 'tdf_data.json');
  writeFileSync(outputPath, JSON.stringify(tdfData, null, 2));
  
  console.log('[Generate JSON] Written to:', outputPath);
}