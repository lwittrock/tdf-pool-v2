/**
 * Rennerpunten Page — cumulative rider standings.
 */

import React, { useState, useMemo } from 'react';
import { useMetadata, useRiders, useRiderRankings } from '../hooks/useTdfData';
import { usePageTitle } from '../hooks/usePageTitle';
import { SearchInput } from '../components/Button';
import { LoadingState, ErrorState } from '../components/StatusStates';
import { competitionRankMap, getRiderStagesFromData, formatLastUpdated } from '../../lib/data-transforms';
import { JERSEY_ICONS, LABELS } from '../../lib/constants';
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

function Rennerpunten() {
  usePageTitle(LABELS.RENNERPUNTEN);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRider, setExpandedRider] = useState<string | null>(null);

  // Fetch data
  const { data: metadata, isLoading: metadataLoading, error: metadataError } = useMetadata();
  const { data: ridersData, isLoading: ridersLoading, error: ridersError } = useRiders();
  const { data: riderRankings, isLoading: rankingsLoading, error: rankingsError } = useRiderRankings();

  const loading = metadataLoading || ridersLoading || rankingsLoading;
  const error = metadataError || ridersError || rankingsError;

  // Total rankings - directly from rider_rankings.json (already sorted!)
  const totalRankings = useMemo(() => {
    return riderRankings?.total_rankings || [];
  }, [riderRankings]);

  // Tie-aware display ranks (competition ranking: 1,2,2,4), derived from the
  // FULL list so search filtering never renumbers. The dense server ranks in
  // the snapshot are only used as fallback.
  const totalDisplayRanks = useMemo(
    () => competitionRankMap(totalRankings, (r) => r.total_points, (r) => r.name),
    [totalRankings]
  );

  // Filter based on search
  const filteredResults = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();
    if (!searchLower) return totalRankings;

    return totalRankings.filter(rider =>
      rider.name.toLowerCase().includes(searchLower) ||
      rider.team.toLowerCase().includes(searchLower)
    );
  }, [searchTerm, totalRankings]);

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
    return <LoadingState />;
  }

  // Error state
  if (error) {
    return <ErrorState message={error.message} />;
  }

  if (!metadata || !ridersData || !riderRankings) return null;

  const lastUpdated = formatLastUpdated(metadata.last_updated);

  return (
    <div className="min-h-screen py-4 px-4 sm:px-6 lg:px-32 bg-tdf-bg">
      {/* Header */}
      <header className="mb-6 sm:mb-12 text-center">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-tdf-primary">
          Rennerpunten
        </h1>
        <p className="text-sm sm:text-base text-tdf-text-secondary mt-2">
          Na etappe {metadata.current_stage}{lastUpdated && ` (${lastUpdated})`}
        </p>
      </header>

      {/* Search */}
      <div className="mb-6">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Zoek renner of team..."
        />
      </div>

      <main>
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
                      <div className="text-lg font-bold text-tdf-text-primary">#{totalDisplayRanks.get(rider.name) ?? rider.overall_rank}</div>
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
                      {getRiderStagesFromData(riderData, metadata.current_stage).map((stage) => {
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
                              {stage.stage_finish_position > 0 && (
                                <span className="text-xs text-tdf-text-secondary">#{stage.stage_finish_position}</span>
                              )}
                              <span className={`text-sm font-bold ${stage.stage_total > 0 ? 'text-tdf-text-primary' : 'text-tdf-text-muted'}`}>
                                {stage.stage_total > 0 ? stage.stage_total : '—'}
                              </span>
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
                      <td className="px-4 py-3 text-sm font-medium">{totalDisplayRanks.get(rider.name) ?? rider.overall_rank}</td>
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
                            {getRiderStagesFromData(riderData, metadata.current_stage).map((stage) => {
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
                                    {stage.stage_finish_position > 0 && (
                                      <span className="text-xs text-tdf-text-secondary">#{stage.stage_finish_position}</span>
                                    )}
                                    <span className={`text-sm font-bold ${stage.stage_total > 0 ? '' : 'text-tdf-text-muted'}`}>
                                      {stage.stage_total > 0 ? stage.stage_total : '—'}
                                    </span>
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

      {filteredResults.length === 0 && (
        <div className="text-center py-12 text-tdf-text-secondary">{LABELS.NO_RESULTS}</div>
      )}
    </div>
  );
}

export default Rennerpunten;
