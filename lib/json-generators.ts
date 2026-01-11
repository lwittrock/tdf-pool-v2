/**
 * JSON Generators (COMPLETELY REWRITTEN & OPTIMIZED)
 * 
 * Major changes:
 * - ✅ Queries rider_stage_points table (no on-the-fly calculation)
 * - ✅ Queries participant_rider_contributions table (no on-the-fly calculation)
 * - ✅ Uses correct field names (stage_points not stage_score)
 * - ✅ Uses TOP_N_FOR_DIRECTIE constant
 * - ✅ Uses unified medal calculation from data-transforms
 * - ✅ Much faster - all data pre-calculated in DB
 */

import { createClient } from '@supabase/supabase-js';
import { 
  TOP_N_FOR_DIRECTIE,
} from './scoring-constants.js';
import { calculateMedalsFromPositions } from './data-transforms.js';
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
} from './types.js';

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
    top_n_participants_for_directie: TOP_N_FOR_DIRECTIE,  // ✅ FIXED: Using constant
    last_updated: new Date().toISOString(),
  };
}

/**
 * Generate leaderboards.json (participant and directie leaderboards)
 * NOW QUERIES DB TABLES - NO MORE ON-THE-FLY CALCULATION
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

  // ========================================================================
  // Build participant leaderboard_by_stage
  // ========================================================================
  const leaderboardByStage: Record<string, LeaderboardEntry[]> = {};

  // Get all participant stage points with participant info
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

  if (participantPointsData) {
    for (const p of participantPointsData) {
      const stageNum = stageIdToNumber.get(p.stage_id);
      if (!stageNum) continue;
      
      const stageKey = `stage_${stageNum}`;
      if (!leaderboardByStage[stageKey]) {
        leaderboardByStage[stageKey] = [];
      }

      const participant = (p as any).participants;
      
      // Get rider contributions for this participant and stage
      const { data: contributions } = await supabase
        .from('participant_rider_contributions')
        .select(`
          points_contributed,
          riders:rider_id (name)
        `)
        .eq('participant_id', p.participant_id)
        .eq('stage_id', p.stage_id);

      const riderContributions: Record<string, number> = {};
      if (contributions) {
        for (const contrib of contributions) {
          const riderName = (contrib as any).riders?.name;
          if (riderName) {
            riderContributions[riderName] = contrib.points_contributed;
          }
        }
      }

      leaderboardByStage[stageKey].push({
        participant_name: participant.name,
        directie_name: participant.directie?.name || 'Unknown',
        overall_score: p.cumulative_points,
        overall_rank: p.overall_rank || 0,
        overall_rank_change: p.overall_rank_change || 0,
        stage_score: p.stage_points,  // Using stage_score for frontend compatibility
        stage_rank: p.stage_rank || 0,
        stage_rider_contributions: riderContributions,
      });
    }
  }

  // ========================================================================
  // Build directie leaderboard_by_stage
  // ========================================================================
  const directieLeaderboardByStage: Record<string, DirectieLeaderboardEntry[]> = {};

  // For each stage, calculate directie points
  for (const stage of stagesData) {
    const stageKey = `stage_${stage.stage_number}`;
    
    // Get all directies
    const { data: directies } = await supabase
      .from('directie')
      .select('id, name');

    if (!directies) continue;

    directieLeaderboardByStage[stageKey] = [];

    for (const directie of directies) {
      // Get all participants in this directie with their stage points
      const { data: directieParticipants } = await supabase
        .from('participant_stage_points')
        .select(`
          stage_points,
          cumulative_points,
          participants:participant_id (
            name,
            directie_id
          )
        `)
        .eq('stage_id', stage.id);

      if (!directieParticipants) continue;

      // Filter to this directie and get top N
      const participantsInDirectie = directieParticipants
        .filter((p: any) => p.participants?.directie_id === directie.id)
        .sort((a, b) => b.stage_points - a.stage_points)
        .slice(0, TOP_N_FOR_DIRECTIE);  // ✅ FIXED: Using constant

      const stageParticipantContributions = participantsInDirectie.map((p: any) => ({
        participant_name: p.participants.name,
        stage_score: p.stage_points,
      }));

      const stagePoints = participantsInDirectie.reduce((sum, p) => sum + p.stage_points, 0);

      // Get top N by overall (cumulative) score
      const participantsOverall = directieParticipants
        .filter((p: any) => p.participants?.directie_id === directie.id)
        .sort((a, b) => b.cumulative_points - a.cumulative_points)
        .slice(0, TOP_N_FOR_DIRECTIE);  // ✅ FIXED: Using constant

      const overallParticipantContributions = participantsOverall.map((p: any) => ({
        participant_name: p.participants.name,
        overall_score: p.cumulative_points,
      }));

      const cumulativePoints = participantsOverall.reduce((sum, p) => sum + p.cumulative_points, 0);

      directieLeaderboardByStage[stageKey].push({
        directie_name: directie.name,
        overall_score: cumulativePoints,
        overall_rank: 0,  // Will calculate after all directies processed
        overall_rank_change: 0,
        stage_score: stagePoints,
        stage_rank: 0,  // Will calculate after all directies processed
        stage_participant_contributions: stageParticipantContributions,
        overall_participant_contributions: overallParticipantContributions,
      });
    }

    // Calculate ranks for this stage
    directieLeaderboardByStage[stageKey].sort((a, b) => b.stage_score - a.stage_score);
    directieLeaderboardByStage[stageKey].forEach((d, idx) => {
      d.stage_rank = idx + 1;
    });

    directieLeaderboardByStage[stageKey].sort((a, b) => b.overall_score - a.overall_score);
    directieLeaderboardByStage[stageKey].forEach((d, idx) => {
      d.overall_rank = idx + 1;
    });

    // Calculate rank changes (if not first stage)
    if (stage.stage_number > 1) {
      const prevStageKey = `stage_${stage.stage_number - 1}`;
      const prevStageData = directieLeaderboardByStage[prevStageKey];
      
      if (prevStageData) {
        for (const directieEntry of directieLeaderboardByStage[stageKey]) {
          const prevEntry = prevStageData.find(d => d.directie_name === directieEntry.directie_name);
          if (prevEntry) {
            directieEntry.overall_rank_change = prevEntry.overall_rank - directieEntry.overall_rank;
          }
        }
      }
    }
  }

  return {
    leaderboard_by_stage: leaderboardByStage,
    directie_leaderboard_by_stage: directieLeaderboardByStage,
  };
}

/**
 * Generate riders.json with rankings and medals
 * NOW QUERIES rider_stage_points TABLE
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

  // Get all completed stages
  const { data: completedStages } = await supabase
    .from('stages')
    .select('id, stage_number, date')
    .eq('is_complete', true)
    .order('stage_number');

  if (!completedStages) return {};

  // For each rider, build their data
  for (const rider of riders) {
    const stages: Record<string, RiderStageData> = {};
    let totalPoints = 0;
    const stageFinishPositions: number[] = [];

    for (const stage of completedStages) {
      const stageKey = `stage_${stage.stage_number}`;

      // Get rider's points for this stage from rider_stage_points table
      const { data: riderStagePoints } = await supabase
        .from('rider_stage_points')
        .select('*')
        .eq('rider_id', rider.id)
        .eq('stage_id', stage.id)
        .maybeSingle();

      // Get stage finish position from stage_results
      const { data: stageResult } = await supabase
        .from('stage_results')
        .select('position')
        .eq('rider_id', rider.id)
        .eq('stage_id', stage.id)
        .maybeSingle();

      const stageFinishPosition = stageResult?.position || 0;
      if (stageFinishPosition > 0 && stageFinishPosition <= 3) {
        stageFinishPositions.push(stageFinishPosition);
      }

      if (riderStagePoints) {
        totalPoints += riderStagePoints.total_points;

        stages[stageKey] = {
          date: stage.date || '',
          stage_finish_points: riderStagePoints.stage_finish_points,
          stage_finish_position: stageFinishPosition,
          stage_rank: riderStagePoints.stage_rank,
          jersey_points: {
            yellow: riderStagePoints.yellow_points,
            green: riderStagePoints.green_points,
            polka_dot: riderStagePoints.polka_dot_points,
            white: riderStagePoints.white_points,
            combative: riderStagePoints.combativity_points,
          },
          stage_total: riderStagePoints.total_points,
          cumulative_total: totalPoints,
        };
      }
    }

    // Only include riders with points
    if (totalPoints > 0) {
      // Calculate medals using unified function
      const medalCounts = calculateMedalsFromPositions(stageFinishPositions);

      ridersJSON[rider.name] = {
        team: rider.team,
        total_points: totalPoints,
        medal_counts: medalCounts,
        stages,
      };
    }
  }

  // Calculate overall ranks
  const rankedRiders = Object.entries(ridersJSON)
    .sort(([, a], [, b]) => b.total_points - a.total_points);

  rankedRiders.forEach(([name, data], index) => {
    ridersJSON[name].overall_rank = index + 1;
  });

  return ridersJSON;
}

/**
 * Generate rider_rankings.json (OPTIMIZED VERSION)
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