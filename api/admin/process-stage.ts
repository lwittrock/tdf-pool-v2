import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';
import {
  generateMetadataJSON,
  generateLeaderboardsJSON,
  generateRidersJSON,
  generateStagesDataJSON,
  generateTeamSelectionsJSON,
} from '../../lib/json-generators.js';

// Temporary addition for manual testing
import { writeFileSync } from 'fs';
import { join } from 'path';


const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ProcessStageRequest {
  stage_number: number;
  force?: boolean;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { stage_number, force }: ProcessStageRequest = req.body;

    if (!stage_number) {
      return res.status(400).json({ error: 'stage_number is required' });
    }

    console.log(`[Process Stage] Starting stage ${stage_number}${force ? ' (forced reprocess)' : ''}`);

    // IDEMPOTENCY CHECK: Prevent reprocessing completed stages
    const { data: existingStage } = await supabase
      .from('stages')
      .select('is_complete')
      .eq('stage_number', stage_number)
      .single();

    if (existingStage?.is_complete && !force) {
      return res.status(400).json({
        error: `Stage ${stage_number} is already complete. Use force=true to reprocess.`,
      });
    }

    // Step 1: Update active selections (handle DNS substitutions)
    console.log('[Process Stage] Step 1: Updating active selections...');
    const updateResult = await updateActiveSelections(stage_number);

    // Step 2: Calculate points
    console.log('[Process Stage] Step 2: Calculating points...');
    const calculateResult = await calculatePoints(stage_number, force);

    // Step 3: Generate and upload static JSON files to Vercel Blob
    console.log('[Process Stage] Step 3: Generating JSON files...');
    const blobUrls = await generateAndUploadJSON();

    console.log('[Process Stage] ✅ Successfully processed stage', stage_number);

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
      blob_urls: blobUrls,
    });

  } catch (error: any) {
    console.error('[Process Stage] Error:', error);
    return res.status(500).json({
      error: 'Stage processing failed',
      details: error.message,
    });
  }
}

/**
 * Step 1: Update active selections (handle DNS substitutions)
 * Extracted logic to avoid HTTP calls within the same function
 */
async function updateActiveSelections(stageNumber: number) {
  console.log('[Update Selections] Starting...');

  // Get the stage
  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .select('id')
    .eq('stage_number', stageNumber)
    .single();

  if (stageError || !stage) {
    throw new Error(`Stage ${stageNumber} not found: ${stageError?.message}`);
  }

  const stageId = stage.id;

  // Get all DNS riders for this stage
  const { data: dnsRecords } = await supabase
    .from('stage_dnf')
    .select(`
      rider_id,
      riders:rider_id (id, name)
    `)
    .eq('stage_id', stageId)
    .eq('status', 'DNS');

  if (!dnsRecords || dnsRecords.length === 0) {
    console.log('[Update Selections] No DNS riders this stage');
    return {
      dns_riders: [],
      substitutions_made: [],
      participants_affected: 0,
    };
  }

  const dnsRiderIds = dnsRecords.map(r => r.rider_id);
  const dnsRiderNames = dnsRecords
    .map((r: any) => r.riders?.name)
    .filter(Boolean);

  console.log('[Update Selections] Found DNS riders:', dnsRiderNames);

  // Find affected participants
  const { data: affectedSelections } = await supabase
    .from('participant_rider_selections')
    .select(`
      id,
      participant_id,
      rider_id,
      position,
      is_active,
      replaced_at_stage,
      participants:participant_id (id, name),
      riders:rider_id (id, name)
    `)
    .in('rider_id', dnsRiderIds)
    .eq('is_active', true);

  if (!affectedSelections || affectedSelections.length === 0) {
    console.log('[Update Selections] No active selections affected');
    return {
      dns_riders: dnsRiderNames,
      substitutions_made: [],
      participants_affected: 0,
    };
  }

  const substitutionsMade: Array<{
    participant_name: string;
    rider_out: string;
    rider_in: string;
  }> = [];
  
  const participantsProcessed = new Set<string>();

  for (const selection of affectedSelections) {
    const participantId = selection.participant_id;
    const participantName = (selection as any).participants?.name || 'Unknown';
    const dnsRiderName = (selection as any).riders?.name || 'Unknown';

    // Skip if already processed this participant
    if (participantsProcessed.has(participantId)) {
      continue;
    }

    // IDEMPOTENCY CHECK: Don't re-substitute if already done for this stage
    if ((selection as any).replaced_at_stage === stageNumber) {
      console.log(`[Update Selections] Already substituted for ${participantName} at stage ${stageNumber}`);
      participantsProcessed.add(participantId);
      continue;
    }

    participantsProcessed.add(participantId);

    // Check if backup already used
    const { data: existingBackupUse } = await supabase
      .from('participant_rider_selections')
      .select('id')
      .eq('participant_id', participantId)
      .eq('position', 11)
      .eq('is_active', true)
      .maybeSingle();

    if (existingBackupUse) {
      // Backup already activated - just deactivate DNS rider
      await supabase
        .from('participant_rider_selections')
        .update({ is_active: false })
        .eq('id', selection.id);

      console.log(`[Update Selections] ${participantName} lost ${dnsRiderName}, backup already used`);
      continue;
    }

    // Get backup rider (position 11, not yet active)
    const { data: backup } = await supabase
      .from('participant_rider_selections')
      .select(`
        id,
        rider_id,
        riders:rider_id (name)
      `)
      .eq('participant_id', participantId)
      .eq('position', 11)
      .eq('is_active', false)
      .maybeSingle();

    if (!backup) {
      // No backup available
      await supabase
        .from('participant_rider_selections')
        .update({ is_active: false })
        .eq('id', selection.id);

      console.log(`[Update Selections] ${participantName} lost ${dnsRiderName}, no backup available`);
      continue;
    }

    const backupRiderName = (backup as any).riders?.name || 'Unknown';

    // Perform substitution
    await supabase
      .from('participant_rider_selections')
      .update({ is_active: false })
      .eq('id', selection.id);

    await supabase
      .from('participant_rider_selections')
      .update({
        is_active: true,
        replaced_at_stage: stageNumber,
        replacement_for_rider_id: selection.rider_id,
      })
      .eq('id', backup.id);

    substitutionsMade.push({
      participant_name: participantName,
      rider_out: dnsRiderName,
      rider_in: backupRiderName,
    });

    console.log(`[Update Selections] ✓ ${participantName}: ${dnsRiderName} → ${backupRiderName}`);
  }

  return {
    dns_riders: dnsRiderNames,
    substitutions_made: substitutionsMade,
    participants_affected: participantsProcessed.size,
  };
}

