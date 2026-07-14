/**
 * JSON snapshot generators (WP-B2: bulk fetches, computed in memory).
 *
 * Every generator fetches its inputs in a handful of paginated queries
 * (fetchAll — plain selects silently truncate at PostgREST's 1000-row cap,
 * which used to drop leaderboard rows) and assembles the output in memory.
 * The v1-ported per-row queries made a publish take minutes by stage 9.
 *
 * Output shapes are frozen: the frontend consumes these files verbatim.
 */

import { TOP_N_FOR_DIRECTIE } from './scoring-constants.js';
import { calculateMedalsFromPositions } from './data-transforms.js';
import { getServiceClient, fetchAll } from './supabase-server.js';
import type {
  Metadata,
  LeaderboardEntry,
  DirectieLeaderboardEntry,
  RiderStageData,
  RidersData,
  RiderRankingsStageEntry,
  RiderRankingsTotalEntry,
  RiderRankingsData,
  StageData,
  TeamSelection,
} from './types.js';

/**
 * Get current stage number (highest completed stage)
 */
export async function getCurrentStage(): Promise<number> {
  const { data } = await getServiceClient()
    .from('stages')
    .select('stage_number')
    .eq('is_complete', true)
    .order('stage_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.stage_number || 0;
}

/**
 * Generate metadata.json
 */
export async function generateMetadataJSON(): Promise<Metadata> {
  const currentStage = await getCurrentStage();

  return {
    current_stage: currentStage,
    top_n_participants_for_directie: TOP_N_FOR_DIRECTIE,
    last_updated: new Date().toISOString(),
  };
}

interface PspRow {
  participant_id: string;
  stage_id: string;
  stage_points: number;
  stage_rank: number | null;
  cumulative_points: number;
  overall_rank: number | null;
  overall_rank_change: number | null;
}

/**
 * Generate leaderboards.json (participant and directie leaderboards)
 */
export async function generateLeaderboardsJSON(): Promise<{
  leaderboard_by_stage: Record<string, LeaderboardEntry[]>;
  directie_leaderboard_by_stage: Record<string, DirectieLeaderboardEntry[]>;
}> {
  const supabase = getServiceClient();

  const [{ data: stagesData }, { data: participants }, { data: directies }, { data: riders }] =
    await Promise.all([
      supabase.from('stages').select('id, stage_number').eq('is_complete', true).order('stage_number'),
      supabase.from('participants').select('id, name, directie_id'),
      supabase.from('directie').select('id, name'),
      supabase.from('riders').select('id, name'),
    ]);
  if (!stagesData || !participants) throw new Error('Failed to fetch stages/participants');

  const pointsRows = await fetchAll<PspRow>((from, to) =>
    supabase
      .from('participant_stage_points')
      .select('participant_id, stage_id, stage_points, stage_rank, cumulative_points, overall_rank, overall_rank_change')
      .order('id')
      .range(from, to)
  );
  const contributions = await fetchAll<{ participant_id: string; stage_id: string; rider_id: string; points_contributed: number }>(
    (from, to) =>
      supabase
        .from('participant_rider_contributions')
        .select('participant_id, stage_id, rider_id, points_contributed')
        .order('id')
        .range(from, to)
  );

  const participantById = new Map(participants.map((p) => [p.id, p]));
  const directieNameById = new Map((directies ?? []).map((d) => [d.id, d.name]));
  const riderNameById = new Map((riders ?? []).map((r) => [r.id, r.name]));

  const contributionsByKey = new Map<string, Record<string, number>>();
  for (const c of contributions) {
    const key = `${c.participant_id}|${c.stage_id}`;
    const riderName = riderNameById.get(c.rider_id);
    if (!riderName) continue;
    let entry = contributionsByKey.get(key);
    if (!entry) contributionsByKey.set(key, (entry = {}));
    entry[riderName] = c.points_contributed;
  }

  const rowsByStage = new Map<string, PspRow[]>();
  for (const row of pointsRows) {
    const list = rowsByStage.get(row.stage_id) ?? [];
    list.push(row);
    rowsByStage.set(row.stage_id, list);
  }

  // ---- Participant leaderboard ----------------------------------------------
  const leaderboardByStage: Record<string, LeaderboardEntry[]> = {};
  for (const stage of stagesData) {
    const stageKey = `stage_${stage.stage_number}`;
    const rows = (rowsByStage.get(stage.id) ?? [])
      .slice()
      .sort((a, b) => (a.overall_rank ?? 0) - (b.overall_rank ?? 0));
    leaderboardByStage[stageKey] = rows.map((row) => {
      const participant = participantById.get(row.participant_id);
      return {
        participant_name: participant?.name ?? 'Unknown',
        directie_name: directieNameById.get(participant?.directie_id) || 'Unknown',
        overall_score: row.cumulative_points,
        overall_rank: row.overall_rank || 0,
        overall_rank_change: row.overall_rank_change || 0,
        stage_score: row.stage_points,
        stage_rank: row.stage_rank || 0,
        stage_rider_contributions: contributionsByKey.get(`${row.participant_id}|${stage.id}`) ?? {},
      };
    });
  }

  // ---- Directie leaderboard ---------------------------------------------------
  const directieLeaderboardByStage: Record<string, DirectieLeaderboardEntry[]> = {};
  for (const stage of stagesData) {
    const stageKey = `stage_${stage.stage_number}`;
    const rows = rowsByStage.get(stage.id) ?? [];
    directieLeaderboardByStage[stageKey] = [];

    for (const directie of directies ?? []) {
      const inDirectie = rows.filter(
        (row) => participantById.get(row.participant_id)?.directie_id === directie.id
      );

      const byStagePoints = inDirectie
        .slice()
        .sort((a, b) => b.stage_points - a.stage_points)
        .slice(0, TOP_N_FOR_DIRECTIE);
      const byOverall = inDirectie
        .slice()
        .sort((a, b) => b.cumulative_points - a.cumulative_points)
        .slice(0, TOP_N_FOR_DIRECTIE);

      // Directie score is the AVERAGE of the top-N (sheet semantics, owner
      // ruling July 2026) — divide by the actual contributor count: a
      // directie can have fewer than TOP_N participants.
      const average = (total: number, count: number): number =>
        count === 0 ? 0 : Math.round((total / count) * 10) / 10;

      directieLeaderboardByStage[stageKey].push({
        directie_name: directie.name,
        overall_score: average(
          byOverall.reduce((sum, row) => sum + row.cumulative_points, 0),
          byOverall.length
        ),
        overall_rank: 0,
        overall_rank_change: 0,
        stage_score: average(
          byStagePoints.reduce((sum, row) => sum + row.stage_points, 0),
          byStagePoints.length
        ),
        stage_rank: 0,
        stage_participant_contributions: byStagePoints.map((row) => ({
          participant_name: participantById.get(row.participant_id)?.name ?? 'Unknown',
          stage_score: row.stage_points,
        })),
        overall_participant_contributions: byOverall.map((row) => ({
          participant_name: participantById.get(row.participant_id)?.name ?? 'Unknown',
          overall_score: row.cumulative_points,
        })),
      });
    }

    directieLeaderboardByStage[stageKey].sort((a, b) => b.stage_score - a.stage_score);
    directieLeaderboardByStage[stageKey].forEach((d, idx) => {
      d.stage_rank = idx + 1;
    });
    directieLeaderboardByStage[stageKey].sort((a, b) => b.overall_score - a.overall_score);
    directieLeaderboardByStage[stageKey].forEach((d, idx) => {
      d.overall_rank = idx + 1;
    });

    if (stage.stage_number > 1) {
      const prevStageData = directieLeaderboardByStage[`stage_${stage.stage_number - 1}`];
      if (prevStageData) {
        for (const entry of directieLeaderboardByStage[stageKey]) {
          const prev = prevStageData.find((d) => d.directie_name === entry.directie_name);
          if (prev) entry.overall_rank_change = prev.overall_rank - entry.overall_rank;
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
 */
export async function generateRidersJSON(): Promise<RidersData> {
  const supabase = getServiceClient();

  const [{ data: riders }, { data: completedStages }] = await Promise.all([
    supabase.from('riders').select('id, name, team').eq('is_active', true).order('name'),
    supabase.from('stages').select('id, stage_number, date').eq('is_complete', true).order('stage_number'),
  ]);
  if (!riders || !completedStages) return {};

  interface RspRow {
    rider_id: string;
    stage_id: string;
    stage_finish_points: number;
    yellow_points: number;
    green_points: number;
    polka_dot_points: number;
    white_points: number;
    combativity_points: number;
    total_points: number;
    stage_rank: number | null;
  }
  const [riderPoints, results] = await Promise.all([
    fetchAll<RspRow>((from, to) =>
      supabase
        .from('rider_stage_points')
        .select('rider_id, stage_id, stage_finish_points, yellow_points, green_points, polka_dot_points, white_points, combativity_points, total_points, stage_rank')
        .order('id')
        .range(from, to)
    ),
    fetchAll<{ rider_id: string; stage_id: string; position: number }>((from, to) =>
      supabase.from('stage_results').select('rider_id, stage_id, position').order('id').range(from, to)
    ),
  ]);

  const pointsByKey = new Map(riderPoints.map((row) => [`${row.rider_id}|${row.stage_id}`, row]));
  const positionByKey = new Map(results.map((row) => [`${row.rider_id}|${row.stage_id}`, row.position]));

  const ridersJSON: RidersData = {};
  for (const rider of riders) {
    const stages: Record<string, RiderStageData> = {};
    let totalPoints = 0;
    const stageFinishPositions: number[] = [];

    for (const stage of completedStages) {
      const key = `${rider.id}|${stage.id}`;
      const stageFinishPosition = positionByKey.get(key) || 0;
      if (stageFinishPosition > 0 && stageFinishPosition <= 3) {
        stageFinishPositions.push(stageFinishPosition);
      }

      const points = pointsByKey.get(key);
      if (points) {
        totalPoints += points.total_points;
        stages[`stage_${stage.stage_number}`] = {
          date: stage.date || '',
          stage_finish_points: points.stage_finish_points,
          stage_finish_position: stageFinishPosition,
          stage_rank: points.stage_rank ?? undefined,
          jersey_points: {
            yellow: points.yellow_points,
            green: points.green_points,
            polka_dot: points.polka_dot_points,
            white: points.white_points,
            combative: points.combativity_points,
          },
          stage_total: points.total_points,
          cumulative_total: totalPoints,
        };
      }
    }

    if (totalPoints > 0) {
      ridersJSON[rider.name] = {
        team: rider.team,
        total_points: totalPoints,
        medal_counts: calculateMedalsFromPositions(stageFinishPositions),
        stages,
      };
    }
  }

  Object.entries(ridersJSON)
    .sort(([, a], [, b]) => b.total_points - a.total_points)
    .forEach(([name], index) => {
      ridersJSON[name].overall_rank = index + 1;
    });

  return ridersJSON;
}

/**
 * Generate rider_rankings.json. Accepts an optional precomputed ridersData
 * so a publish builds the riders file once instead of twice.
 */
export async function generateRiderRankingsJSON(
  precomputedRiders?: RidersData
): Promise<RiderRankingsData> {

  const ridersData = precomputedRiders ?? (await generateRidersJSON());

  if (!ridersData || Object.keys(ridersData).length === 0) {
    return {
      stage_rankings: {},
      total_rankings: [],
    };
  }

  const currentStage = await getCurrentStage();
  const currentStageKey = `stage_${currentStage}`;

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
        jersey_points: stageData.jersey_points,
      });
    }
  }
  stageRankings.sort((a, b) => a.stage_rank - b.stage_rank);

  const totalRankings: RiderRankingsTotalEntry[] = Object.entries(ridersData).map(
    ([name, riderData]) => ({
      name,
      team: riderData.team,
      overall_rank: riderData.overall_rank!,
      total_points: riderData.total_points,
      medal_counts: riderData.medal_counts!,
    })
  );
  totalRankings.sort((a, b) => a.overall_rank - b.overall_rank);

  return {
    stage_rankings: {
      [currentStageKey]: stageRankings,
    },
    total_rankings: totalRankings,
  };
}

/**
 * Generate stages_data.json (for the beheer panel)
 */
export async function generateStagesDataJSON(): Promise<StageData[]> {
  const supabase = getServiceClient();

  const [{ data: allStages }, { data: allRiders }, { data: jerseys }, { data: combativity }, { data: dnf }] =
    await Promise.all([
      supabase.from('stages').select('*').order('stage_number'),
      supabase.from('riders').select('id, name'),
      supabase.from('stage_jerseys').select('stage_id, jersey_type, rider_id'),
      supabase.from('stage_combativity').select('stage_id, rider_id'),
      supabase.from('stage_dnf').select('stage_id, status, rider_id'),
    ]);
  if (!allStages) return [];

  const results = await fetchAll<{ stage_id: string; position: number; time_gap: string | null; rider_id: string }>(
    (from, to) =>
      supabase
        .from('stage_results')
        .select('stage_id, position, time_gap, rider_id')
        .order('id')
        .range(from, to)
  );

  const riderMap = new Map(allRiders?.map((r) => [r.id, r.name]) || []);
  const groupBy = <T extends { stage_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.stage_id) ?? [];
      list.push(row);
      map.set(row.stage_id, list);
    }
    return map;
  };
  const resultsByStage = groupBy(results);
  const jerseysByStage = groupBy(jerseys ?? []);
  const dnfByStage = groupBy(dnf ?? []);
  const combativityByStage = new Map((combativity ?? []).map((c) => [c.stage_id, c.rider_id]));

  return allStages.map((stage) => {
    const stageResults = (resultsByStage.get(stage.id) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .slice(0, 20);
    const stageJerseys = jerseysByStage.get(stage.id) ?? [];
    const stageDnf = dnfByStage.get(stage.id) ?? [];

    return {
      stage_number: stage.stage_number,
      date: stage.date,
      distance: stage.distance,
      departure_city: stage.departure_city,
      arrival_city: stage.arrival_city,
      stage_type: stage.stage_type,
      difficulty: stage.difficulty,
      won_how: stage.won_how,
      is_complete: stage.is_complete,
      top_20_finishers: stageResults.map((r) => ({
        position: r.position,
        rider_name: riderMap.get(r.rider_id) || '',
        time_gap: r.time_gap,
      })),
      jerseys: {
        yellow: riderMap.get(stageJerseys.find((j) => j.jersey_type === 'yellow')?.rider_id || '') || '',
        green: riderMap.get(stageJerseys.find((j) => j.jersey_type === 'green')?.rider_id || '') || '',
        polka_dot: riderMap.get(stageJerseys.find((j) => j.jersey_type === 'polka_dot')?.rider_id || '') || '',
        white: riderMap.get(stageJerseys.find((j) => j.jersey_type === 'white')?.rider_id || '') || '',
      },
      combativity: riderMap.get(combativityByStage.get(stage.id) || '') || '',
      dagploeg: stage.dagploeg ?? null,
      dnf_riders: stageDnf.filter((d) => d.status !== 'DNS').map((d) => riderMap.get(d.rider_id) || ''),
      dns_riders: stageDnf.filter((d) => d.status === 'DNS').map((d) => riderMap.get(d.rider_id) || ''),
    };
  });
}

/**
 * Generate team_selections.json (participant team rosters)
 */
export async function generateTeamSelectionsJSON(): Promise<Record<string, TeamSelection>> {

  const { data: participants } = await getServiceClient()
    .from('participants')
    .select(`
      id,
      name,
      directie:directie_id(name),
      participant_rider_selections!inner(
        rider_id,
        position,
        replaced_at_stage,
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
    // Current active roster (WP-A3): main riders that have not been
    // replaced, plus the reserve once activated — a substitution must be
    // visible in the UI (fact 10).
    const riderNames = selections
      .filter((s: any) =>
        s.position <= 10 ? s.replaced_at_stage == null : s.replaced_at_stage != null
      )
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
