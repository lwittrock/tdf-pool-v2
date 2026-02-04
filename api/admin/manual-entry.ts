/**
 * Manual Stage Entry API
 * 
 * Allows manual entry of stage results, jerseys, combativity, and DNF/DNS riders.
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ManualStageEntry, ApiError, ApiSuccess } from '../../lib/types';

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
    const stageData: ManualStageEntry = req.body;
    const warnings: string[] = [];

    // Validation
    if (!stageData.stage_number) {
      return res.status(400).json({ 
        success: false,
        error: 'stage_number is required' 
      });
    }

    // Check if stage already exists and is complete
    const { data: existingStage } = await supabase
      .from('stages')
      .select('id, is_complete')
      .eq('stage_number', stageData.stage_number)
      .single();

    if (existingStage?.is_complete && !stageData.force) {
      return res.status(400).json({
        success: false,
        error: `Stage ${stageData.stage_number} is already marked as complete. Cannot modify.`,
      });
    }

    // Step 1: Create or update stage record
    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .upsert(
        {
          stage_number: stageData.stage_number,
          date: stageData.date || null,
          distance: stageData.distance || null,
          departure_city: stageData.departure_city || null,
          arrival_city: stageData.arrival_city || null,
          stage_type: stageData.stage_type || null,
          difficulty: stageData.difficulty || null,
          won_how: stageData.won_how || null,
          is_complete: false,
        },
        { onConflict: 'stage_number' }
      )
      .select('id')
      .single();

    if (stageError || !stage) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create/update stage',
        details: stageError,
      });
    }

    const stageId = stage.id;

    // Step 2: Get all rider IDs
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

    const riderMap = new Map(riders.map((r) => [r.name, r.id]));

    // Step 3: Clear existing stage data (for re-entry)
    await supabase.from('stage_results').delete().eq('stage_id', stageId);
    await supabase.from('stage_jerseys').delete().eq('stage_id', stageId);
    await supabase.from('stage_combativity').delete().eq('stage_id', stageId);
    await supabase.from('stage_dnf').delete().eq('stage_id', stageId);

    // Step 4: Insert top 20 finishers
    if (!stageData.top_20_finishers || stageData.top_20_finishers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'top_20_finishers is required and cannot be empty',
      });
    }

    const resultsToInsert = [];
    for (const finisher of stageData.top_20_finishers) {
      const riderId = riderMap.get(finisher.rider_name);
      
      if (!riderId) {
        warnings.push(`Rider not found: ${finisher.rider_name} (skipping)`);
        continue;
      }

      resultsToInsert.push({
        stage_id: stageId,
        rider_id: riderId,
        position: finisher.position,
        time_gap: finisher.time_gap || null,
      });
    }

    if (resultsToInsert.length > 0) {
      const { error: resultsError } = await supabase
        .from('stage_results')
        .insert(resultsToInsert);

      if (resultsError) {
        return res.status(500).json({
          success: false,
          error: 'Failed to insert stage results',
          details: resultsError,
        });
      }
    }

    // Step 5: Insert jerseys
    const jerseyInserts = [];
    const jerseyTypes: Array<keyof typeof stageData.jerseys> = ['yellow', 'green', 'polka_dot', 'white'];

    for (const jerseyType of jerseyTypes) {
      const riderName = stageData.jerseys?.[jerseyType];
      if (!riderName) {
        warnings.push(`${jerseyType} jersey holder not provided`);
        continue;
      }

      const riderId = riderMap.get(riderName);
      if (!riderId) {
        warnings.push(`${jerseyType} jersey: Rider not found - ${riderName}`);
        continue;
      }

      jerseyInserts.push({
        stage_id: stageId,
        jersey_type: jerseyType,
        rider_id: riderId,
      });
    }

    if (jerseyInserts.length > 0) {
      const { error: jerseysError } = await supabase
        .from('stage_jerseys')
        .insert(jerseyInserts);

      if (jerseysError) {
        return res.status(500).json({
          success: false,
          error: 'Failed to insert jerseys',
          details: jerseysError,
        });
      }
    }

    // Step 6: Insert combativity
    if (stageData.combativity) {
      const riderId = riderMap.get(stageData.combativity);
      if (riderId) {
        const { error: combativityError } = await supabase
          .from('stage_combativity')
          .insert({
            stage_id: stageId,
            rider_id: riderId,
          });

        if (combativityError) {
          warnings.push(`Failed to insert combativity: ${combativityError.message}`);
        }
      } else {
        warnings.push(`Combativity rider not found: ${stageData.combativity}`);
      }
    } else {
      warnings.push('Combativity rider not provided');
    }

    // Step 7: Insert DNF/DNS riders
    const dnfInserts = [];

    if (stageData.dnf_riders && stageData.dnf_riders.length > 0) {
      for (const riderName of stageData.dnf_riders) {
        const riderId = riderMap.get(riderName);
        if (!riderId) {
          warnings.push(`DNF rider not found: ${riderName}`);
          continue;
        }
        dnfInserts.push({
          stage_id: stageId,
          rider_id: riderId,
          status: 'DNF' as const,
        });
      }
    }

    if (stageData.dns_riders && stageData.dns_riders.length > 0) {
      for (const riderName of stageData.dns_riders) {
        const riderId = riderMap.get(riderName);
        if (!riderId) {
          warnings.push(`DNS rider not found: ${riderName}`);
          continue;
        }
        dnfInserts.push({
          stage_id: stageId,
          rider_id: riderId,
          status: 'DNS' as const,
        });
      }
    }

    if (dnfInserts.length > 0) {
      const { error: dnfError } = await supabase
        .from('stage_dnf')
        .insert(dnfInserts);

      if (dnfError) {
        return res.status(500).json({
          success: false,
          error: 'Failed to insert DNF/DNS riders',
          details: dnfError,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        stage_id: stageId,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    });
  } catch (error: any) {
    console.error('Manual stage entry error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}
