/**
 * Get Stage API (Optimized)
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { StageData, ApiError, ApiSuccess } from '../../lib/types';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed' 
    });
  }

  try {
    const { stage_number } = req.query;

    if (!stage_number) {
      return res.status(400).json({ 
        success: false,
        error: 'stage_number is required' 
      });
    }

    console.log('[API] Fetching stage:', stage_number);

    // Get stage info
    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select('*')
      .eq('stage_number', stage_number)
      .single();

    if (stageError || !stage) {
      console.error('[API] Stage not found:', stageError);
      return res.status(404).json({ 
        success: false,
        error: 'Stage not found' 
      });
    }

    console.log('[API] Found stage:', stage.id);

    // Get all riders first (we'll need this for lookups)
    const { data: allRiders } = await supabase
      .from('riders')
      .select('id, name, team');

    const riderMap = new Map(allRiders?.map(r => [r.id, r.name]) || []);

    // Get stage results (top 20)
    const { data: results } = await supabase
      .from('stage_results')
      .select('position, time_gap, rider_id')
      .eq('stage_id', stage.id)
      .order('position')
      .limit(20);

    console.log('[API] Found results:', results?.length);

    // Get jerseys
    const { data: jerseys } = await supabase
      .from('stage_jerseys')
      .select('jersey_type, rider_id')
      .eq('stage_id', stage.id);

    console.log('[API] Found jerseys:', jerseys?.length);

    // Get combativity
    const { data: combativity } = await supabase
      .from('stage_combativity')
      .select('rider_id')
      .eq('stage_id', stage.id)
      .maybeSingle();

    console.log('[API] Found combativity:', combativity ? 'yes' : 'no');

    // Get DNF/DNS
    const { data: dnf } = await supabase
      .from('stage_dnf')
      .select('status, rider_id')
      .eq('stage_id', stage.id);

    console.log('[API] Found DNF/DNS:', dnf?.length);

    // Format response using shared StageData type
    const stageData: StageData = {
      stage_number: stage.stage_number,
      date: stage.date,
      distance: stage.distance,
      departure_city: stage.departure_city,
      arrival_city: stage.arrival_city,
      stage_type: stage.stage_type,
      difficulty: stage.difficulty,
      won_how: stage.won_how,
      is_complete: stage.is_complete,
      top_20_finishers: results?.map(r => ({
        position: r.position,
        rider_name: riderMap.get(r.rider_id) || '',
        time_gap: r.time_gap
      })) || [],
      jerseys: {
        yellow: riderMap.get(jerseys?.find(j => j.jersey_type === 'yellow')?.rider_id || '') || '',
        green: riderMap.get(jerseys?.find(j => j.jersey_type === 'green')?.rider_id || '') || '',
        polka_dot: riderMap.get(jerseys?.find(j => j.jersey_type === 'polka_dot')?.rider_id || '') || '',
        white: riderMap.get(jerseys?.find(j => j.jersey_type === 'white')?.rider_id || '') || '',
      },
      combativity: riderMap.get(combativity?.rider_id || '') || '',
      dnf_riders: dnf?.filter(d => d.status === 'DNF').map(d => riderMap.get(d.rider_id) || '') || [],
      dns_riders: dnf?.filter(d => d.status === 'DNS').map(d => riderMap.get(d.rider_id) || '') || [],
    };

    console.log('[API] Returning stage data');
    return res.status(200).json({
      success: true,
      data: stageData
    });
  } catch (error: any) {
    console.error('[API] Error fetching stage:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error.message 
    });
  }
}