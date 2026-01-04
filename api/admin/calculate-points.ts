import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Point scoring rules
const POINTS_FOR_RANK: Record<number, number> = {
  1: 25, 2: 19, 3: 18, 4: 17, 5: 16, 6: 15, 7: 14, 8: 13,
  9: 12, 10: 11, 11: 10, 12: 9, 13: 8, 14: 7, 15: 6,
  16: 5, 17: 4, 18: 3, 19: 2, 20: 1,
};

const JERSEY_POINTS = {
  yellow: 15,
  green: 10,
  polka_dot: 10,
  white: 10,
};

const COMBATIVITY_POINTS = 5;
const TOP_N_FOR_DIRECTIE = 3;

interface CalculatePointsRequest {
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
    const { stage_number }: CalculatePointsRequest = req.body;

    if (!stage_number) {
      return res.status(400).json({ error: 'stage_number is required' });
    }

    // Get the stage
    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select('id, is_complete, stage_number')
      .eq('stage_number', stage_number)
      .single();

    if (stageError || !stage) {
      return res.status(404).json({
        error: `Stage ${stage_number} not found`,
        details: stageError,
      });
    }

    if (stage.is_complete) {
      return res.status(400).json({
        error: `Stage ${stage_number} is already marked as complete.`,
      });
    }

    const stageId = stage.id;

