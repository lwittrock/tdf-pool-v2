import React, { useState } from 'react';
import Layout from '../components/Layout';
import { Card, CardRow, CardExpandedSection } from '../components/Card';
import { TabButton, SearchInput } from '../components/Button';
import { useMetadata, useRiders } from '../hooks/useTdfData';

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

// Combative Icon Component
interface CombativeIconProps {
  size?: 'sm' | 'md';
  riderNumber?: string | number;
}

const CombativeIcon = ({ size = 'sm', riderNumber }: CombativeIconProps) => {
  const dimensions = size === 'sm' ? 12 : 15;
  const fontSize = size === 'sm' ? 10 : 12;
  
  return (
    <svg 
      width={dimensions} 
      height={dimensions} 
      viewBox="0 0 20 20" 
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
    >
      <rect width="20" height="20" fill="#d32f2fd0" rx="2"/>
      <text
        x="10"
        y="10"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={fontSize}
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        {riderNumber || '#'}
      </text>
    </svg>
  );
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
    combative?: number;
  };
  stage_total: number;
  cumulative_total: number;
}

interface RiderData {
  name: string;
  team: string;
  total_points: number;
  stages: Record<string, RiderStageData>;
}

interface StageRankedRider extends RiderData {
  stage_points: number;
  stage_data: RiderStageData | undefined;
}

interface TotalRankedRider extends RiderData {
  overall_rank: number;
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
    polka?: number;
    white?: number;
    combative?: number;
  };
  stage_total: number;
  cumulative_total: number;
}

type ViewType = 'stage' | 'total' | 'team';

