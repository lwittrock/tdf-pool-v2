/**
 * Update Active Selections API (COMPLETELY REWRITTEN & FIXED)
 * 
 * Major changes:
 * - ✅ No more active_selections table (doesn't exist!)
 * - ✅ Uses participant_rider_selections.is_active instead
 * - ✅ Properly handles DNS riders and backup activation
 * - ✅ Records substitution history
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { 
  UpdateActiveSelectionsRequest, 
  UpdateActiveSelectionsSuccess,
  SubstitutionMade,
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

    console.log(`[Update Active Selections] Processing stage ${stage_number}`);

    // ========================================================================
    // STEP 1: Get the stage
    // ========================================================================
    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select('id, stage_number')
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

    // ========================================================================
    // STEP 2: Get all DNS riders for this stage
    // ========================================================================
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

    // If no DNS riders, nothing to do
    if (dnsRiderIds.size === 0) {
      console.log('[Update Active] No DNS riders, selections unchanged');
      return res.status(200).json({
        success: true,
        stage_number,
        dns_riders: [],
        substitutions_made: [],
        participants_affected: 0,
      });
    }

    // ========================================================================
    // STEP 3: Get all participants and their selections
    // ========================================================================
    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .select(`
        id,
        name,
        participant_rider_selections!inner(
          id,
          rider_id,
          position,
          is_active,
          riders!inner(name)
        )
      `);

    if (participantsError || !participants) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch participants',
        details: participantsError,
      });
    }

    // ========================================================================
    // STEP 4: Process each participant - handle DNS and activate backups
    // ========================================================================
    const substitutionsMade: SubstitutionMade[] = [];
    let participantsAffected = 0;

    for (const participant of participants) {
      const selections = (participant.participant_rider_selections as any[])
        .sort((a, b) => a.position - b.position);

      let hasSubstitutions = false;

      // Separate main riders (1-10) from backup (11)
      const mainRiders = selections.filter((s) => s.position <= 10);
      const backupRider = selections.find((s) => s.position === 11);

      // Check each main rider for DNS
      for (const selection of mainRiders) {
        if (dnsRiderIds.has(selection.rider_id) && selection.is_active) {
          // This rider is DNS - deactivate them
          await supabase
            .from('participant_rider_selections')
            .update({ 
              is_active: false,
              replaced_at_stage: stage_number,
            })
            .eq('id', selection.id);

          console.log(`[Update Active] Deactivated DNS rider for ${participant.name}: ${selection.riders.name}`);

          // Activate backup if available and not also DNS
          if (backupRider && !dnsRiderIds.has(backupRider.rider_id)) {
            await supabase
              .from('participant_rider_selections')
              .update({ 
                is_active: true,
                replacement_for_rider_id: selection.rider_id,
              })
              .eq('id', backupRider.id);

            substitutionsMade.push({
              participant_name: participant.name,
              rider_out: selection.riders.name,
              rider_in: backupRider.riders.name,
            });

            hasSubstitutions = true;
            console.log(`[Update Active] Activated backup for ${participant.name}: ${backupRider.riders.name} replaces ${selection.riders.name}`);
          } else {
            console.log(`[Update Active] No valid backup available for ${participant.name}`);
            hasSubstitutions = true; // Still count as affected
          }
        }
      }

      if (hasSubstitutions) {
        participantsAffected++;
      }
    }

    console.log(`[Update Active] Made ${substitutionsMade.length} substitutions`);
    console.log(`[Update Active] ${participantsAffected} participants affected`);

    return res.status(200).json({
      success: true,
      stage_number,
      dns_riders: dnsRiderNames,
      substitutions_made: substitutionsMade,
      participants_affected: participantsAffected,
    } as UpdateActiveSelectionsSuccess);

  } catch (error: any) {
    console.error('[Update Active] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}