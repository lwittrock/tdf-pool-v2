/**
 * Submit Stage Results API
 * Endpoint for scraper to submit Tour de France stage results
 * 
 * Features:
 * - Fuzzy rider name matching with warnings
 * - Automatic winning_team detection
 * - Comprehensive validation
 * - Same logic as manual-entry but with scraper-friendly format
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { 
  SubmitStageResultsRequest, 
  SubmitStageResultsSuccess,
  RiderMatchWarning,
} from '../../lib/scraper-types.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Fuzzy match rider name to database
 * Returns { riderId, matchedName, confidence, warnings }
 */
async function matchRider(
  riderName: string,
  riderMap: Map<string, { id: string; team: string }>
): Promise<{
  riderId: string | null;
  matchedName: string | null;
  confidence: number;
  warning?: RiderMatchWarning;
}> {
  // Try exact match first (case-insensitive)
  const exactMatch = Array.from(riderMap.entries()).find(
    ([name]) => name.toLowerCase() === riderName.toLowerCase()
  );

  if (exactMatch) {
    return {
      riderId: exactMatch[1].id,
      matchedName: exactMatch[0],
      confidence: 1.0,
    };
  }

  // Try fuzzy matching using pg_trgm similarity
  const { data: fuzzyMatches } = await supabase.rpc('find_rider_by_name_fuzzy', {
    search_name: riderName,
  });

  if (fuzzyMatches && fuzzyMatches.length > 0) {
    const bestMatch = fuzzyMatches[0];
    
    if (bestMatch.similarity_score > 0.8) {
      // High confidence match
      return {
        riderId: bestMatch.id,
        matchedName: bestMatch.name,
        confidence: bestMatch.similarity_score,
        warning: {
          rider_name: riderName,
          matched_to: bestMatch.name,
          similarity_score: bestMatch.similarity_score,
          issue: 'low_confidence',
        },
      };
    } else if (bestMatch.similarity_score > 0.6) {
      // Low confidence - return warning
      return {
        riderId: null,
        matchedName: null,
        confidence: bestMatch.similarity_score,
        warning: {
          rider_name: riderName,
          matched_to: bestMatch.name,
          similarity_score: bestMatch.similarity_score,
          issue: 'low_confidence',
        },
      };
    }
  }

  // No match found
  return {
    riderId: null,
    matchedName: null,
    confidence: 0,
    warning: {
      rider_name: riderName,
      issue: 'not_found',
    },
  };
}

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
    const stageData: SubmitStageResultsRequest = req.body;
    const riderWarnings: RiderMatchWarning[] = [];
    const generalWarnings: string[] = [];

    // Validation
    if (!stageData.stage_number) {
      return res.status(400).json({ 
        success: false,
        error: 'stage_number is required' 
      });
    }

    if (!stageData.top_20_finishers || stageData.top_20_finishers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'top_20_finishers is required and cannot be empty',
      });
    }

    console.log(`[Submit Stage Results] Processing stage ${stageData.stage_number}`);

    // Check if stage already exists and is complete
    const { data: existingStage } = await supabase
      .from('stages')
      .select('id, is_complete')
      .eq('stage_number', stageData.stage_number)
      .single();

    if (existingStage?.is_complete && !stageData.force) {
      return res.status(400).json({
        success: false,
        error: `Stage ${stageData.stage_number} is already marked as complete. Use force=true to override.`,
      });
    }

    // Get all riders (for matching)
    const { data: allRiders } = await supabase
      .from('riders')
      .select('id, name, team');

    if (!allRiders || allRiders.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'No riders found in database. Please submit startlist first.',
      });
    }

    const riderMap = new Map(allRiders.map(r => [r.name, { id: r.id, team: r.team }]));

    // Determine winning_team from stage winner if not provided
    let winningTeam = stageData.winning_team;
    if (!winningTeam && stageData.top_20_finishers.length > 0) {
      const winnerName = stageData.top_20_finishers[0].rider_name;
      const winnerMatch = await matchRider(winnerName, riderMap);
      if (winnerMatch.riderId) {
        const winnerData = riderMap.get(winnerMatch.matchedName!);
        winningTeam = winnerData?.team;
        console.log(`[Submit Stage Results] Derived winning_team: ${winningTeam}`);
      }
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
          winning_team: winningTeam || null,
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

    // Step 2: Clear existing stage data (for re-entry)
    await supabase.from('stage_results').delete().eq('stage_id', stageId);
    await supabase.from('stage_jerseys').delete().eq('stage_id', stageId);
    await supabase.from('stage_combativity').delete().eq('stage_id', stageId);
    await supabase.from('stage_dnf').delete().eq('stage_id', stageId);

    // Step 3: Match and insert top 20 finishers
    const resultsToInsert = [];
    
    for (const finisher of stageData.top_20_finishers) {
      const match = await matchRider(finisher.rider_name, riderMap);
      
      if (!match.riderId) {
        if (match.warning) {
          riderWarnings.push(match.warning);
        }
        generalWarnings.push(`Position ${finisher.position}: Could not match rider "${finisher.rider_name}"`);
        continue;
      }

      if (match.warning && match.confidence < 1.0) {
        riderWarnings.push(match.warning);
      }

      resultsToInsert.push({
        stage_id: stageId,
        rider_id: match.riderId,
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

    console.log(`[Submit Stage Results] Inserted ${resultsToInsert.length} results`);

    // Step 4: Insert jerseys
    const jerseyInserts = [];
    const jerseyTypes: Array<keyof typeof stageData.jerseys> = ['yellow', 'green', 'polka_dot', 'white'];

    for (const jerseyType of jerseyTypes) {
      const riderName = stageData.jerseys?.[jerseyType];
      if (!riderName) {
        generalWarnings.push(`${jerseyType} jersey holder not provided`);
        continue;
      }

      const match = await matchRider(riderName, riderMap);
      
      if (!match.riderId) {
        if (match.warning) {
          riderWarnings.push(match.warning);
        }
        generalWarnings.push(`${jerseyType} jersey: Could not match rider "${riderName}"`);
        continue;
      }

      if (match.warning && match.confidence < 1.0) {
        riderWarnings.push(match.warning);
      }

      jerseyInserts.push({
        stage_id: stageId,
        jersey_type: jerseyType,
        rider_id: match.riderId,
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

    console.log(`[Submit Stage Results] Inserted ${jerseyInserts.length} jerseys`);

    // Step 5: Insert combativity
    if (stageData.combativity) {
      const match = await matchRider(stageData.combativity, riderMap);
      
      if (match.riderId) {
        if (match.warning && match.confidence < 1.0) {
          riderWarnings.push(match.warning);
        }

        const { error: combativityError } = await supabase
          .from('stage_combativity')
          .insert({
            stage_id: stageId,
            rider_id: match.riderId,
          });

        if (combativityError) {
          generalWarnings.push(`Failed to insert combativity: ${combativityError.message}`);
        }
      } else {
        if (match.warning) {
          riderWarnings.push(match.warning);
        }
        generalWarnings.push(`Combativity: Could not match rider "${stageData.combativity}"`);
      }
    } else {
      generalWarnings.push('Combativity rider not provided');
    }

    // Step 6: Insert DNF/DNS riders
    const dnfInserts = [];

    // DNF riders
    if (stageData.dnf_riders && stageData.dnf_riders.length > 0) {
      for (const riderName of stageData.dnf_riders) {
        const match = await matchRider(riderName, riderMap);
        
        if (!match.riderId) {
          if (match.warning) {
            riderWarnings.push(match.warning);
          }
          generalWarnings.push(`DNF: Could not match rider "${riderName}"`);
          continue;
        }

        if (match.warning && match.confidence < 1.0) {
          riderWarnings.push(match.warning);
        }

        dnfInserts.push({
          stage_id: stageId,
          rider_id: match.riderId,
          status: 'DNF' as const,
        });
      }
    }

    // DNS riders
    if (stageData.dns_riders && stageData.dns_riders.length > 0) {
      for (const riderName of stageData.dns_riders) {
        const match = await matchRider(riderName, riderMap);
        
        if (!match.riderId) {
          if (match.warning) {
            riderWarnings.push(match.warning);
          }
          generalWarnings.push(`DNS: Could not match rider "${riderName}"`);
          continue;
        }

        if (match.warning && match.confidence < 1.0) {
          riderWarnings.push(match.warning);
        }

        dnfInserts.push({
          stage_id: stageId,
          rider_id: match.riderId,
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

    console.log(`[Submit Stage Results] Inserted ${dnfInserts.length} DNF/DNS records`);
    console.log(`[Submit Stage Results] Stage ${stageData.stage_number} submitted successfully`);
    console.log(`[Submit Stage Results] Rider warnings: ${riderWarnings.length}`);
    console.log(`[Submit Stage Results] General warnings: ${generalWarnings.length}`);

    // Return success with warnings
    return res.status(200).json({
      success: true,
      data: {
        stage_id: stageId,
        stage_number: stageData.stage_number,
        rider_warnings: riderWarnings.length > 0 ? riderWarnings : undefined,
        general_warnings: generalWarnings.length > 0 ? generalWarnings : undefined,
      },
    } as SubmitStageResultsSuccess);

  } catch (error: any) {
    console.error('[Submit Stage Results] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}