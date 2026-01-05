import { useState } from 'react';
import Layout from '../components/Layout';
import { Card, CardRow, CardExpandedSection } from '../components/Card';
import { SearchInput } from '../components/Button';
import { useTdfData } from '../hooks/useTdfData';

// Jersey icons
const yellowIcon = '/assets/jersey_yellow.svg';
const greenIcon = '/assets/jersey_green.svg';
const polkaDotIcon = '/assets/jersey_polka_dot.svg';
const whiteIcon = '/assets/jersey_white.svg';

const jerseyIcons: Record<string, string> = {
  yellow: yellowIcon,
  green: greenIcon,
  polka_dot: polkaDotIcon,
  white: whiteIcon
};

interface RiderStageData {
  date: string;
  stage_finish_points: number;
  stage_finish_position: number;
  jersey_points?: {
    yellow?: number;
    green?: number;
    polka_dot?: number;
    white?: number;
  };
  stage_total: number;
  cumulative_total: number;
}

interface RiderDataFromJson {
  team?: string;
  total_points: number;
  stages: Record<string, RiderStageData>;
}

interface LeaderboardEntry {
  participant_name: string;
  directie_name: string;
  stage_rider_contributions: Record<string, number | undefined | null>;
}

interface StageInfo {
  stageNum: number;
  stageKey: string;
  date: string;
  stage_finish_points: number;
  stage_finish_position: number;
  jersey_points?: {
    yellow?: number;
    green?: number;
    polka_dot?: number;
    white?: number;
  };
  stage_total: number;
  cumulative_total: number;
}

function TeamSelectionsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRider, setExpandedRider] = useState<string | null>(null);

  const { data: tdfData, loading, error } = useTdfData();

  if (loading) {
    return (
      <Layout title="Team Selecties">
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Team Selecties">
        <div className="text-center py-12 text-red-600">Error: {error.message}</div>
      </Layout>
    );
  }

  if (!tdfData) return null;

  const data = tdfData;

  // Count total participants
  const allStages = data.leaderboard_by_stage as Record<string, LeaderboardEntry[]>;
  const firstStage = Object.values(allStages)[0] || [];
  const totalParticipants = firstStage.length;

  // Calculate rider selection counts
  const riderSelectionCounts: Record<string, number> = {};
  firstStage.forEach(participant => {
    const contributions = participant.stage_rider_contributions;
    Object.keys(contributions).forEach(riderName => {
      riderSelectionCounts[riderName] = (riderSelectionCounts[riderName] || 0) + 1;
    });
  });

  // Get selected participant's team
  const searchLower = searchTerm.toLowerCase().trim();
  let selectedParticipant = null;
  
  if (searchLower) {
    const participant = firstStage.find(p => 
      p.participant_name.toLowerCase().includes(searchLower) ||
      p.directie_name.toLowerCase().includes(searchLower)
    );
    
    if (participant) {
      const team = Object.keys(participant.stage_rider_contributions);
      selectedParticipant = {
        name: participant.participant_name,
        team: team
      };
    }
  }

  // Calculate overall rankings for riders
  const ridersRecord = data.riders as Record<string, RiderDataFromJson>;
  const rankedRiders = Object.entries(ridersRecord)
    .map(([name, rider]) => ({ name, total_points: rider.total_points }))
    .sort((a, b) => b.total_points - a.total_points);
  
  const riderOverallRanks: Record<string, number> = {};
  rankedRiders.forEach((rider, index) => {
    riderOverallRanks[rider.name] = index + 1;
  });

  // Popularity view: all riders sorted by selection count
  const popularityRankings = Object.entries(ridersRecord)
    .map(([name, riderData]) => ({
      name,
      team: riderData.team || 'Onbekend Team',
      total_points: riderData.total_points,
      stages: riderData.stages,
      selection_count: riderSelectionCounts[name] || 0,
      selection_percentage: totalParticipants > 0 
        ? Math.round((riderSelectionCounts[name] || 0) / totalParticipants * 100)
        : 0
    }))
    .filter(rider => rider.selection_count > 0)
    .sort((a, b) => b.selection_count - a.selection_count);

  // Participant view: selected team sorted by popularity
  const participantTeamRankings = !selectedParticipant ? [] : selectedParticipant.team
    .map(riderName => ({
      name: riderName,
      team: ridersRecord[riderName]?.team || 'Onbekend Team',
      total_points: ridersRecord[riderName]?.total_points || 0,
      stages: ridersRecord[riderName]?.stages || {},
      selection_count: riderSelectionCounts[riderName] || 0,
      selection_percentage: totalParticipants > 0 
        ? Math.round((riderSelectionCounts[riderName] || 0) / totalParticipants * 100)
        : 0
    }))
    .sort((a, b) => b.selection_count - a.selection_count);

  // Helper functions
  const getRiderStages = (riderName: string): StageInfo[] => {
    const rider = ridersRecord[riderName];
    if (!rider) return [];

    return Object.entries(rider.stages)
      .map(([stageKey, stageData]) => ({
        stageNum: parseInt(stageKey.replace('stage_', '')),
        stageKey,
        ...stageData
      }))
      .sort((a, b) => a.stageNum - b.stageNum);
  };

  const getStageJerseys = (stageData: RiderStageData | undefined) => {
    if (!stageData?.jersey_points) return [];
    
    const jerseys = [];
    if (stageData.jersey_points.yellow) jerseys.push('yellow');
    if (stageData.jersey_points.green) jerseys.push('green');
    if (stageData.jersey_points.polka_dot) jerseys.push('polka_dot');
    if (stageData.jersey_points.white) jerseys.push('white');
    
    return jerseys;
  };

  const isTop10 = (riderName: string) => {
    const rank = riderOverallRanks[riderName];
    return rank !== undefined && rank <= 10;
  };

  const displayData = selectedParticipant ? participantTeamRankings : popularityRankings;

  return (
    <Layout title="Team Selecties">
      <main>
        {/* Search */}
        <div className="mb-6">
          <SearchInput 
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Toon team van deelnemer..."
          />
        </div>

        {/* Header */}
        <>
          {selectedParticipant ? (
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">
              Team van {selectedParticipant.name}
            </h2>
          ) : (
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">
              Renner Populariteit
            </h2>
          )}
          <p className="text-xs sm:text-sm mb-4 sm:mb-6 text-gray-600">
            Alleen actieve renners worden meegeteld (dus maximaal 10 per deelnemer).
          </p>
        </>

        {/* Mobile Card View */}
        <div className="block lg:hidden space-y-2">
          {displayData.map((rider) => (
            <Card key={rider.name}>
              <div onClick={() => setExpandedRider(
                expandedRider === rider.name ? null : rider.name
              )}>
                <CardRow
                  left={
                    <>
                      <div className="flex flex-col items-center min-w-[50px]">
                        <div className="text-lg font-bold text-tdf-text-primary">
                          {rider.selection_percentage}%
                        </div>
                        <div className="text-xs text-tdf-text-secondary">
                          {rider.selection_count}/{totalParticipants}
                        </div>
                      </div>
                    </>
                  }
                  middle={
                    <>
                      <div className="font-bold text-sm text-tdf-text-primary truncate">
                        {rider.name}
                      </div>
                      <div className="text-xs text-tdf-text-secondary truncate">
                        {rider.team}
                      </div>
                    </>
                  }
                  right={
                    <>
                      <div className="flex items-center gap-2">                        
                        <div className="text-xl w-6 flex items-center justify-center">
                          {isTop10(rider.name) && (
                            <span className="leading-none">
                              {rider.selection_percentage >= 50 ? '⭐' : '💎'}
                            </span>
                          )}
                        </div>
                        <div className="text-lg font-bold text-tdf-score w-8 text-right">
                          {rider.total_points}
                        </div>
                      </div>
                    </>
                  }
                />
              </div>

              <CardExpandedSection 
                title="Punten per Etappe"
                isExpanded={expandedRider === rider.name}
              >
                {getRiderStages(rider.name).map((stage) => {
                  const stageJerseys = getStageJerseys(stage);
                  return (
                    <div key={stage.stageKey} className="flex justify-between items-center py-1 px-2 rounded hover:bg-table-header">
                      <div className="flex items-center">
                        <span className="text-sm text-tdf-text-highlight w-20">
                          Etappe {stage.stageNum}: 
                        </span>
                        
                        <span className="text-xs text-tdf-text-secondary w-10">
                          {stage.stage_finish_position > 0 ? `# ${stage.stage_finish_position}` : ''}
                        </span>

                        {stageJerseys.length > 0 && (
                          <div className="flex gap-1 items-center">
                            {stageJerseys.map(jersey => (
                              <img 
                                key={jersey}
                                src={jerseyIcons[jersey]}
                                alt={`${jersey} jersey`}
                                className="w-4 h-4"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold">{stage.stage_total}</span>
                      </div>
                    </div>
                  );
                })}
              </CardExpandedSection>
            </Card>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header">
                <th className="px-4 py-4 text-center text-sm font-semibold text-tdf-text-highlight">Geselecteerd</th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-tdf-text-highlight">Renner</th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-tdf-text-highlight">Team</th>
                <th className="px-4 py-4 text-right text-sm font-semibold text-tdf-text-highlight">Totaal Punten</th>
              </tr>
            </thead>
            <tbody>
              {displayData.map((rider, idx) => (
                <>
                  <tr
                    key={rider.name}
                    className={`cursor-pointer hover:bg-gray-100 ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-tdf-bg'
                    }`}
                    onClick={() => setExpandedRider(
                      expandedRider === rider.name ? null : rider.name
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-center">
                        <div className="text-sm font-bold text-tdf-text-primary">
                          {rider.selection_percentage}%
                        </div>
                        <div className="text-xs text-tdf-text-secondary">
                          {rider.selection_count}/{totalParticipants}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-tdf-text-primary">{rider.name}</td>
                    <td className="px-4 py-3 text-sm text-tdf-text-secondary">{rider.team}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="text-lg w-6 flex items-center justify-center"> 
                          {isTop10(rider.name) && (
                            <span className="leading-none">
                              {rider.selection_percentage >= 50 ? '⭐' : '💎'}
                            </span>
                          )}
                        </div>                        
                        <div className="w-12 text-right"> 
                          <span className="font-semibold text-tdf-text-primary">
                            {rider.total_points}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {expandedRider === rider.name && (
                    <tr className="bg-gray-100">
                      <td colSpan={4} className="px-4 py-4">
                        <div className="ml-8 max-w-md">
                          <h3 className="text-sm font-semibold mb-2 pb-2 text-tdf-text-highlight border-b">Punten per Etappe</h3>
                          <div className="space-y-1">
                            {getRiderStages(rider.name).map((stage) => {
                              const stageJerseys = getStageJerseys(stage);
                              return (
                                <div key={stage.stageKey} className="flex justify-between items-center py-1 px-2 rounded hover:bg-table-header">
                                  <div className="flex items-center">
                                    <span className="text-sm text-tdf-text-highlight w-24">
                                      Etappe {stage.stageNum}: 
                                    </span>
                                    
                                    <span className="text-xs text-tdf-text-secondary w-16">
                                      {stage.stage_finish_position > 0 ? `# ${stage.stage_finish_position}` : ''}
                                    </span>

                                    {stageJerseys.length > 0 && (
                                      <div className="flex gap-1 items-center">
                                        {stageJerseys.map(jersey => (
                                          <img 
                                            key={jersey}
                                            src={jerseyIcons[jersey]}
                                            alt={`${jersey} jersey`}
                                            className="w-4 h-4"
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-bold">{stage.stage_total}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {displayData.length === 0 && (
          <div className="text-center py-12 text-tdf-text-secondary">
            {selectedParticipant ? 'Geen team gevonden voor deze deelnemer' : 'Geen renners gevonden'}
          </div>
        )}
      </main>
    </Layout>
  );
}

export default TeamSelectionsPage;