import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface UpdateActiveSelectionsRequest {
  stage_number: number;
}

interface SubstitutionMade {
  participant_name: string;
  rider_out: string;
  rider_in: string;
}

interface SuccessResponse {
  success: boolean;
  stage_number: number;
  dns_riders: string[];
  substitutions_made: SubstitutionMade[];
  participants_affected: number;
}

interface ErrorResponse {
  error: string;
  details?: any;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { stage_number }: UpdateActiveSelectionsRequest = req.body;

    if (!stage_number) {
      return res.status(400).json({ error: 'stage_number is required' });
    }

    // Step 1: Get the stage
    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select('id')
      .eq('stage_number', stage_number)
      .single();

    if (stageError || !stage) {
      return res.status(404).json({
        error: `Stage ${stage_number} not found`,
        details: stageError,
      });
    }

    const stageId = stage.id;

    // Step 2: Get all DNS riders for this stage
    const { data: dnsRecords, error: dnsError } = await supabase
      .from('stage_dnf')
      .select(`
        rider_id,
        riders:rider_id (
          id,
          name
        )
      `)
      .eq('stage_id', stageId)
      .eq('status', 'DNS');

    if (dnsError) {
      return res.status(500).json({
        error: 'Failed to fetch DNS riders',
        details: dnsError,
      });
    }

    if (!dnsRecords || dnsRecords.length === 0) {
      // No DNS riders this stage - nothing to do
      return res.status(200).json({
        success: true,
        stage_number,
        dns_riders: [],
        substitutions_made: [],
        participants_affected: 0,
      });
    }

    // Extract DNS rider IDs and names
    const dnsRiderIds = dnsRecords.map((r) => r.rider_id);
    const dnsRiderNames = dnsRecords
      .map((r: any) => r.riders?.name)
      .filter(Boolean);

    // Step 3: Find all participants who have DNS riders in their active selections
    const { data: affectedSelections, error: selectionsError } = await supabase
      .from('participant_rider_selections')
      .select(`
        id,
        participant_id,
        rider_id,
        position,
        is_active,
        participants:participant_id (
          id,
          name
        ),
        riders:rider_id (
          id,
          name
        )
      `)
      .in('rider_id', dnsRiderIds)
      .eq('is_active', true);

    if (selectionsError) {
      return res.status(500).json({
        error: 'Failed to fetch affected selections',
        details: selectionsError,
      });
    }

    if (!affectedSelections || affectedSelections.length === 0) {
      // DNS riders exist but none are in anyone's active team
      return res.status(200).json({
        success: true,
        stage_number,
        dns_riders: dnsRiderNames,
        substitutions_made: [],
        participants_affected: 0,
      });
    }

    // Step 4: For each affected participant, activate their backup (if available and not already used)
    const substitutionsMade: SubstitutionMade[] = [];
    const participantsProcessed = new Set<string>();

    for (const selection of affectedSelections) {
      const participantId = selection.participant_id;
      const participantName = (selection as any).participants?.name || 'Unknown';
      const dnsRiderName = (selection as any).riders?.name || 'Unknown';

      // Skip if we already processed this participant (in case they have multiple DNS riders)
      if (participantsProcessed.has(participantId)) {
        continue;
      }

      participantsProcessed.add(participantId);

      // Check if participant has already used their backup
      const { data: existingSubstitution } = await supabase
        .from('participant_rider_selections')
        .select('id')
        .eq('participant_id', participantId)
        .eq('position', 11)
        .eq('is_active', true)
        .maybeSingle();

      if (existingSubstitution) {
        // Backup already activated in a previous stage - just deactivate DNS rider
        await supabase
          .from('participant_rider_selections')
          .update({ is_active: false })
          .eq('id', selection.id);

        console.log(
          `Participant ${participantName} lost ${dnsRiderName} but backup already used`
        );
        continue;
      }

      // Get the backup rider (position 11, not yet active)
      const { data: backup, error: backupError } = await supabase
        .from('participant_rider_selections')
        .select(`
          id,
          rider_id,
          riders:rider_id (
            name
          )
        `)
        .eq('participant_id', participantId)
        .eq('position', 11)
        .eq('is_active', false)
        .maybeSingle();

      if (backupError || !backup) {
        // No backup available - just deactivate the DNS rider
        await supabase
          .from('participant_rider_selections')
          .update({ is_active: false })
          .eq('id', selection.id);

        console.log(
          `Participant ${participantName} lost ${dnsRiderName} but has no backup`
        );
        continue;
      }

      const backupRiderName = (backup as any).riders?.name || 'Unknown';

      // Perform the substitution:
      // 1. Deactivate DNS rider
      await supabase
        .from('participant_rider_selections')
        .update({ is_active: false })
        .eq('id', selection.id);

      // 2. Activate backup rider
      await supabase
        .from('participant_rider_selections')
        .update({
          is_active: true,
          replaced_at_stage: stage_number,
          replacement_for_rider_id: selection.rider_id,
        })
        .eq('id', backup.id);

      substitutionsMade.push({
        participant_name: participantName,
        rider_out: dnsRiderName,
        rider_in: backupRiderName,
      });

      console.log(
        `âœ… ${participantName}: ${dnsRiderName} â†’ ${backupRiderName} (Stage ${stage_number})`
      );
    }

    return res.status(200).json({
      success: true,
      stage_number,
      dns_riders: dnsRiderNames,
      substitutions_made: substitutionsMade,
      participants_affected: participantsProcessed.size,
    });
  } catch (error: any) {
    console.error('Update active selections error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}