/**
 * Step 2: Calculate points
 * Extracted logic to avoid HTTP calls within the same function
 */
async function calculatePoints(stageNumber: number, force: boolean = false) {
  console.log('[Calculate Points] Starting...');

  // Import the handler dynamically to avoid circular dependencies
  const calculatePointsModule = await import('./calculate-points.js');
  
  // Create mock request/response objects
  const mockReq = {
    method: 'POST',
    body: { stage_number: stageNumber, force },
  } as VercelRequest;

  let result: any = null;
  let statusCode = 200;

  const mockRes = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (data: any) => {
          result = data;
          return data;
        },
      };
    },
  } as any as VercelResponse;

  await calculatePointsModule.default(mockReq, mockRes);

  if (statusCode !== 200) {
    throw new Error(`Calculate points failed: ${result?.error || 'Unknown error'}`);
  }

  console.log('[Calculate Points] ✓ Completed');
  return result;
}

/**
 * Step 3: Generate and upload JSON files to Vercel Blob Storage
 */
async function generateAndUploadJSON() {
  console.log('[Generate JSON] Generating all JSON files...');

  const [metadata, leaderboards, riders, stages, teamSelections] = await Promise.all([
    generateMetadataJSON(),
    generateLeaderboardsJSON(),
    generateRidersJSON(),
    generateStagesDataJSON(),
    generateTeamSelectionsJSON(),
  ]);

  // TEMPORARY: Write to local files instead of blob
  const outputDir = join(process.cwd(), 'public', 'data');
  
  writeFileSync(
    join(outputDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  writeFileSync(
    join(outputDir, 'leaderboards.json'),
    JSON.stringify(leaderboards, null, 2)
  );
  writeFileSync(
    join(outputDir, 'riders.json'),
    JSON.stringify(riders, null, 2)
  );
  writeFileSync(
    join(outputDir, 'stages_data.json'),
    JSON.stringify(stages, null, 2)
  );

  writeFileSync(
    join(outputDir, 'team_selections.json'),
    JSON.stringify(teamSelections, null, 2)
  );

  console.log('[Generate JSON] ✓ Written to local files');
  
  return {
    metadata: '/data/metadata.json',
    leaderboards: '/data/leaderboards.json',
    riders: '/data/riders.json',
    stages: '/data/stages_data.json',
  };
}