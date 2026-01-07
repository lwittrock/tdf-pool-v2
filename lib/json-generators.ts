/**
 * Utility functions for generating static JSON files from database
 * 
 * This module reads from the calculated data in participant_stage_points and directie_stage_points
 * tables, rather than recalculating points. This ensures JSON matches database exactly.
 */

import { createClient } from '@supabase/supabase-js';
import { POINTS_FOR_RANK } from './scoring-constants.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MetadataJSON {
  current_stage: number;
  top_n_participants_for_directie: number;
  last_updated: string;
}

interface LeaderboardEntry {
  participant_name: string;
  directie_name: string;
  overall_score: number;
  overall_rank: number;
  overall_rank_change: number;
  stage_score: number;
  stage_rank: number;
  stage_rider_contributions: Record<string, number>;
}

interface DirectieLeaderboardEntry {
  directie_name: string;
  overall_score: number;
  overall_rank: number;
  overall_rank_change: number;
  stage_score: number;
  stage_rank: number;
  stage_participant_contributions: Array<{ participant_name: string; stage_score: number }>;
  overall_participant_contributions: Array<{ participant_name: string; overall_score: number }>;
}

interface RiderStageData {
  date: string;
  stage_finish_points: number;
  stage_finish_position: number;
  jersey_points: {
    yellow: number;
    green: number;
    polka_dot: number;
    white: number;
    combative: number;
  };
  stage_total: number;
  cumulative_total: number;
}

interface RiderData {
  team: string;
  total_points: number;
  stages: Record<string, RiderStageData>;
}

/**
 * Get current stage number (highest completed stage)
 */
export async function getCurrentStage(): Promise<number> {
  const { data } = await supabase
    .from('stages')
    .select('stage_number')
    .eq('is_complete', true)
    .order('stage_number', { ascending: false })
    .limit(1)
    .single();

  return data?.stage_number || 0;
}

/**
 * Generate metadata.json
 */
export async function generateMetadataJSON(): Promise<MetadataJSON> {
  const currentStage = await getCurrentStage();
  
  return {
    current_stage: currentStage,
    top_n_participants_for_directie: 5,
    last_updated: new Date().toISOString(),
  };
}

/**
 * Generate leaderboards.json (participant and directie leaderboards)
 */
export async function generateLeaderboardsJSON(): Promise<{
  leaderboard_by_stage: Record<string, LeaderboardEntry[]>;
  directie_leaderboard_by_stage: Record<string, DirectieLeaderboardEntry[]>;
}> {
  console.log('[Generate JSON] Building leaderboards...');

  // Get all completed stages
  const { data: stagesData } = await supabase
    .from('stages')
    .select('id, stage_number, date')
    .eq('is_complete', true)
    .order('stage_number');

  if (!stagesData) {
    throw new Error('Failed to fetch stages');
  }

  const stageIdToNumber = new Map(stagesData.map(s => [s.id, s.stage_number]));

  // Get all participant points with names
  const { data: participantPointsData } = await supabase
    .from('participant_stage_points')
    .select(`
      participant_id,
      stage_id,
      stage_points,
      stage_rank,
      cumulative_points,
      overall_rank,
      overall_rank_change,
      participants:participant_id (
        name,
        directie:directie_id (name)
      )
    `)
    .order('stage_id');

  // Get rider contributions per participant per stage
  // We'll calculate this from active rider selections and rider results
  const riderContributions = await calculateRiderContributions(stagesData);

  // Build leaderboard_by_stage
  const leaderboardByStage: Record<string, LeaderboardEntry[]> = {};
  
  if (participantPointsData) {
    for (const p of participantPointsData) {
      const stageNum = stageIdToNumber.get(p.stage_id);
      if (!stageNum) continue;
      
      const stageKey = `stage_${stageNum}`;
      if (!leaderboardByStage[stageKey]) {
        leaderboardByStage[stageKey] = [];
      }

      const participant = (p as any).participants;
      const participantName = participant.name;
      
      leaderboardByStage[stageKey].push({
        participant_name: participantName,
        directie_name: participant.directie?.name || 'Unknown',
        overall_score: p.cumulative_points,
        overall_rank: p.overall_rank,
        overall_rank_change: p.overall_rank_change || 0,
        stage_score: p.stage_points,
        stage_rank: p.stage_rank,
        stage_rider_contributions: riderContributions.get(`${p.participant_id}_${p.stage_id}`) || {},
      });
    }
  }

  // Get all directie points
  const { data: directiePointsData } = await supabase
    .from('directie_stage_points')
    .select(`
      directie_id,
      stage_id,
      stage_points,
      stage_rank,
      cumulative_points,
      overall_rank,
      overall_rank_change,
      top_contributors,
      directie:directie_id (name)
    `)
    .order('stage_id');

  // Build directie_leaderboard_by_stage
  const directieLeaderboardByStage: Record<string, DirectieLeaderboardEntry[]> = {};
  
  if (directiePointsData) {
    for (const d of directiePointsData) {
      const stageNum = stageIdToNumber.get(d.stage_id);
      if (!stageNum) continue;
      
      const stageKey = `stage_${stageNum}`;
      if (!directieLeaderboardByStage[stageKey]) {
        directieLeaderboardByStage[stageKey] = [];
      }

      directieLeaderboardByStage[stageKey].push({
        directie_name: (d as any).directie?.name || 'Unknown',
        overall_score: d.cumulative_points,
        overall_rank: d.overall_rank,
        overall_rank_change: d.overall_rank_change || 0,
        stage_score: d.stage_points,
        stage_rank: d.stage_rank,
        stage_participant_contributions: (d.top_contributors as any)?.stage || [],
        overall_participant_contributions: (d.top_contributors as any)?.overall || [],
      });
    }
  }

  return {
    leaderboard_by_stage: leaderboardByStage,
    directie_leaderboard_by_stage: directieLeaderboardByStage,
  };
}

