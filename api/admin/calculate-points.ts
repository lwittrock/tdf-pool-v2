/**
 * Calculate Points API (COMPLETELY REWRITTEN & FIXED)
 * 
 * Major changes:
 * - ✅ Uses correct field names (stage_points not stage_score)
 * - ✅ Stores rider points in rider_stage_points table
 * - ✅ Stores rider contributions in participant_rider_contributions table
 * - ✅ Calculates cumulative points and ranks
 * - ✅ No more on-the-fly calculations needed
 * - ✅ Uses shared constants and types
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  POINTS_FOR_RANK,
  JERSEY_POINTS,
  COMBATIVITY_POINTS,
  type JerseyType,
} from '../../lib/scoring-constants.js';
import type { CalculatePointsRequest } from '../../lib/types';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const { stage_number, force }: CalculatePointsRequest = req.body;

    if (!stage_number) {
      return res.status(400).json({ 
        success: false,
        error: 'stage_number is required' 
      });
    }

    console.log(`[Calculate Points] Starting for stage ${stage_number}${force ? ' (forced)' : ''}`);

    // Get the stage
    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select('id, is_complete, stage_number')
      .eq('stage_number', stage_number)
      .single();

    if (stageError || !stage) {
      return res.status(404).json({
        success: false,
        error: `Stage ${stage_number} not found`,
        details: stageError,
      });
    }

    const stageId = stage.id;

    // Idempotency check
    if (stage.is_complete && !force) {
      console.log(`[Calculate Points] Stage ${stage_number} already processed. Skipping.`);
      return res.status(200).json({
        success: true,
        message: `Stage ${stage_number} already processed`,
      });
    }

    // ========================================================================
    // STEP 1: Clear existing points for this stage (for reprocessing)
    // ========================================================================
    console.log(`[Calculate Points] Clearing existing points for stage ${stage_number}`);
    
    await Promise.all([
      supabase.from('rider_stage_points').delete().eq('stage_id', stageId),
      supabase.from('participant_stage_points').delete().eq('stage_id', stageId),
      supabase.from('participant_rider_contributions').delete().eq('stage_id', stageId),
    ]);

    // ========================================================================
    // STEP 2: Calculate and store RIDER points
    // ========================================================================
    console.log('[Calculate Points] Calculating rider points...');

    // Get all riders
    const { data: riders } = await supabase.from('riders').select('id, name');
    if (!riders) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch riders',
      });
    }

    const riderMap = new Map(riders.map((r) => [r.id, r.name]));

    // Initialize rider points map
    const riderPointsMap = new Map<
      string,
      {
        stage_finish_points: number;
        yellow_points: number;
        green_points: number;
        polka_dot_points: number;
        white_points: number;
        combativity_points: number;
        total_points: number;
      }
    >();

    for (const rider of riders) {
      riderPointsMap.set(rider.id, {
        stage_finish_points: 0,
        yellow_points: 0,
        green_points: 0,
        polka_dot_points: 0,
        white_points: 0,
        combativity_points: 0,
        total_points: 0,
      });
    }

    // Add stage finish points
    const { data: stageResults } = await supabase
      .from('stage_results')
      .select('rider_id, position')
      .eq('stage_id', stageId)
      .order('position');

    if (stageResults) {
      for (const result of stageResults) {
        const points = POINTS_FOR_RANK[result.position] || 0;
        const riderPoints = riderPointsMap.get(result.rider_id);
        if (riderPoints) {
          riderPoints.stage_finish_points = points;
          riderPoints.total_points += points;
        }
      }
    }

    // Add jersey points
    const { data: jerseys } = await supabase
      .from('stage_jerseys')
      .select('rider_id, jersey_type')
      .eq('stage_id', stageId);

    if (jerseys) {
      for (const jersey of jerseys) {
        const points = JERSEY_POINTS[jersey.jersey_type as JerseyType];
        const riderPoints = riderPointsMap.get(jersey.rider_id);
        if (riderPoints) {
          if (jersey.jersey_type === 'yellow') riderPoints.yellow_points = points;
          else if (jersey.jersey_type === 'green') riderPoints.green_points = points;
          else if (jersey.jersey_type === 'polka_dot') riderPoints.polka_dot_points = points;
          else if (jersey.jersey_type === 'white') riderPoints.white_points = points;
          riderPoints.total_points += points;
        }
      }
    }

    // Add combativity points
    const { data: combativity } = await supabase
      .from('stage_combativity')
      .select('rider_id')
      .eq('stage_id', stageId)
      .maybeSingle();

    if (combativity) {
      const riderPoints = riderPointsMap.get(combativity.rider_id);
      if (riderPoints) {
        riderPoints.combativity_points = COMBATIVITY_POINTS;
        riderPoints.total_points += COMBATIVITY_POINTS;
      }
    }

    // Insert rider_stage_points
    const riderStagePointsInserts = [];
    for (const [riderId, points] of riderPointsMap.entries()) {
      if (points.total_points > 0) {
        riderStagePointsInserts.push({
          stage_id: stageId,
          rider_id: riderId,
          stage_finish_points: points.stage_finish_points,
          yellow_points: points.yellow_points,
          green_points: points.green_points,
          polka_dot_points: points.polka_dot_points,
          white_points: points.white_points,
          combativity_points: points.combativity_points,
          total_points: points.total_points,
          stage_rank: null, // Will calculate after all inserts
        });
      }
    }

    if (riderStagePointsInserts.length > 0) {
      const { error: insertError } = await supabase
        .from('rider_stage_points')
        .insert(riderStagePointsInserts);

      if (insertError) {
        return res.status(500).json({
          success: false,
          error: 'Failed to insert rider stage points',
          details: insertError,
        });
      }
    }

    // Calculate and update rider stage ranks
    const { data: allRiderPoints } = await supabase
      .from('rider_stage_points')
      .select('id, total_points')
      .eq('stage_id', stageId)
      .order('total_points', { ascending: false });

    if (allRiderPoints) {
      for (let i = 0; i < allRiderPoints.length; i++) {
        await supabase
          .from('rider_stage_points')
          .update({ stage_rank: i + 1 })
          .eq('id', allRiderPoints[i].id);
      }
    }

    console.log(`[Calculate Points] Inserted ${riderStagePointsInserts.length} rider point records`);

    // ========================================================================
    // STEP 3: Calculate and store PARTICIPANT points
    // ========================================================================
    console.log('[Calculate Points] Calculating participant points...');

    // Get all participants
    const { data: participants } = await supabase
      .from('participants')
      .select('id, name');

    if (!participants) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch participants',
      });
    }

    // Get active selections for this stage
    const { data: activeSelections } = await supabase
      .from('participant_rider_selections')
      .select('participant_id, rider_id, position')
      .eq('is_active', true)
      .lte('position', 10); // Only main 10 riders, not backup

    if (!activeSelections) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch active selections',
      });
    }

    // Build participant points map
    const participantPointsMap = new Map<
      string,
      {
        total_points: number;
        rider_contributions: Map<string, number>;
      }
    >();

    for (const participant of participants) {
      participantPointsMap.set(participant.id, {
        total_points: 0,
        rider_contributions: new Map(),
      });
    }

    // Calculate participant points from their riders
    for (const selection of activeSelections) {
      const riderPoints = riderPointsMap.get(selection.rider_id);
      if (riderPoints && riderPoints.total_points > 0) {
        const participantData = participantPointsMap.get(selection.participant_id);
        if (participantData) {
          participantData.total_points += riderPoints.total_points;
          participantData.rider_contributions.set(
            selection.rider_id,
            riderPoints.total_points
          );
        }
      }
    }

    // Insert participant_stage_points
    const participantStagePointsInserts = [];
    for (const [participantId, data] of participantPointsMap.entries()) {
      participantStagePointsInserts.push({
        stage_id: stageId,
        participant_id: participantId,
        stage_points: data.total_points,  // ✅ FIXED: Using correct field name
        stage_rank: null, // Will calculate later
        cumulative_points: 0, // Will calculate later
        overall_rank: null, // Will calculate later
      });
    }

    if (participantStagePointsInserts.length > 0) {
      const { error: insertError } = await supabase
        .from('participant_stage_points')
        .insert(participantStagePointsInserts);

      if (insertError) {
        return res.status(500).json({
          success: false,
          error: 'Failed to insert participant stage points',
          details: insertError,
        });
      }
    }

    console.log(`[Calculate Points] Inserted ${participantStagePointsInserts.length} participant point records`);

    // ========================================================================
    // STEP 4: Store rider contributions
    // ========================================================================
    console.log('[Calculate Points] Storing rider contributions...');

    const contributionsInserts = [];
    for (const [participantId, data] of participantPointsMap.entries()) {
      for (const [riderId, points] of data.rider_contributions.entries()) {
        contributionsInserts.push({
          participant_id: participantId,
          stage_id: stageId,
          rider_id: riderId,
          points_contributed: points,
        });
      }
    }

    if (contributionsInserts.length > 0) {
      const { error: insertError } = await supabase
        .from('participant_rider_contributions')
        .insert(contributionsInserts);

      if (insertError) {
        return res.status(500).json({
          success: false,
          error: 'Failed to insert rider contributions',
          details: insertError,
        });
      }
    }

    console.log(`[Calculate Points] Inserted ${contributionsInserts.length} contribution records`);

    // ========================================================================
    // STEP 5: Calculate stage ranks
    // ========================================================================
    console.log('[Calculate Points] Calculating stage ranks...');

    const { data: allParticipantPoints } = await supabase
      .from('participant_stage_points')
      .select('id, stage_points')
      .eq('stage_id', stageId)
      .order('stage_points', { ascending: false });

    if (allParticipantPoints) {
      for (let i = 0; i < allParticipantPoints.length; i++) {
        await supabase
          .from('participant_stage_points')
          .update({ stage_rank: i + 1 })
          .eq('id', allParticipantPoints[i].id);
      }
    }

    // ========================================================================
    // STEP 6: Calculate cumulative points and overall ranks
    // ========================================================================
    console.log('[Calculate Points] Calculating cumulative points and overall ranks...');

    // Get all completed stages up to and including this one
    const { data: completedStages } = await supabase
      .from('stages')
      .select('id, stage_number')
      .eq('is_complete', true)
      .lte('stage_number', stage_number)
      .order('stage_number');

    if (!completedStages) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch completed stages',
      });
    }

    // For each participant, calculate cumulative points
    for (const participant of participants) {
      let cumulativePoints = 0;
      
      for (const completedStage of completedStages) {
        const { data: stagePoints } = await supabase
          .from('participant_stage_points')
          .select('stage_points')
          .eq('participant_id', participant.id)
          .eq('stage_id', completedStage.id)
          .maybeSingle();

        if (stagePoints) {
          cumulativePoints += stagePoints.stage_points;
        }

        // Update cumulative_points for each stage
        await supabase
          .from('participant_stage_points')
          .update({ cumulative_points: cumulativePoints })
          .eq('participant_id', participant.id)
          .eq('stage_id', completedStage.id);
      }
    }

    // Calculate overall ranks for this stage
    const { data: participantsByOverall } = await supabase
      .from('participant_stage_points')
      .select('id, cumulative_points')
      .eq('stage_id', stageId)
      .order('cumulative_points', { ascending: false });

    if (participantsByOverall) {
      for (let i = 0; i < participantsByOverall.length; i++) {
        await supabase
          .from('participant_stage_points')
          .update({ overall_rank: i + 1 })
          .eq('id', participantsByOverall[i].id);
      }
    }

    // Calculate rank changes
    if (stage_number > 1) {
      const { data: previousStage } = await supabase
        .from('stages')
        .select('id')
        .eq('stage_number', stage_number - 1)
        .single();

      if (previousStage) {
        for (const participant of participants) {
          const { data: currentStageData } = await supabase
            .from('participant_stage_points')
            .select('overall_rank, stage_rank')
            .eq('participant_id', participant.id)
            .eq('stage_id', stageId)
            .single();

          const { data: previousStageData } = await supabase
            .from('participant_stage_points')
            .select('overall_rank, stage_rank')
            .eq('participant_id', participant.id)
            .eq('stage_id', previousStage.id)
            .maybeSingle();

          if (currentStageData && previousStageData) {
            const overallRankChange = previousStageData.overall_rank - currentStageData.overall_rank;
            
            await supabase
              .from('participant_stage_points')
              .update({ overall_rank_change: overallRankChange })
              .eq('participant_id', participant.id)
              .eq('stage_id', stageId);
          }
        }
      }
    }

    console.log('[Calculate Points] Points calculation complete!');

    return res.status(200).json({
      success: true,
      message: `Points calculated for stage ${stage_number}`,
      data: {
        riders_processed: riderStagePointsInserts.length,
        participants_processed: participantStagePointsInserts.length,
        contributions_stored: contributionsInserts.length,
      },
    });
  } catch (error: any) {
    console.error('[Calculate Points] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}