function RidersPage() {
  const [activeView, setActiveView] = useState<ViewType>('total');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRider, setExpandedRider] = useState<string | null>(null);

  // Fetch split data
  const { data: metadata, loading: metadataLoading, error: metadataError } = useMetadata();
  const { data: ridersData, loading: ridersLoading, error: ridersError } = useRiders();

  const loading = metadataLoading || ridersLoading;
  const error = metadataError || ridersError;

  if (loading) {
    return (
      <Layout title="Renner Punten">
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Renner Punten">
        <div className="text-center py-12 text-red-600">Error: {error.message}</div>
      </Layout>
    );
  }

  if (!metadata || !ridersData) return null;

  const currentStageNum = metadata.current_stage;
  const currentStageKey = `stage_${currentStageNum}`;

  // Transform riders data
  const ridersRecord = ridersData as Record<string, {
    team?: string;
    total_points: number;
    stages: Record<string, RiderStageData>;
  }>;

  const ridersArray: RiderData[] = Object.entries(ridersRecord)
    .map(([name, riderData]) => ({
      name,
      team: riderData.team || 'Onbekend Team',
      total_points: riderData.total_points,
      stages: riderData.stages
    }))
    .filter(rider => rider.total_points > 0);

  // Stage rankings
  const stageRankings = ridersArray
    .map(rider => {
      const stageData = rider.stages[currentStageKey];
      return {
        ...rider,
        stage_points: stageData?.stage_total || 0,
        stage_data: stageData
      };
    })
    .filter(rider => rider.stage_points > 0)
    .sort((a, b) => b.stage_points - a.stage_points);

  // Total rankings
  const totalRankings = [...ridersArray]
    .sort((a, b) => b.total_points - a.total_points)
    .map((rider, index) => ({
      ...rider,
      overall_rank: index + 1
    }));

  // Filter based on search
  const searchLower = searchTerm.toLowerCase().trim();
  const dataToFilter = activeView === 'stage' ? stageRankings : totalRankings;
  const filteredResults = !searchLower 
    ? dataToFilter
    : dataToFilter.filter(rider => 
        rider.name.toLowerCase().includes(searchLower) ||
        rider.team.toLowerCase().includes(searchLower)
      );

  // Helper functions
  const renderMedal = (position: number) => {
    if (position === 1) return '🥇';
    if (position === 2) return '🥈';
    if (position === 3) return '🥉';
    return '';
  };

  const getRiderMedals = (riderName: string) => {
    let goldCount = 0, silverCount = 0, bronzeCount = 0;
    const riderStages = ridersRecord[riderName]?.stages || {};

    Object.values(riderStages).forEach(stageData => {
      const pos = stageData.stage_finish_position;
      if (pos === 1) goldCount++;
      else if (pos === 2) silverCount++;
      else if (pos === 3) bronzeCount++;
    });

    const medals = [];
    if (goldCount > 0) medals.push('🥇'.repeat(goldCount));
    if (silverCount > 0) medals.push('🥈'.repeat(silverCount));
    if (bronzeCount > 0) medals.push('🥉'.repeat(bronzeCount));
    return medals.join('');
  };

  const getStageAwards = (stageData: RiderStageData | undefined) => {
    if (!stageData?.jersey_points) return { jerseys: [], hasCombative: false };
    
    const jerseys = [];
    if (stageData.jersey_points.yellow) jerseys.push('yellow');
    if (stageData.jersey_points.green) jerseys.push('green');
    if (stageData.jersey_points.polka_dot) jerseys.push('polka_dot');
    if (stageData.jersey_points.white) jerseys.push('white');
    
    const hasCombative = !!stageData.jersey_points.combative;
    
    return { jerseys, hasCombative };
  };

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

  return (
    <Layout title="Renner Punten">
      <main>
        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-4">
          <TabButton onClick={() => setActiveView('stage')} active={activeView === 'stage'}>
            Etappe
          </TabButton>
          <TabButton onClick={() => setActiveView('total')} active={activeView === 'total'}>
            Renner
          </TabButton>
          <TabButton onClick={() => setActiveView('team')} active={activeView === 'team'}>
            Team
          </TabButton>
        </div>

        {/* Search */}
        <div className="mb-6">
          <SearchInput 
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Zoek renner of team..."
          />
        </div>

        {/* STAGE VIEW */}
        {activeView === 'stage' && (
          <>
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">
              Etappe {currentStageNum} Punten
            </h2>

            {/* Mobile Card View */}
            <div className="block lg:hidden space-y-2">
              {(filteredResults as StageRankedRider[]).map((rider) => {
                const finishPos = rider.stage_data?.stage_finish_position || 0;
                const medal = renderMedal(finishPos);
                const { jerseys, hasCombative } = getStageAwards(rider.stage_data);

                return (
                  <Card key={rider.name}>
                    <CardRow
                      left={
                        <>
                          <div className="text-lg font-bold text-tdf-text-primary">
                             {finishPos > 0 ? `#${finishPos}` : '-'}
                          </div>
                          {medal && <div className="text-xl leading-none">{medal}</div>}
                        </>
                      }
                      middle={
                        <>
                          <div className="flex items-center gap-2">
                            <div className="font-bold text-sm text-tdf-text-primary truncate">
                              {rider.name}
                            </div>
                            {(jerseys.length > 0 || hasCombative) && (
                              <div className="flex gap-1 items-center">
                                {jerseys.map(jersey => (
                                  <img 
                                    key={jersey}
                                    src={jerseyIcons[jersey]}
                                    alt={`${jersey} jersey`}
                                    className="w-4 h-4"
                                  />
                                ))}
                                {hasCombative && <CombativeIcon size="sm" />}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-tdf-text-secondary truncate">
                            {rider.team}
                          </div>
                        </>
                      }
                      right={
                        <>
                          <div className="text-lg font-bold text-tdf-score">{rider.stage_points}</div>
                        </>
                      }
                    />
                  </Card>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-table-header">
                    <th className="px-4 py-4 text-left text-sm font-semibold text-tdf-text-highlight">Uitslag</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-tdf-text-highlight">Renner</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-tdf-text-highlight">Team</th>
                    <th className="px-4 py-4 text-right text-sm font-semibold text-tdf-text-highlight">Punten</th>
                  </tr>
                </thead>
                <tbody>
                  {(filteredResults as StageRankedRider[]).map((rider, idx) => {
                    const { jerseys, hasCombative } = getStageAwards(rider.stage_data);
                    const finishPos = rider.stage_data?.stage_finish_position || 0;
                    const medal = renderMedal(finishPos);
                    
                    return (
                      <tr
                        key={rider.name}
                        className={idx % 2 === 0 ? 'bg-white' : 'bg-tdf-bg'}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-tdf-text-primary">
                          {finishPos > 0 ? finishPos : '-'} {medal}
                        </td>
                        <td className="px-4 py-3 text-sm text-tdf-text-primary">
                          <div className="flex items-center gap-2">
                            <span>{rider.name}</span>
                            {(jerseys.length > 0 || hasCombative) && (
                              <div className="flex gap-1 flex-shrink-0 items-center">
                                {jerseys.map(jersey => (
                                  <img 
                                    key={jersey}
                                    src={jerseyIcons[jersey]}
                                    alt={`${jersey} jersey`}
                                    className="w-5 h-5"
                                  />
                                ))}
                                {hasCombative && <CombativeIcon size="md" />}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-tdf-text-secondary">{rider.team}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-tdf-text-primary">
                          {rider.stage_points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* TOTAL VIEW */}
        {activeView === 'total' && (
          <>
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">
              Totaal Punten
            </h2>
            
            {/* Mobile Card View */}
            <div className="block lg:hidden space-y-2">
              {(filteredResults as TotalRankedRider[]).map((rider) => {
                const medals = getRiderMedals(rider.name);

                return (
                  <Card key={rider.name}>
                    <div onClick={() => setExpandedRider(
                      expandedRider === rider.name ? null : rider.name
                    )}>
                      <CardRow
                        left={
                          <>
                            <div className="text-lg font-bold text-tdf-text-primary">#{rider.overall_rank}</div>
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
                            <div className="text-lg font-bold text-tdf-score">{rider.total_points}</div>
                            {medals && <div className="text-sm leading-none mt-0.5">{medals}</div>}
                          </>
                        }
                      />
                    </div>

                    <CardExpandedSection 
                      title="Punten per Etappe"
                      isExpanded={expandedRider === rider.name}
                    >
                      {getRiderStages(rider.name).map((stage) => {
                        const { jerseys, hasCombative } = getStageAwards(stage);
                        return (
                          <div key={stage.stageKey} className="flex justify-between items-center py-1 px-2 rounded hover:bg-table-header">
                            <div className="flex items-center">
                              <span className="text-sm text-tdf-text-highlight w-20">
                                Etappe {stage.stageNum}: 
                              </span>
                              
                              <span className="text-xs text-tdf-text-secondary w-10">
                                {stage.stage_finish_position > 0 ? `# ${stage.stage_finish_position}` : ''}
                              </span>

                              {(jerseys.length > 0 || hasCombative) && (
                                <div className="flex gap-1 items-center">
                                  {jerseys.map(jersey => (
                                    <img 
                                      key={jersey}
                                      src={jerseyIcons[jersey]}
                                      alt={`${jersey} jersey`}
                                      className="w-4 h-4"
                                    />
                                  ))}
                                  {hasCombative && <CombativeIcon size="sm" />}
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
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-table-header">
                    <th className="px-4 py-4 text-left text-sm font-semibold text-tdf-text-highlight">Positie</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-tdf-text-highlight">Renner</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-tdf-text-highlight">Team</th>
                    <th className="px-4 py-4 text-right text-sm font-semibold text-tdf-text-highlight">Totaal Punten</th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-tdf-text-highlight">Etappe Medailles</th>
                  </tr>
                </thead>
                <tbody>
                  {(filteredResults as TotalRankedRider[]).map((rider, idx) => {
                    const medals = getRiderMedals(rider.name);
                    
                    return (
                      <React.Fragment key={rider.name}>
                        <tr
                          className={`cursor-pointer hover:bg-gray-100 ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-tdf-bg'
                          }`}
                          onClick={() => setExpandedRider(
                            expandedRider === rider.name ? null : rider.name
                          )}
                        >
                          <td className="px-4 py-3 text-sm font-medium text-tdf-text-primary">
                            {rider.overall_rank}
                          </td>
                          <td className="px-4 py-3 text-sm text-tdf-text-primary">{rider.name}</td>
                          <td className="px-4 py-3 text-sm text-tdf-text-secondary">{rider.team}</td>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-tdf-text-primary">
                            {rider.total_points}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">{medals || '—'}</td>
                        </tr>
                        {expandedRider === rider.name && (
                          <tr className="bg-gray-100">
                            <td colSpan={5} className="px-4 py-4">
                              <div className="ml-8 max-w-md">
                                <h3 className="text-sm font-semibold mb-2 pb-2 text-tdf-text-highlight border-b">Punten per Etappe</h3>
                                <div className="space-y-1">
                                  {getRiderStages(rider.name).map((stage) => {
                                    const { jerseys, hasCombative } = getStageAwards(stage);

                                    return (
                                      <div key={stage.stageKey} className="flex justify-between items-center py-1 px-2 rounded hover:bg-table-header">
                                        <div className="flex items-center">
                                          <span className="text-sm text-tdf-text-highlight w-24">
                                            Etappe {stage.stageNum}: 
                                          </span>
                                          
                                          <span className="text-xs text-tdf-text-secondary w-16">
                                            {stage.stage_finish_position > 0 ? `# ${stage.stage_finish_position}` : ''}
                                          </span>

                                          {(jerseys.length > 0 || hasCombative) && (
                                            <div className="flex gap-1 items-center">
                                              {jerseys.map(jersey => (
                                                <img 
                                                  key={jersey}
                                                  src={jerseyIcons[jersey]}
                                                  alt={`${jersey} jersey`}
                                                  className="w-4 h-4"
                                                />
                                              ))}
                                              {hasCombative && <CombativeIcon size="sm" />}
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
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* TEAM VIEW - Placeholder */}
        {activeView === 'team' && (
          <div className="text-center py-12 text-tdf-text-secondary">
            Team klassement - Coming soon
          </div>
        )}

        {filteredResults.length === 0 && (
          <div className="text-center py-12 text-tdf-text-secondary">
            Geen renners gevonden
          </div>
        )}
      </main>
    </Layout>
  );
}

export default RidersPage;