/**
 * Generate riders.json (all rider details and stage-by-stage breakdown)
 */
export async function generateRidersJSON(): Promise<Record<string, RiderData>> {
  console.log('[Generate JSON] Building riders data...');

  // Get all stages
  const { data: stagesData } = await supabase
    .from('stages')
    .select('id, stage_number, date')
    .eq('is_complete', true)
    .order('stage_number');

  if (!stagesData) {
    throw new Error('Failed to fetch stages');
  }

  const stageIdToNumber = new Map(stagesData.map(s => [s.id, s.stage_number]));
  const stageIdToDate = new Map(stagesData.map(s => [s.id, s.date]));

  // Get all riders
  const { data: ridersData } = await supabase
    .from('riders')
    .select('id, name, team');

  if (!ridersData) {
    throw new Error('Failed to fetch riders');
  }

  // Get all stage results
  const { data: resultsData } = await supabase
    .from('stage_results')
    .select('rider_id, stage_id, position');

  // Get all jerseys
  const { data: jerseysData } = await supabase
    .from('stage_jerseys')
    .select('rider_id, stage_id, jersey_type');

  // Get all combativity awards
  const { data: combativityData } = await supabase
    .from('stage_combativity')
    .select('rider_id, stage_id');

  // Build riders object
  const ridersObject: Record<string, RiderData> = {};

  for (const rider of ridersData) {
    const stagesObj: Record<string, RiderStageData> = {};
    let totalPoints = 0;

    const riderResults = resultsData?.filter(r => r.rider_id === rider.id) || [];
    
    for (const result of riderResults) {
      const stageNum = stageIdToNumber.get(result.stage_id);
      if (!stageNum) continue;

      const stageKey = `stage_${stageNum}`;
      const finishPoints = POINTS_FOR_RANK[result.position] || 0;

      const jerseyPoints = {
        yellow: 0,
        green: 0,
        polka_dot: 0,
        white: 0,
        combative: 0,
      };

      // Check for jerseys
      const stageJerseys = jerseysData?.filter(
        j => j.rider_id === rider.id && j.stage_id === result.stage_id
      ) || [];

      for (const j of stageJerseys) {
        if (j.jersey_type === 'yellow') jerseyPoints.yellow = 15;
        if (j.jersey_type === 'green') jerseyPoints.green = 10;
        if (j.jersey_type === 'polka_dot') jerseyPoints.polka_dot = 10;
        if (j.jersey_type === 'white') jerseyPoints.white = 10;
      }

      // Check for combativity
      const hasCombativity = combativityData?.some(
        c => c.rider_id === rider.id && c.stage_id === result.stage_id
      );
      if (hasCombativity) {
        jerseyPoints.combative = 5;
      }

      const jerseyTotal = Object.values(jerseyPoints).reduce((a, b) => a + b, 0);
      const stageTotal = finishPoints + jerseyTotal;
      totalPoints += stageTotal;

      stagesObj[stageKey] = {
        date: stageIdToDate.get(result.stage_id) || '',
        stage_finish_points: finishPoints,
        stage_finish_position: result.position,
        jersey_points: jerseyPoints,
        stage_total: stageTotal,
        cumulative_total: totalPoints,
      };
    }

    // Only include riders who scored points
    if (totalPoints > 0) {
      ridersObject[rider.name] = {
        team: rider.team,
        total_points: totalPoints,
        stages: stagesObj,
      };
    }
  }

  return ridersObject;
}

/**
 * Calculate rider contributions for each participant per stage
 * This shows which riders earned which points for each participant
 */
