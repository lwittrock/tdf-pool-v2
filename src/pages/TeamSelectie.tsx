/**
 * TeamSelectie Page (Optimized)
 * 
 * Optimizations:
 * - Uses shared types from lib/types.ts
 * - Uses utility functions from lib/data-transforms.ts
 * - Uses constants from lib/constants.ts
 * - Removed duplicate type definitions
 * - Removed duplicate helper functions
 * - Proper memoization
 * - Type-safe throughout
 */

import React, { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { Card, CardRow, CardExpandedSection } from '../components/Card';
import { SearchInput } from '../components/Button';
import { useRiders, useTeamSelections } from '../hooks/useTdfData';
import { 
  getRiderStages, 
  calculateSelectionCounts,
  calculateSelectionPercentage,
  matchesSearch,
  createRiderRankMap
} from '../../lib/data-transforms';
import { JERSEY_ICONS } from '../../lib/constants';
import type { RidersData, RiderStageData, StageInfo } from '../../lib/types';

function TeamSelectionsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRider, setExpandedRider] = useState<string | null>(null);

  // Fetch data
  const { data: ridersData, isLoading: ridersLoading, error: ridersError } = useRiders();
  const { data: teamSelectionsData, isLoading: selectionsLoading, error: selectionsError } = useTeamSelections();

  const loading = ridersLoading || selectionsLoading;
  const error = ridersError || selectionsError;

  // Memoized calculations
  const totalParticipants = useMemo(() => {
    return teamSelectionsData ? Object.keys(teamSelectionsData).length : 0;
  }, [teamSelectionsData]);

  // Calculate rider selection counts using shared utility
  const riderSelectionCounts = useMemo(() => {
    if (!teamSelectionsData) return {};
    return calculateSelectionCounts(teamSelectionsData);
  }, [teamSelectionsData]);

  // Calculate rider rank map using shared utility
  const riderRankMap = useMemo(() => {
    if (!ridersData) return {};
    return createRiderRankMap(ridersData as RidersData);
  }, [ridersData]);

  // Get selected participant's team
  const selectedParticipant = useMemo(() => {
    if (!teamSelectionsData || !searchTerm) return null;

    const participantEntry = Object.entries(teamSelectionsData).find(([name, data]) => 
      matchesSearch(name, searchTerm) ||
      matchesSearch(data.directie_name, searchTerm)
    );
    
    if (!participantEntry) return null;
    
    const [name, data] = participantEntry;
    return {
      name,
      team: data.riders
    };
  }, [teamSelectionsData, searchTerm]);

  // Popularity rankings (all riders sorted by selection count)
  const popularityRankings = useMemo(() => {
    if (!ridersData) return [];

    const ridersRecord = ridersData as RidersData;
    return Object.entries(ridersRecord)
      .map(([name, riderData]) => ({
        name,
        team: riderData.team || 'Onbekend Team',
        total_points: riderData.total_points,
        stages: riderData.stages,
        selection_count: riderSelectionCounts[name] || 0,
        selection_percentage: calculateSelectionPercentage(
          riderSelectionCounts[name] || 0,
          totalParticipants
        )
      }))
      .filter(rider => rider.selection_count > 0)
      .sort((a, b) => b.selection_count - a.selection_count);
  }, [ridersData, riderSelectionCounts, totalParticipants]);

  // Participant team rankings (selected team sorted by popularity)
  const participantTeamRankings = useMemo(() => {
    if (!selectedParticipant || !ridersData) return [];

    const ridersRecord = ridersData as RidersData;
    return selectedParticipant.team
      .map(riderName => ({
        name: riderName,
        team: ridersRecord[riderName]?.team || 'Onbekend Team',
        total_points: ridersRecord[riderName]?.total_points || 0,
        stages: ridersRecord[riderName]?.stages || {},
        selection_count: riderSelectionCounts[riderName] || 0,
        selection_percentage: calculateSelectionPercentage(
          riderSelectionCounts[riderName] || 0,
          totalParticipants
        )
      }))
      .sort((a, b) => b.selection_count - a.selection_count);
  }, [selectedParticipant, ridersData, riderSelectionCounts, totalParticipants]);

  // Display data (either selected participant's team or all riders)
  const displayData = selectedParticipant ? participantTeamRankings : popularityRankings;

  // Helper: Get stage jerseys with null safety
  const getStageJerseys = (stageData: RiderStageData | StageInfo | undefined): string[] => {
    if (!stageData?.jersey_points) return [];
    
    const jerseys: string[] = [];
    if ((stageData.jersey_points.yellow ?? 0) > 0) jerseys.push('yellow');
    if ((stageData.jersey_points.green ?? 0) > 0) jerseys.push('green');
    if ((stageData.jersey_points.polka_dot ?? 0) > 0) jerseys.push('polka_dot');
    if ((stageData.jersey_points.white ?? 0) > 0) jerseys.push('white');
    
    return jerseys;
  };

  // Helper: Check if rider is in top 10
  const isTop10 = (riderName: string) => {
    const rank = riderRankMap[riderName];
    return rank !== undefined && rank <= 10;
  };

  // Loading state
  if (loading) {
    return (
      <Layout title="Team Selecties">
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  // Error state
  if (error) {
    return (
      <Layout title="Team Selecties">
        <div className="text-center py-12 text-red-600">Error: {error.message}</div>
      </Layout>
    );
  }

  if (!ridersData || !teamSelectionsData) return null;

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
          Gebaseerd op {totalParticipants} deelnemers met elk 10 renners.
        </p>

        {/* Mobile Card View */}
        <div className="block lg:hidden space-y-2">
          {displayData.map((rider) => (
            <Card key={rider.name}>
              <div onClick={() => setExpandedRider(
                expandedRider === rider.name ? null : rider.name
              )}>
                <CardRow
                  left={
                    <div className="flex flex-col items-center min-w-[50px]">
                      <div className="text-lg font-bold text-tdf-text-primary">
                        {rider.selection_percentage}%
                      </div>
                      <div className="text-xs text-tdf-text-secondary">
                        {rider.selection_count}/{totalParticipants}
                      </div>
                    </div>
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
                  }
                />
              </div>

              <CardExpandedSection 
                title="Punten per Etappe"
                isExpanded={expandedRider === rider.name}
              >
                {getRiderStages(ridersData as RidersData, rider.name).map((stage) => {
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
                                src={JERSEY_ICONS[jersey as keyof typeof JERSEY_ICONS]}
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
                <React.Fragment key={rider.name}>
                  <tr
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
                            {getRiderStages(ridersData as RidersData, rider.name).map((stage) => {
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
                                            src={JERSEY_ICONS[jersey as keyof typeof JERSEY_ICONS]}
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
                </React.Fragment>
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