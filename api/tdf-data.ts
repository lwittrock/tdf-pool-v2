import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const POINTS_FOR_RANK: Record<number, number> = {
  1: 25, 2: 19, 3: 18, 4: 17, 5: 16, 6: 15, 7: 14, 8: 13,
  9: 12, 10: 11, 11: 10, 12: 9, 13: 8, 14: 7, 15: 6,
  16: 5, 17: 4, 18: 3, 19: 2, 20: 1,
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[API] Starting tdf-data fetch...');
    
    // Get current stage
    const { data: currentStageData } = await supabase
      .from('stages')
      .select('stage_number')
      .eq('is_complete', true)
      .order('stage_number', { ascending: false })
      .limit(1)
      .single();

    const currentStage = currentStageData?.stage_number || 0;

    if (currentStage === 0) {
      return res.status(200).json({
        metadata: { current_stage: 0, top_n_participants_for_directie: 3 },
        leaderboard_by_stage: {},
        directie_leaderboard_by_stage: {},
        riders: {},
      });
    }

    console.log('[API] Current stage:', currentStage);

    // Get ALL data in bulk queries
    const [stagesData, participantPointsData, directiePointsData, breakdownData] = await Promise.all([
      // All completed stages
      supabase
        .from('stages')
        .select('id, stage_number, date')
        .eq('is_complete', true)
        .order('stage_number'),
      
      // All participant points (all stages at once)
      supabase
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
        .order('stage_id'),
      
      // All directie points (all stages at once)
      supabase
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
        .order('stage_id'),
      
      // All breakdowns (rider contributions)
      supabase
        .from('participant_stage_points_breakdown')
        .select(`
          participant_id,
          stage_id,
          rider_id,
          points_value,
          riders:rider_id (name)
        `)
    ]);

    if (!stagesData.data) {
      return res.status(500).json({ error: 'Failed to fetch stages' });
    }

    console.log('[API] Fetched all bulk data');

    // Build stage ID to number map
    const stageIdToNumber = new Map(
      stagesData.data.map(s => [s.id, s.stage_number])
    );

    // Build leaderboard_by_stage
    const leaderboardByStage: Record<string, any[]> = {};
    
    if (participantPointsData.data) {
      for (const p of participantPointsData.data) {
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
          stage_rider_contributions: {}, // Will fill next
        });
      }
    }

    // Add rider contributions to leaderboard
    if (breakdownData.data) {
      for (const b of breakdownData.data) {
        const stageNum = stageIdToNumber.get(b.stage_id);
        if (!stageNum) continue;
        
        const stageKey = `stage_${stageNum}`;
        const stageLeaderboard = leaderboardByStage[stageKey];
        if (!stageLeaderboard) continue;

        const participantEntry = stageLeaderboard.find(
          p => p.participant_name === (participantPointsData.data?.find(
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
    
    if (directiePointsData.data) {
      for (const d of directiePointsData.data) {
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

    // Build riders object - SIMPLIFIED (don't fetch all details, too slow)
    // Just return empty for now - frontend doesn't need ALL riders on page load
    const ridersObject: Record<string, any> = {};

    console.log('[API] Returning data');

    return res.status(200).json({
      metadata: {
        current_stage: currentStage,
        top_n_participants_for_directie: 3,
      },
      leaderboard_by_stage: leaderboardByStage,
      directie_leaderboard_by_stage: directieLeaderboardByStage,
      riders: ridersObject, // Empty for now - we can optimize this later
    });

  } catch (error: any) {
    console.error('[API] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}