/**
 * RennerPunten Page
 */

import React, { useState, useMemo } from 'react';
import { useMetadata, useRiders, useRiderRankings } from '../hooks/useTdfData';
import { getRiderStagesFromData } from '../../lib/data-transforms';
import { JERSEY_ICONS } from '../../lib/constants';
import { MEDALS } from '../../lib/scoring-constants';
import type { RidersData, RiderData, RiderStageData, StageInfo } from '../../lib/types';

// Combative Icon Component
interface CombativeIconProps {
  size?: 'sm' | 'md';
}

const CombativeIcon = ({ size = 'sm' }: CombativeIconProps) => {
  const dimensions = size === 'sm' ? 12 : 16;
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
        #
      </text>
    </svg>
  );
};

type ViewType = 'stage' | 'total' | 'team';

function RennerPunten() {
  const [activeView, setActiveView] = useState<ViewType>('total');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRider, setExpandedRider] = useState<string | null>(null);

  // Fetch data
  const { data: metadata, isLoading: metadataLoading, error: metadataError } = useMetadata();
  const { data: ridersData, isLoading: ridersLoading, error: ridersError } = useRiders();
  const { data: riderRankings, isLoading: rankingsLoading, error: rankingsError } = useRiderRankings();

  const loading = metadataLoading || ridersLoading || rankingsLoading;
  const error = metadataError || ridersError || rankingsError;

  // ========================================================================
  // OPTIMIZED: Use pre-calculated rankings from rider_rankings.json
  // ========================================================================
  
  const currentStageKey = useMemo(() => {
    return metadata ? `stage_${metadata.current_stage}` : 'stage_1';
  }, [metadata]);

  // Stage rankings - directly from rider_rankings.json (already sorted!)
  const stageRankings = useMemo(() => {
    if (!riderRankings?.stage_rankings) return [];
    return riderRankings.stage_rankings[currentStageKey] || [];
  }, [riderRankings, currentStageKey]);

  // Total rankings - directly from rider_rankings.json (already sorted!)
  const totalRankings = useMemo(() => {
    return riderRankings?.total_rankings || [];
  }, [riderRankings]);

  // Filter based on search
  const filteredResults = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();
    const dataToFilter = activeView === 'stage' ? stageRankings : totalRankings;
    
    if (!searchLower) return dataToFilter;
    
    return dataToFilter.filter(rider => 
      rider.name.toLowerCase().includes(searchLower) ||
      rider.team.toLowerCase().includes(searchLower)
    );
  }, [activeView, searchTerm, stageRankings, totalRankings]);

  // Helper functions
  const renderMedal = (position: number) => {
    if (position === 1) return MEDALS.GOLD;
    if (position === 2) return MEDALS.SILVER;
    if (position === 3) return MEDALS.BRONZE;
    return '';
  };

  // Helper function for getting jerseys from stage data
  const getStageJerseys = (stageData: RiderStageData | StageInfo | undefined): { 
    jerseys: Array<'yellow' | 'green' | 'polka_dot' | 'white'>; 
    hasCombative: boolean 
  } => {
    if (!stageData?.jersey_points) return { jerseys: [], hasCombative: false };
    
    const jerseys: Array<'yellow' | 'green' | 'polka_dot' | 'white'> = [];
    if ((stageData.jersey_points.yellow ?? 0) > 0) jerseys.push('yellow');
    if ((stageData.jersey_points.green ?? 0) > 0) jerseys.push('green');
    if ((stageData.jersey_points.polka_dot ?? 0) > 0) jerseys.push('polka_dot');
    if ((stageData.jersey_points.white ?? 0) > 0) jerseys.push('white');
    
    return {
      jerseys,
      hasCombative: (stageData.jersey_points.combative ?? 0) > 0
    };
  };

  // Get full rider data for expanded view
  const getRiderData = (riderName: string): RiderData | undefined => {
    if (!ridersData) return undefined;
    return (ridersData as RidersData)[riderName];
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-tdf-bg">
        <div className="text-center">
          <div className="text-2xl font-bold text-tdf-primary mb-4">Loading...</div>
          <div className="text-tdf-text-secondary">Fetching rider data...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-tdf-bg">
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600 mb-4">Error</div>
          <div className="text-tdf-text-secondary mb-4">{error.message}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-tdf-accent text-white rounded hover:bg-yellow-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!metadata || !ridersData || !riderRankings) return null;

  return (
    <div className="min-h-screen py-4 px-4 sm:px-6 lg:px-32 bg-tdf-bg">
      {/* Header */}
      <header className="mb-6 sm:mb-12 text-center">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-tdf-primary">
          Renner Punten
        </h1>
      </header>

      {/* View Toggle Buttons */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView('total')}
            className={`flex-1 py-3 px-2 rounded-lg font-semibold transition-all text-xs sm:text-sm lg:text-base ${
              activeView === 'total'
                ? 'bg-tdf-accent text-white border-2 border-yellow-500'
                : 'bg-gray-200 text-gray-700 border-2 border-transparent'
            }`}
          >
            Algemeen
          </button>
          <button
            onClick={() => setActiveView('stage')}
            className={`flex-1 py-3 px-2 rounded-lg font-semibold transition-all text-xs sm:text-sm lg:text-base ${
              activeView === 'stage'
                ? 'bg-tdf-accent text-white border-2 border-yellow-500'
                : 'bg-gray-200 text-gray-700 border-2 border-transparent'
            }`}
          >
            Etappe
          </button>
          <button
            onClick={() => setActiveView('team')}
            className={`flex-1 py-3 px-2 rounded-lg font-semibold transition-all text-xs sm:text-sm lg:text-base ${
              activeView === 'team'
                ? 'bg-tdf-accent text-white border-2 border-yellow-500'
                : 'bg-gray-200 text-gray-700 border-2 border-transparent'
            }`}
          >
            Team
          </button>
        </div>

        {/* Search */}
        <div className="w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Zoek renner of team..."
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 focus:border-tdf-accent focus:outline-none text-sm sm:text-base"
          />
        </div>
      </div>

      {/* ETAPPE VIEW */}
      {activeView === 'stage' && (
        <main>
          <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">
            Etappe {metadata.current_stage} Klassement
          </h2>
          
          {/* Mobile Cards */}
          <div className="block lg:hidden space-y-2">
            {filteredResults.map((rider: any) => {
              const { jerseys, hasCombative } = getStageJerseys(rider);
              
              return (
                <div key={rider.name} className="bg-white rounded-lg shadow-md p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center justify-center min-w-[50px]">
                      <div className="text-lg font-bold text-tdf-text-primary">#{rider.stage_rank}</div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-sm text-tdf-text-primary truncate">{rider.name}</div>
                        {(jerseys.length > 0 || hasCombative) && (
                          <div className="flex gap-0.5 items-center">
                            {jerseys.map(jersey => (
                              <img 
                                key={jersey}
                                src={JERSEY_ICONS[jersey]}
                                alt={`${jersey} jersey`}
                                className="w-4 h-4"
                              />
                            ))}
                            {hasCombative && <CombativeIcon size="md" />}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-tdf-text-secondary truncate">{rider.team}</div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-lg font-bold text-tdf-primary">{rider.stage_points}</div>
                      <div className="text-xs text-tdf-text-secondary">
                        {rider.stage_finish_position > 0 && `#${rider.stage_finish_position} ${renderMedal(rider.stage_finish_position)}`}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-200">
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Positie</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Renner</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Team</th>
                  <th className="px-4 py-4 text-right text-sm font-semibold text-gray-600">Totaal Punten</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((rider: any, idx: number) => {
                  const { jerseys, hasCombative } = getStageJerseys(rider);
                  
                  return (
                    <tr
                      key={rider.name}
                      className={`${idx % 2 === 0 ? 'bg-white' : 'bg-tdf-bg'}`}
                    >
                      <td className="px-4 py-3 text-sm font-medium">{rider.stage_rank}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span>{rider.name}</span>
                          {rider.stage_finish_position > 0 && (
                            <span className="text-xs text-gray-500">
                              (#{rider.stage_finish_position} {renderMedal(rider.stage_finish_position)})
                            </span>
                          )}
                          {(jerseys.length > 0 || hasCombative) && (
                            <div className="flex gap-1 items-center ml-2">
                              {jerseys.map(jersey => (
                                <img 
                                  key={jersey}
                                  src={JERSEY_ICONS[jersey]}
                                  alt={`${jersey} jersey`}
                                  className="w-5 h-5"
                                />
                              ))}
                              {hasCombative && <CombativeIcon size="md" />}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{rider.team}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">
                        {rider.stage_points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* TOTAAL VIEW */}
      {activeView === 'total' && (
        <main>
          <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">
            Algemeen Klassement
          </h2>
          
          {/* Mobile Cards */}
          <div className="block lg:hidden space-y-2">
            {filteredResults.map((rider: any) => {
              const riderData = getRiderData(rider.name);

              return (
                <div key={rider.name} className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div 
                    onClick={() => setExpandedRider(expandedRider === rider.name ? null : rider.name)}
                    className="p-3 cursor-pointer active:bg-tdf-bg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center justify-center min-w-[50px]">
                        <div className="text-lg font-bold text-tdf-text-primary">#{rider.overall_rank}</div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-tdf-text-primary truncate">{rider.name}</div>
                        <div className="text-xs text-tdf-text-secondary truncate">{rider.team}</div>
                      </div>
                      
                      <div className="text-right">
                        <div className="text-lg font-bold text-tdf-primary">{rider.total_points}</div>
                        {rider.medal_counts?.display && (
                          <div className="text-sm leading-none mt-0.5">{rider.medal_counts.display}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {expandedRider === rider.name && riderData && (
                    <div className="px-3 pb-3 bg-tdf-bg border-t border-gray-200">
                      <div className="pt-3">
                        <h3 className="text-xs font-semibold mb-2 text-gray-600">Punten per Etappe</h3>
                        {getRiderStagesFromData(riderData).map((stage) => {
                          const stageAwards = getStageJerseys(stage);
                          return (
                            <div key={stage.stageKey} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-700">Etappe {stage.stageNum}:</span>
                                {(stageAwards.jerseys.length > 0 || stageAwards.hasCombative) && (
                                  <div className="flex gap-0.5 items-center">
                                    {stageAwards.jerseys.map(jersey => (
                                      <img 
                                        key={jersey}
                                        src={JERSEY_ICONS[jersey]}
                                        alt={`${jersey} jersey`}
                                        className="w-3 h-3"
                                      />
                                    ))}
                                    {stageAwards.hasCombative && <CombativeIcon size="sm" />}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-tdf-text-secondary">#{stage.stage_finish_position}</span>
                                <span className="text-sm font-bold text-tdf-text-primary">{stage.stage_total}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-200">
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Positie</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Renner</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Team</th>
                  <th className="px-4 py-4 text-right text-sm font-semibold text-gray-600">Totaal Punten</th>
                  <th className="px-4 py-4 text-center text-sm font-semibold text-gray-600">Etappe Medailles</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((rider: any, idx: number) => {
                  const riderData = getRiderData(rider.name);

                  return (
                    <React.Fragment key={rider.name}>
                      <tr
                        className={`cursor-pointer hover:bg-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-tdf-bg'}`}
                        onClick={() => setExpandedRider(expandedRider === rider.name ? null : rider.name)}
                      >
                        <td className="px-4 py-3 text-sm font-medium">{rider.overall_rank}</td>
                        <td className="px-4 py-3 text-sm">{rider.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{rider.team}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">{rider.total_points}</td>
                        <td className="px-4 py-3 text-sm text-center">{rider.medal_counts?.display || '—'}</td>
                      </tr>
                      {expandedRider === rider.name && riderData && (
                        <tr className="bg-gray-100">
                          <td colSpan={5} className="px-4 py-4">
                            <div className="ml-8 max-w-md">
                              <h3 className="text-sm font-semibold mb-2 pb-2 text-gray-600 border-b">Punten per Etappe</h3>
                              {getRiderStagesFromData(riderData).map((stage) => {
                                const stageAwards = getStageJerseys(stage);
                                return (
                                  <div key={stage.stageKey} className="flex justify-between py-1 px-2 rounded hover:bg-gray-200">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-600">Etappe {stage.stageNum}:</span>
                                      {(stageAwards.jerseys.length > 0 || stageAwards.hasCombative) && (
                                        <div className="flex gap-1 items-center">
                                          {stageAwards.jerseys.map(jersey => (
                                            <img 
                                              key={jersey}
                                              src={JERSEY_ICONS[jersey]}
                                              alt={`${jersey} jersey`}
                                              className="w-4 h-4"
                                            />
                                          ))}
                                          {stageAwards.hasCombative && <CombativeIcon size="sm" />}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-xs text-tdf-text-secondary">#{stage.stage_finish_position}</span>
                                      <span className="text-sm font-bold">{stage.stage_total}</span>
                                    </div>
                                  </div>
                                );
                              })}
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
        </main>
      )}

      {/* TEAM VIEW */}
      {activeView === 'team' && (
        <main>
          <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">
            Team Klassement
          </h2>
          
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <p className="text-gray-600">Team klassement komt binnenkort beschikbaar.</p>
          </div>
        </main>
      )}
    </div>
  );
}

export default RennerPunten;