    // Validate stage data
    const validationErrors = await validateStageData(stageId, stage_number);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Stage data is incomplete',
        validation_errors: validationErrors,
      });
    }

    // Get all stage data
    const [stageResultsData, jerseysData, combativityData] = await Promise.all([
      supabase
        .from('stage_results')
        .select('position, rider_id, riders:rider_id(id, name)')
        .eq('stage_id', stageId)
        .order('position'),
      
      supabase
        .from('stage_jerseys')
        .select('jersey_type, rider_id, riders:rider_id(id, name)')
        .eq('stage_id', stageId),
      
      supabase
        .from('stage_combativity')
        .select('rider_id, riders:rider_id(id, name)')
        .eq('stage_id', stageId)
        .maybeSingle(),
    ]);

    if (stageResultsData.error || jerseysData.error) {
      return res.status(500).json({ error: 'Failed to fetch stage data' });
    }

    // Build rider points map
    const riderPoints = new Map<string, number>();

    // Stage positions
    for (const result of stageResultsData.data || []) {
      const points = POINTS_FOR_RANK[result.position] || 0;
      if (points > 0) {
        riderPoints.set(result.rider_id, (riderPoints.get(result.rider_id) || 0) + points);
      }
    }

    // Jerseys
    for (const jersey of jerseysData.data || []) {
      const points = JERSEY_POINTS[jersey.jersey_type as keyof typeof JERSEY_POINTS] || 0;
      if (points > 0) {
        riderPoints.set(jersey.rider_id, (riderPoints.get(jersey.rider_id) || 0) + points);
      }
    }

    // Combativity
    if (combativityData.data) {
      const riderId = combativityData.data.rider_id;
      riderPoints.set(riderId, (riderPoints.get(riderId) || 0) + COMBATIVITY_POINTS);
    }

    // Get all participants with active riders
    const { data: participants } = await supabase
      .from('participants')
      .select(`
        id,
        name,
        directie_id,
        participant_rider_selections!inner(rider_id, is_active)
      `);

    if (!participants) {
      return res.status(500).json({ error: 'Failed to fetch participants' });
    }

    // Calculate points for each participant
    const participantScores: Array<{
      participant_id: string;
      directie_id: string | null;
      stage_points: number;
    }> = [];

    for (const participant of participants) {
      const selections = (participant as any).participant_rider_selections || [];
      const activeRiderIds = selections
        .filter((s: any) => s.is_active)
        .map((s: any) => s.rider_id);

      let stageTotal = 0;
      for (const riderId of activeRiderIds) {
        stageTotal += riderPoints.get(riderId) || 0;
      }

      participantScores.push({
        participant_id: participant.id,
        directie_id: (participant as any).directie_id,
        stage_points: stageTotal,
      });
    }

    // Get previous stage cumulative points
    const previousStageNumber = stage_number - 1;
    const previousCumulatives = new Map<string, number>();

    if (previousStageNumber > 0) {
      const { data: prevStage } = await supabase
        .from('stages')
        .select('id')
        .eq('stage_number', previousStageNumber)
        .single();

      if (prevStage) {
        const { data: prevPoints } = await supabase
          .from('participant_stage_points')
          .select('participant_id, cumulative_points')
          .eq('stage_id', prevStage.id);

        if (prevPoints) {
          for (const p of prevPoints) {
            previousCumulatives.set(p.participant_id, p.cumulative_points);
          }
        }
      }
    }

    // Calculate cumulative points and rankings
    for (const score of participantScores) {
      const prevCumulative = previousCumulatives.get(score.participant_id) || 0;
      (score as any).cumulative_points = prevCumulative + score.stage_points;
    }

    // Sort by stage points for stage ranking
    const stageRanked = [...participantScores].sort((a, b) => b.stage_points - a.stage_points);
    
    // Sort by cumulative points for overall ranking
    const overallRanked = [...participantScores].sort((a, b) => 
      (b as any).cumulative_points - (a as any).cumulative_points
    );

    // Get previous overall ranks for rank change calculation
    const previousRanks = new Map<string, number>();
    if (previousStageNumber > 0) {
      const { data: prevStage } = await supabase
        .from('stages')
        .select('id')
        .eq('stage_number', previousStageNumber)
        .single();

      if (prevStage) {
        const { data: prevPoints } = await supabase
          .from('participant_stage_points')
          .select('participant_id, overall_rank')
          .eq('stage_id', prevStage.id);

        if (prevPoints) {
          for (const p of prevPoints) {
            previousRanks.set(p.participant_id, p.overall_rank);
          }
        }
      }
    }

    // Build final insert data
    const pointsToInsert = [];
    for (let i = 0; i < participantScores.length; i++) {
      const score = participantScores[i];
      const stageRank = stageRanked.findIndex(s => s.participant_id === score.participant_id) + 1;
      const overallRank = overallRanked.findIndex(s => s.participant_id === score.participant_id) + 1;
      const previousRank = previousRanks.get(score.participant_id) || overallRank;
      const overallRankChange = previousRank - overallRank;

      pointsToInsert.push({
        participant_id: score.participant_id,
        stage_id: stageId,
        stage_points: score.stage_points,
        stage_rank: stageRank,
        stage_rank_change: 0, // Not tracking stage rank changes yet
        cumulative_points: (score as any).cumulative_points,
        overall_rank: overallRank,
        overall_rank_change: overallRankChange,
      });
    }

    // Calculate directie points
    const directieScores = new Map<string, { stage_points: number; participants: Array<{ id: string; name: string; stage_points: number; cumulative_points: number }> }>();

    for (const score of participantScores) {
      if (!score.directie_id) continue;

      if (!directieScores.has(score.directie_id)) {
        directieScores.set(score.directie_id, { stage_points: 0, participants: [] });
      }

      const participant = participants.find(p => p.id === score.participant_id);
      directieScores.get(score.directie_id)!.participants.push({
        id: score.participant_id,
        name: participant?.name || '',
        stage_points: score.stage_points,
        cumulative_points: (score as any).cumulative_points,
      });
    }

    // Sort participants within each directie and take top N
    const directiePointsToInsert = [];
    for (const [directieId, data] of directieScores.entries()) {
      // Sort by stage points descending, take top N
      const topParticipantsStage = data.participants
        .sort((a, b) => b.stage_points - a.stage_points)
        .slice(0, TOP_N_FOR_DIRECTIE);

      const stageTotal = topParticipantsStage.reduce((sum, p) => sum + p.stage_points, 0);

      // Sort by cumulative points descending, take top N
      const topParticipantsOverall = data.participants
        .sort((a, b) => b.cumulative_points - a.cumulative_points)
        .slice(0, TOP_N_FOR_DIRECTIE);

      const cumulativeTotal = topParticipantsOverall.reduce((sum, p) => sum + p.cumulative_points, 0);

      directiePointsToInsert.push({
        directie_id: directieId,
        stage_id: stageId,
        stage_points: stageTotal,
        cumulative_points: cumulativeTotal,
        top_contributors: {
          stage: topParticipantsStage.map(p => ({ participant_name: p.name, stage_score: p.stage_points })),
          overall: topParticipantsOverall.map(p => ({ participant_name: p.name, overall_score: p.cumulative_points })),
        },
      });
    }

    // Rank directies
    const directieStageRanked = [...directiePointsToInsert].sort((a, b) => b.stage_points - a.stage_points);
    const directieOverallRanked = [...directiePointsToInsert].sort((a, b) => b.cumulative_points - a.cumulative_points);

    for (const d of directiePointsToInsert) {
      (d as any).stage_rank = directieStageRanked.findIndex(x => x.directie_id === d.directie_id) + 1;
      (d as any).overall_rank = directieOverallRanked.findIndex(x => x.directie_id === d.directie_id) + 1;
      (d as any).overall_rank_change = 0; // TODO: calculate from previous stage
    }

    // Clear existing data
    await supabase.from('participant_stage_points').delete().eq('stage_id', stageId);
    await supabase.from('directie_stage_points').delete().eq('stage_id', stageId);

    // Insert new data
    if (pointsToInsert.length > 0) {
      const { error } = await supabase
        .from('participant_stage_points')
        .insert(pointsToInsert);

      if (error) {
        console.error('Insert error:', error);
        return res.status(500).json({
          error: 'Failed to insert participant points',
          details: error,
        });
      }
    }

    if (directiePointsToInsert.length > 0) {
      const { error } = await supabase
        .from('directie_stage_points')
        .insert(directiePointsToInsert);

      if (error) {
        console.error('Directie insert error:', error);
      }
    }

    // Mark stage as complete
    await supabase
      .from('stages')
      .update({ is_complete: true })
      .eq('id', stageId);

    return res.status(200).json({
      success: true,
      stage_number,
      participants_calculated: participants.length,
      total_points_awarded: participantScores.reduce((sum, s) => sum + s.stage_points, 0),
    });

  } catch (error: any) {
    console.error('Calculate points error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}

async function validateStageData(stageId: string, stageNumber: number) {
  const errors: any[] = [];

  const { data: results } = await supabase
    .from('stage_results')
    .select('id')
    .eq('stage_id', stageId);

  if (!results || results.length === 0) {
    errors.push({ field: 'stage_results', message: 'No stage results found' });
  }

  const { data: jerseys } = await supabase
    .from('stage_jerseys')
    .select('jersey_type')
    .eq('stage_id', stageId);

  const jerseyTypes = new Set(jerseys?.map(j => j.jersey_type) || []);
  for (const type of ['yellow', 'green', 'polka_dot', 'white']) {
    if (!jerseyTypes.has(type)) {
      errors.push({ field: 'jerseys', message: `Missing ${type} jersey` });
    }
  }

  return errors;
}