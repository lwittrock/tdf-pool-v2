/**
 * Calculate Points API (Optimized)
 * 
 * Optimizations:
 * - Uses shared types from lib/types.ts
 * - Better error handling with typed responses
 * - Removed duplicate type definitions
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  POINTS_FOR_RANK,
  JERSEY_POINTS,
  COMBATIVITY_POINTS,
  TOP_N_FOR_DIRECTIE,
  type JerseyType,
} from '../../lib/scoring-constants.js';
import type { CalculatePointsRequest, ApiError, ApiSuccess } from '../../lib/types';

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

    console.log(`[Calculate Points] Starting for stage ${stage_number}`);

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

    // Step 1: Clear existing points for this stage (for reprocessing)
    console.log(`[Calculate Points] Clearing existing points for stage ${stage_number}`);
    await supabase
      .from('participant_stage_points')
      .delete()
      .eq('stage_id', stageId);

    await supabase
      .from('rider_stage_points')
      .delete()
      .eq('stage_id', stageId);

    // Step 2: Get all riders with their points breakdown
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

    const riderMap = new Map(riders.map((r) => [r.id, r.name]));

    // Step 3: Calculate rider points
    console.log('[Calculate Points] Calculating rider points...');

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

    // Initialize all riders with 0 points
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

    // Step 4: Insert rider_stage_points
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

    console.log(`[Calculate Points] Inserted ${riderStagePointsInserts.length} rider point records`);

    // Step 5: Calculate participant points
    console.log('[Calculate Points] Calculating participant points...');

    // Get all participants with their selections
    const { data: participants, error: participantsError } = await supabase
      .from('participant_selections')
      .select(`
        participant_id,
        participants!inner(name, directie_name),
        rider_id,
        selection_order
      `);

    if (participantsError || !participants) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch participants',
        details: participantsError,
      });
    }

    // Get active selections for this stage
    const { data: activeSelections } = await supabase
      .from('active_selections')
      .select('participant_id, rider_id, is_backup')
      .eq('stage_id', stageId);

    const activeSelectionsMap = new Map<string, Set<string>>();
    if (activeSelections) {
      for (const selection of activeSelections) {
        if (!activeSelectionsMap.has(selection.participant_id)) {
          activeSelectionsMap.set(selection.participant_id, new Set());
        }
        activeSelectionsMap.get(selection.participant_id)!.add(selection.rider_id);
      }
    }

    // Calculate points for each participant
    const participantPointsMap = new Map<
      string,
      {
        participant_name: string;
        directie_name: string;
        total_points: number;
        rider_contributions: Map<string, number>;
      }
    >();

    for (const selection of participants) {
      const participantId = selection.participant_id;
      const participant = selection.participants as any;

      if (!participantPointsMap.has(participantId)) {
        participantPointsMap.set(participantId, {
          participant_name: participant.name,
          directie_name: participant.directie_name,
          total_points: 0,
          rider_contributions: new Map(),
        });
      }

      // Check if this rider is active for this stage
      const activeRiders = activeSelectionsMap.get(participantId);
      if (!activeRiders || !activeRiders.has(selection.rider_id)) {
        continue; // Skip inactive riders
      }

      // Add rider's points to participant
      const riderPoints = riderPointsMap.get(selection.rider_id);
      if (riderPoints && riderPoints.total_points > 0) {
        const participantData = participantPointsMap.get(participantId)!;
        participantData.total_points += riderPoints.total_points;
        participantData.rider_contributions.set(
          riderMap.get(selection.rider_id) || selection.rider_id,
          riderPoints.total_points
        );
      }
    }

    // Step 6: Insert participant_stage_points
    const participantStagePointsInserts = [];
    for (const [participantId, data] of participantPointsMap.entries()) {
      const riderContributions: Record<string, number> = {};
      for (const [riderName, points] of data.rider_contributions.entries()) {
        riderContributions[riderName] = points;
      }

      participantStagePointsInserts.push({
        stage_id: stageId,
        participant_id: participantId,
        stage_score: data.total_points,
        rider_contributions: riderContributions,
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

    // Step 7: Calculate ranks (after all points are inserted)
    console.log('[Calculate Points] Calculating ranks...');

    // Get all participant points sorted by score
    const { data: allParticipantPoints } = await supabase
      .from('participant_stage_points')
      .select('id, stage_score')
      .eq('stage_id', stageId)
      .order('stage_score', { ascending: false });

    if (allParticipantPoints) {
      for (let i = 0; i < allParticipantPoints.length; i++) {
        await supabase
          .from('participant_stage_points')
          .update({ stage_rank: i + 1 })
          .eq('id', allParticipantPoints[i].id);
      }
    }

    console.log('[Calculate Points] Points calculation complete!');

    return res.status(200).json({
      success: true,
      message: `Points calculated for stage ${stage_number}`,
      data: {
        riders_processed: riderStagePointsInserts.length,
        participants_processed: participantStagePointsInserts.length,
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