async function calculateRiderContributions(
  stages: Array<{ id: string; stage_number: number }>
): Promise<Map<string, Record<string, number>>> {
  console.log('[Generate JSON] Calculating rider contributions...');

  const contributions = new Map<string, Record<string, number>>();

  // Get all active rider selections per stage
  const { data: selections } = await supabase
    .from('participant_rider_selections')
    .select(`
      participant_id,
      rider_id,
      is_active,
      riders:rider_id(name)
    `)
    .eq('is_active', true);

  if (!selections) return contributions;

  // For each stage, calculate which riders scored points
  for (const stage of stages) {
    // Get stage results
    const { data: results } = await supabase
      .from('stage_results')
      .select('rider_id, position')
      .eq('stage_id', stage.id);

    // Get jerseys
    const { data: jerseys } = await supabase
      .from('stage_jerseys')
      .select('rider_id, jersey_type')
      .eq('stage_id', stage.id);

    // Get combativity
    const { data: combativity } = await supabase
      .from('stage_combativity')
      .select('rider_id')
      .eq('stage_id', stage.id)
      .maybeSingle();

    // Build rider points map for this stage
    const riderPoints = new Map<string, number>();

    for (const result of results || []) {
      const points = POINTS_FOR_RANK[result.position] || 0;
      if (points > 0) {
        riderPoints.set(result.rider_id, (riderPoints.get(result.rider_id) || 0) + points);
      }
    }

    for (const jersey of jerseys || []) {
      let points = 0;
      if (jersey.jersey_type === 'yellow') points = 15;
      if (jersey.jersey_type === 'green') points = 10;
      if (jersey.jersey_type === 'polka_dot') points = 10;
      if (jersey.jersey_type === 'white') points = 10;
      
      if (points > 0) {
        riderPoints.set(jersey.rider_id, (riderPoints.get(jersey.rider_id) || 0) + points);
      }
    }

    if (combativity?.rider_id) {
      riderPoints.set(
        combativity.rider_id, 
        (riderPoints.get(combativity.rider_id) || 0) + 5
      );
    }

    // Now map to participants
    for (const selection of selections) {
      const points = riderPoints.get(selection.rider_id);
      if (points && points > 0) {
        const key = `${selection.participant_id}_${stage.id}`;
        if (!contributions.has(key)) {
          contributions.set(key, {});
        }
        const riderName = (selection as any).riders?.name;
        if (riderName) {
          contributions.get(key)![riderName] = points;
        }
      }
    }
  }

  return contributions;
}

/**
 * Generate stages_data.json (for admin panel)
 */
export async function generateStagesDataJSON() {
  console.log('[Generate JSON] Building stages data...');

  // Get all stages
  const { data: allStages } = await supabase
    .from('stages')
    .select('*')
    .order('stage_number');

  if (!allStages) return [];

  // Get all riders for lookups
  const { data: allRiders } = await supabase
    .from('riders')
    .select('id, name, team');
  
  const riderMap = new Map(allRiders?.map(r => [r.id, r.name]) || []);

  const stagesData = [];

  for (const stage of allStages) {
    // Get stage results
    const { data: results } = await supabase
      .from('stage_results')
      .select('position, time_gap, rider_id')
      .eq('stage_id', stage.id)
      .order('position')
      .limit(20);

    // Get jerseys
    const { data: jerseys } = await supabase
      .from('stage_jerseys')
      .select('jersey_type, rider_id')
      .eq('stage_id', stage.id);

    // Get combativity
    const { data: combativity } = await supabase
      .from('stage_combativity')
      .select('rider_id')
      .eq('stage_id', stage.id)
      .single();

    // Get DNF/DNS
    const { data: dnf } = await supabase
      .from('stage_dnf')
      .select('status, rider_id')
      .eq('stage_id', stage.id);

    stagesData.push({
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
    });
  }

  return stagesData;
}

/**
 * Generate team_selections.json (participant team rosters)
 */
export async function generateTeamSelectionsJSON() {
  console.log('[Generate JSON] Building team selections...');

  const { data: participants } = await supabase
    .from('participants')
    .select(`
      id,
      name,
      directie:directie_id(name),
      participant_rider_selections!inner(
        rider_id,
        position,
        is_active,
        riders:rider_id(name)
      )
    `)
    .order('name');

  if (!participants) {
    throw new Error('Failed to fetch participants');
  }

  const teamSelections: Record<string, {
    participant_name: string;
    directie_name: string;
    riders: string[];
  }> = {};

  for (const participant of participants) {
    const selections = (participant as any).participant_rider_selections || [];
    const riderNames = selections
      .filter((s: any) => s.position <= 10) // Only main 10, not backup
      .sort((a: any, b: any) => a.position - b.position)
      .map((s: any) => s.riders?.name)
      .filter(Boolean);

    teamSelections[participant.name] = {
      participant_name: participant.name,
      directie_name: (participant as any).directie?.name || 'Unknown',
      riders: riderNames,
    };
  }

  return teamSelections;
}