/**
 * JSON Generators (Optimized)
 * 
 * Optimizations:
 * - Uses shared types from lib/types.ts
 * - Removed all duplicate type definitions
 * - Uses shared constants
 * - Better organization
 */

import { createClient } from '@supabase/supabase-js';
import { 
  POINTS_FOR_RANK, 
  JERSEY_POINTS, 
  COMBATIVITY_POINTS, 
  type JerseyType 
} from './scoring-constants.js';
import type {
  Metadata,
  LeaderboardEntry,
  DirectieLeaderboardEntry,
  RiderStageData,
  RiderMedalCounts,
  RiderData,
  RidersData,
  RiderRankingsStageEntry,
  RiderRankingsTotalEntry,
  RiderRankingsData,
  StageData,
  TeamSelection,
  JerseyPoints
} from './types';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
export async function generateMetadataJSON(): Promise<Metadata> {
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
 * Calculate medal counts for a rider across all stages
 */
function calculateRiderMedals(stages: Record<string, RiderStageData>): RiderMedalCounts {
  let gold = 0, silver = 0, bronze = 0;
  
  for (const stageData of Object.values(stages)) {
    const pos = stageData.stage_finish_position;
    if (pos === 1) gold++;
    else if (pos === 2) silver++;
    else if (pos === 3) bronze++;
  }
  
  const medals: string[] = [];
  if (gold > 0) medals.push('🥇'.repeat(gold));
  if (silver > 0) medals.push('🥈'.repeat(silver));
  if (bronze > 0) medals.push('🥉'.repeat(bronze));
  
  return {
    gold,
    silver,
    bronze,
    display: medals.join(' ')
  };
}

/**
 * Generate riders.json with rankings and medals
 */
export async function generateRidersJSON(): Promise<RidersData> {
  console.log('[Generate JSON] Building riders data...');

  const { data: riders } = await supabase
    .from('riders')
    .select('id, name, team')
    .eq('is_active', true)
    .order('name');

  if (!riders) return {};

  const ridersJSON: RidersData = {};

  // First pass: Build basic rider data
  for (const rider of riders) {
    // Get all stage results for this rider
    const { data: stageResults } = await supabase
      .from('stage_results')
      .select(`stage_id, position, stages!inner(stage_number, date)`)
      .eq('rider_id', rider.id)
      .order('stages(stage_number)');

    // Get jersey points per stage
    const { data: jerseyData } = await supabase
      .from('stage_jerseys')
      .select(`stage_id, jersey_type, stages!inner(stage_number)`)
      .eq('rider_id', rider.id);

    // Get combativity awards
    const { data: combativityData } = await supabase
      .from('stage_combativity')
      .select(`stage_id, stages!inner(stage_number)`)
      .eq('rider_id', rider.id);

    // Build stages object
    const stages: Record<string, RiderStageData> = {};
    let totalPoints = 0;

    // Helper to organize points by stage
    const jerseyPointsByStage: Record<number, JerseyPoints> = {};

    // Helper function to initialize stage structure if missing
    const ensureStage = (stageNum: number) => {
      if (!jerseyPointsByStage[stageNum]) {
        jerseyPointsByStage[stageNum] = {
          yellow: 0, green: 0, polka_dot: 0, white: 0, combative: 0
        };
      }
    };

    // Process Jersey Data using scoring-constants.ts
    if (jerseyData) {
      for (const jp of jerseyData) {
        const stageNum = (jp.stages as any).stage_number;
        ensureStage(stageNum);
        
        const type = jp.jersey_type as JerseyType;
        
        if (type in JERSEY_POINTS) {
          jerseyPointsByStage[stageNum][type] = JERSEY_POINTS[type];
        }
      }
    }

    // Process Combativity Data using scoring-constants.ts
    if (combativityData) {
      for (const ca of combativityData) {
        const stageNum = (ca.stages as any).stage_number;
        ensureStage(stageNum);
        jerseyPointsByStage[stageNum].combative = COMBATIVITY_POINTS;
      }
    }

    // Build stage entries
    if (stageResults) {
      let cumulativeTotal = 0;
      
      for (const result of stageResults) {
        const stageNum = (result.stages as any).stage_number;
        const stageDate = (result.stages as any).date;
        const stageKey = `stage_${stageNum}`;
        
        // Use POINTS_FOR_RANK from scoring-constants.ts
        const stageFinishPoints = POINTS_FOR_RANK[result.position] || 0;
        
        const jerseys: JerseyPoints = jerseyPointsByStage[stageNum] || {
          yellow: 0, green: 0, polka_dot: 0, white: 0, combative: 0
        };
        
        const jerseyTotal = Object.values(jerseys).reduce((sum: number, p: number) => sum + p, 0);
        const stageTotal = stageFinishPoints + jerseyTotal;
        cumulativeTotal += stageTotal;
        totalPoints += stageTotal;
        
        stages[stageKey] = {
          date: stageDate,
          stage_finish_position: result.position,
          stage_finish_points: stageFinishPoints,
          stage_rank: 0, // Calculated later
          jersey_points: jerseys,
          stage_total: stageTotal,
          cumulative_total: cumulativeTotal
        };
      }
    }

    ridersJSON[rider.name] = {
      team: rider.team,
      total_points: totalPoints,
      overall_rank: 0, // Calculated later
      medal_counts: { gold: 0, silver: 0, bronze: 0, display: '' }, // Calculated later
      stages: stages
    };
  }

  // Second pass: Calculate overall rankings and medals
  const ridersArray = Object.entries(ridersJSON).map(([name, data]) => ({ name, ...data }));
  
  ridersArray.sort((a, b) => b.total_points - a.total_points);
  
  ridersArray.forEach((rider, index) => {
    const medals = calculateRiderMedals(rider.stages);
    ridersJSON[rider.name].overall_rank = index + 1;
    ridersJSON[rider.name].medal_counts = medals;
  });

  // Third pass: Calculate stage ranks
  const stageNumbers = new Set<number>();
  for (const riderData of Object.values(ridersJSON)) {
    for (const stageKey of Object.keys(riderData.stages)) {
      stageNumbers.add(parseInt(stageKey.replace('stage_', '')));
    }
  }

  for (const stageNum of Array.from(stageNumbers).sort((a, b) => a - b)) {
    const stageKey = `stage_${stageNum}`;
    const stageParticipants: Array<{ name: string; stageTotal: number }> = [];
    
    for (const [name, riderData] of Object.entries(ridersJSON)) {
      if (riderData.stages[stageKey]) {
        stageParticipants.push({
          name,
          stageTotal: riderData.stages[stageKey].stage_total
        });
      }
    }
    
    stageParticipants.sort((a, b) => b.stageTotal - a.stageTotal);
    
    stageParticipants.forEach((participant, index) => {
      ridersJSON[participant.name].stages[stageKey].stage_rank = index + 1;
    });
  }

  return ridersJSON;
}

/**
 * Generate rider_rankings.json
 */
export async function generateRiderRankingsJSON(): Promise<RiderRankingsData> {
  console.log('[Generate JSON] Building rider rankings...');

  const ridersData = await generateRidersJSON();
  
  if (!ridersData || Object.keys(ridersData).length === 0) {
    return {
      stage_rankings: {},
      total_rankings: []
    };
  }

  // Get current stage
  const currentStage = await getCurrentStage();
  const currentStageKey = `stage_${currentStage}`;

  // Build stage rankings for current stage
  const stageRankings: RiderRankingsStageEntry[] = [];
  for (const [name, riderData] of Object.entries(ridersData)) {
    const stageData = riderData.stages[currentStageKey];
    if (stageData) {
      stageRankings.push({
        name,
        team: riderData.team,
        stage_rank: stageData.stage_rank!,
        stage_points: stageData.stage_total,
        stage_finish_position: stageData.stage_finish_position,
        stage_finish_points: stageData.stage_finish_points,
        jersey_points: stageData.jersey_points
      });
    }
  }

  // Sort by stage rank
  stageRankings.sort((a, b) => a.stage_rank - b.stage_rank);

  // Build total rankings
  const totalRankings: RiderRankingsTotalEntry[] = Object.entries(ridersData).map(([name, riderData]) => ({
    name,
    team: riderData.team,
    overall_rank: riderData.overall_rank!,
    total_points: riderData.total_points,
    medal_counts: riderData.medal_counts!
  }));

  // Sort by overall rank
  totalRankings.sort((a, b) => a.overall_rank - b.overall_rank);

  return {
    stage_rankings: {
      [currentStageKey]: stageRankings
    },
    total_rankings: totalRankings
  };
}

/**
 * Calculate rider contributions for each participant per stage
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
      const type = jersey.jersey_type as JerseyType;
      const points = JERSEY_POINTS[type] || 0;
      
      if (points > 0) {
        riderPoints.set(jersey.rider_id, (riderPoints.get(jersey.rider_id) || 0) + points);
      }
    }

    if (combativity?.rider_id) {
      riderPoints.set(
        combativity.rider_id, 
        (riderPoints.get(combativity.rider_id) || 0) + COMBATIVITY_POINTS
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
export async function generateStagesDataJSON(): Promise<StageData[]> {
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

  const stagesData: StageData[] = [];

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
      .maybeSingle();

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
export async function generateTeamSelectionsJSON(): Promise<Record<string, TeamSelection>> {
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

  const teamSelections: Record<string, TeamSelection> = {};

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