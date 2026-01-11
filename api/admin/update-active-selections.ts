/**
 * Update Active Selections API (Optimized)
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { 
  UpdateActiveSelectionsRequest, 
  UpdateActiveSelectionsSuccess,
  SubstitutionMade,
  ApiError 
} from '../../lib/types';

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
    const { stage_number }: UpdateActiveSelectionsRequest = req.body;

    if (!stage_number) {
      return res.status(400).json({ 
        success: false,
        error: 'stage_number is required' 
      });
    }

    // Step 1: Get the stage
    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select('id')
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

    // Step 2: Get all DNS riders for this stage
    const { data: dnsRecords } = await supabase
      .from('stage_dnf')
      .select(`
        rider_id,
        riders!inner(name)
      `)
      .eq('stage_id', stageId)
      .eq('status', 'DNS');

    const dnsRiderIds = new Set(dnsRecords?.map((r) => r.rider_id) || []);
    const dnsRiderNames = dnsRecords?.map((r) => (r.riders as any).name) || [];

    console.log(`[Update Active] DNS riders for stage ${stage_number}:`, dnsRiderNames);

    // Step 3: Clear existing active selections for this stage (idempotent)
    await supabase
      .from('active_selections')
      .delete()
      .eq('stage_id', stageId);

    // Step 4: Get all participants and their selections
    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .select(`
        id,
        name,
        participant_selections!inner(rider_id, selection_order, is_backup)
      `);

    if (participantsError || !participants) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch participants',
        details: participantsError,
      });
    }

    // Step 5: For each participant, determine active riders
    const activeSelectionsToInsert: any[] = [];
    const substitutionsMade: SubstitutionMade[] = [];
    let participantsAffected = 0;

    for (const participant of participants) {
      const selections = (participant.participant_selections as any[])
        .sort((a, b) => a.selection_order - b.selection_order);

      const regularRiders = selections.filter((s) => !s.is_backup);
      const backupRiders = selections.filter((s) => s.is_backup);

      let activeRiders = [...regularRiders];
      let substitutionsForParticipant = 0;

      // Check if any regular riders are DNS
      for (let i = 0; i < activeRiders.length; i++) {
        if (dnsRiderIds.has(activeRiders[i].rider_id)) {
          // Find first available backup
          const backup = backupRiders.find(
            (b) => !dnsRiderIds.has(b.rider_id) && !activeRiders.some((a) => a.rider_id === b.rider_id)
          );

          if (backup) {
            // Get rider names for logging
            const { data: riderOut } = await supabase
              .from('riders')
              .select('name')
              .eq('id', activeRiders[i].rider_id)
              .single();

            const { data: riderIn } = await supabase
              .from('riders')
              .select('name')
              .eq('id', backup.rider_id)
              .single();

            substitutionsMade.push({
              participant_name: participant.name,
              rider_out: riderOut?.name || 'Unknown',
              rider_in: riderIn?.name || 'Unknown',
            });

            activeRiders[i] = backup;
            substitutionsForParticipant++;
          }
        }
      }

      if (substitutionsForParticipant > 0) {
        participantsAffected++;
      }

      // Insert active selections
      for (const selection of activeRiders) {
        activeSelectionsToInsert.push({
          stage_id: stageId,
          participant_id: participant.id,
          rider_id: selection.rider_id,
          is_backup: selection.is_backup,
        });
      }
    }

    // Step 6: Insert all active selections
    if (activeSelectionsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('active_selections')
        .insert(activeSelectionsToInsert);

      if (insertError) {
        return res.status(500).json({
          success: false,
          error: 'Failed to insert active selections',
          details: insertError,
        });
      }
    }

    console.log(`[Update Active] Created ${activeSelectionsToInsert.length} active selection records`);
    console.log(`[Update Active] Made ${substitutionsMade.length} substitutions`);

    return res.status(200).json({
      success: true,
      stage_number,
      dns_riders: dnsRiderNames,
      substitutions_made: substitutionsMade,
      participants_affected: participantsAffected,
    });
  } catch (error: any) {
    console.error('[Update Active] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}