/**
 * Process Stage API (UPDATED)
 * 
 * Updates:
 * - ✅ Added rider_rankings.json to generated files
 * - ✅ Uses updated json-generators
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';
import {
  generateMetadataJSON,
  generateLeaderboardsJSON,
  generateRidersJSON,
  generateStagesDataJSON,
  generateTeamSelectionsJSON,
  generateRiderRankingsJSON,  // ✅ ADDED
} from '../../lib/json-generators.js';
import type { ProcessStageRequest } from '../../lib/types';

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
    const { stage_number, force }: ProcessStageRequest = req.body;

    if (!stage_number) {
      return res.status(400).json({ 
        success: false,
        error: 'stage_number is required' 
      });
    }

    console.log(`[Process Stage] Starting stage ${stage_number}${force ? ' (forced reprocess)' : ''}`);

    // IDEMPOTENCY CHECK: Prevent reprocessing completed stages
    const { data: existingStage } = await supabase
      .from('stages')
      .select('is_complete')
      .eq('stage_number', stage_number)
      .single();

    if (existingStage?.is_complete && !force) {
      console.log(`[Process Stage] Stage ${stage_number} already processed. Skipping.`);
      return res.status(200).json({
        success: true,
        message: `Stage ${stage_number} already processed`,
      });
    }

    // STEP 1: Update active selections (handle DNS/backups)
    console.log('[Process Stage] Step 1: Updating active selections...');
    const updateSelectionsResponse = await fetch(
      `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/admin/update-active-selections`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_number }),
      }
    );

    if (!updateSelectionsResponse.ok) {
      const error = await updateSelectionsResponse.json();
      return res.status(500).json({
        success: false,
        error: 'Failed to update active selections',
        details: error,
      });
    }

    const selectionsResult = await updateSelectionsResponse.json();
    console.log(`[Process Stage] Active selections updated: ${selectionsResult.participants_affected} participants affected`);

    // STEP 2: Calculate points
    console.log('[Process Stage] Step 2: Calculating points...');
    const calculatePointsResponse = await fetch(
      `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/admin/calculate-points`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_number, force }),
      }
    );

    if (!calculatePointsResponse.ok) {
      const error = await calculatePointsResponse.json();
      return res.status(500).json({
        success: false,
        error: 'Failed to calculate points',
        details: error,
      });
    }

    const pointsResult = await calculatePointsResponse.json();
    console.log('[Process Stage] Points calculated successfully');

    // STEP 3: Mark stage as complete
    console.log('[Process Stage] Step 3: Marking stage as complete...');
    const { error: updateError } = await supabase
      .from('stages')
      .update({ is_complete: true })
      .eq('stage_number', stage_number);

    if (updateError) {
      return res.status(500).json({
        success: false,
        error: 'Failed to mark stage as complete',
        details: updateError,
      });
    }

    // STEP 4: Generate JSON files
    console.log('[Process Stage] Step 4: Generating JSON files...');

    const [metadata, leaderboards, riders, stages, teamSelections, riderRankings] = await Promise.all([
      generateMetadataJSON(),
      generateLeaderboardsJSON(),
      generateRidersJSON(),
      generateStagesDataJSON(),
      generateTeamSelectionsJSON(),
      generateRiderRankingsJSON(),  // ✅ ADDED
    ]);

    // Upload to Vercel Blob
    console.log('[Process Stage] Uploading JSON files to Vercel Blob...');

    const uploadResults = await Promise.all([
      put('data/metadata.json', JSON.stringify(metadata), {
        access: 'public',
        addRandomSuffix: false,
      }),
      put('data/leaderboards.json', JSON.stringify(leaderboards), {
        access: 'public',
        addRandomSuffix: false,
      }),
      put('data/riders.json', JSON.stringify(riders), {
        access: 'public',
        addRandomSuffix: false,
      }),
      put('data/stages_data.json', JSON.stringify(stages), {
        access: 'public',
        addRandomSuffix: false,
      }),
      put('data/team_selections.json', JSON.stringify(teamSelections), {
        access: 'public',
        addRandomSuffix: false,
      }),
      put('data/rider_rankings.json', JSON.stringify(riderRankings), {  // ✅ ADDED
        access: 'public',
        addRandomSuffix: false,
      }),
    ]);

    console.log('[Process Stage] JSON files uploaded successfully');
    console.log('[Process Stage] File URLs:', uploadResults.map((r) => r.url));

    return res.status(200).json({
      success: true,
      message: `Stage ${stage_number} processed successfully`,
      data: {
        stage_number,
        selections_result: selectionsResult,
        points_result: pointsResult,
        files_generated: uploadResults.map((r) => r.pathname),
      },
    });
  } catch (error: any) {
    console.error('[Process Stage] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}