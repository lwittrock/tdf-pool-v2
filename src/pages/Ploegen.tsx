/**
 * Ploegen Page — rider popularity, and one participant's ploeg (their 10
 * selected renners) when a deelnemer is searched.
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { Card, CardRow, CardExpandedSection } from '../components/Card';
import { Autocomplete } from '../components/Autocomplete';
import { RiderName } from '../components/shared/RiderName';
import { StandingsTable, type Column } from '../components/shared/StandingsTable';
import { spacerColumn } from '../components/shared/spacerColumn';
import { useRiders, useTeamSelections, useStagesData } from '../hooks/useTdfData';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  getRiderStages,
  calculateSelectionCounts,
  calculateSelectionPercentage,
  createRiderRankMap,
  abandonedRiderSet
} from '../../lib/data-transforms';
import { JERSEY_ICONS, SELECTION_ICONS, SELECTION_THRESHOLDS, LABELS } from '../../lib/constants';
import type { RidersData, RiderStageData, StageInfo } from '../../lib/types';

interface PloegRow {
  name: string;
  team: string;
  total_points: number;
  stages: Record<string, RiderStageData>;
  selection_count: number;
  selection_percentage: number;
}

function Ploegen() {
  usePageTitle(LABELS.PLOEGEN);
  // Deelnemer is kept in the URL (?deelnemer=X) so /klassement can deep-link to a
  // participant's ploeg (5.6) and the view is shareable.
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('deelnemer') ?? '');
  const [expandedRider, setExpandedRider] = useState<string | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setSearchParams(value ? { deelnemer: value } : {}, { replace: true });
  };

  // Fetch data
  const { data: ridersData, isLoading: ridersLoading, error: ridersError } = useRiders();
  const { data: teamSelectionsData, isLoading: selectionsLoading, error: selectionsError } = useTeamSelections();
  // Optional: only feeds the DNF/DNS marking, so it never gates the page.
  const { data: stagesData } = useStagesData();
  const abandoned = useMemo(() => abandonedRiderSet(stagesData), [stagesData]);

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

  // Deelnemer options for the autocomplete: name + directie as the subtitle.
  const participantOptions = useMemo(() => {
    if (!teamSelectionsData) return [];
    return Object.entries(teamSelectionsData)
      .map(([name, data]) => ({ id: name, name, team: data.directie_name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teamSelectionsData]);

  // The autocomplete resolves to an exact deelnemer name (or ''), so the team
  // swap is deterministic — no more first-match guessing.
  const selectedParticipant = useMemo(() => {
    if (!teamSelectionsData || !searchTerm) return null;
    const data = teamSelectionsData[searchTerm];
    if (!data) return null;
    return { name: searchTerm, team: data.riders };
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
    return rank !== undefined && rank <= SELECTION_THRESHOLDS.TOP_RIDER_RANK;
  };

  // Loading state
  if (loading) {
    return (
      <Layout title={LABELS.PLOEGEN}>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  // Error state
  if (error) {
    return (
      <Layout title={LABELS.PLOEGEN}>
        <div className="text-center py-12 text-red-600">Error: {error.message}</div>
      </Layout>
    );
  }

  if (!ridersData || !teamSelectionsData) return null;

  // Per-rider etappe breakdown, shared by the mobile card and the desktop
  // table's expanded row.
  const riderStageBreakdown = (name: string) => (
    <div className="space-y-1">
      {getRiderStages(ridersData as RidersData, name).map((stage) => {
        const stageJerseys = getStageJerseys(stage);
        return (
          <div key={stage.stageKey} className="flex justify-between items-center py-1 px-2 rounded hover:bg-table-header">
            <div className="flex items-center">
              <span className="text-sm text-tdf-text-highlight w-24">Etappe {stage.stageNum}:</span>
              <span className="text-xs text-tdf-text-secondary w-16">
                {stage.stage_finish_position > 0 ? `# ${stage.stage_finish_position}` : ''}
              </span>
              {stageJerseys.length > 0 && (
                <div className="flex gap-1 items-center">
                  {stageJerseys.map((jersey) => (
                    <img key={jersey} src={JERSEY_ICONS[jersey as keyof typeof JERSEY_ICONS]} alt={`${jersey} jersey`} className="w-4 h-4" />
                  ))}
                </div>
              )}
            </div>
            <span className="text-sm font-bold">{stage.stage_total}</span>
          </div>
        );
      })}
    </div>
  );

  // Desktop columns for the shared StandingsTable (card surface, caps header,
  // gold points — same treatment as the other pages).
  const columns: Column<PloegRow>[] = [
    {
      key: 'sel',
      header: 'Geselecteerd',
      align: 'center',
      render: (r) => (
        <div className="flex flex-col items-center">
          <div className="text-sm font-bold text-tdf-text-primary">{r.selection_percentage}%</div>
          <div className="text-xs text-tdf-text-secondary">{r.selection_count}/{totalParticipants}</div>
        </div>
      ),
    },
    {
      key: 'renner',
      header: 'Renner',
      headerClassName: 'pl-6',
      cellClassName: 'pl-6',
      render: (r) => <RiderName name={r.name} abandoned={abandoned.has(r.name)} />,
    },
    spacerColumn<PloegRow>('mid'),
    { key: 'team', header: 'Team', cellClassName: 'text-tdf-text-secondary', render: (r) => r.team },
    {
      key: 'punten',
      header: 'Punten',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <span className="text-lg w-6 flex items-center justify-center leading-none">
            {isTop10(r.name) &&
              (r.selection_percentage >= SELECTION_THRESHOLDS.POPULAR
                ? SELECTION_ICONS.POPULAR_TOP_10
                : SELECTION_ICONS.RARE_TOP_10)}
          </span>
          <span className="font-semibold text-tdf-score w-12 text-right">{r.total_points}</span>
        </div>
      ),
    },
  ];

  return (
    <Layout title={LABELS.PLOEGEN}>
      <main>
        {/* Deelnemer search (swaps the list to that participant's ploeg) */}
        <div className="mb-6">
          <Autocomplete
            options={participantOptions}
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Toon ploeg van deelnemer..."
            emptyLabel="Geen deelnemer gevonden"
          />
        </div>

        {/* Header */}
        {selectedParticipant ? (
          <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-heading">
            Ploeg van {selectedParticipant.name}
          </h2>
        ) : (
          <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-heading">
            Rennerpopulariteit
          </h2>
        )}
        <p className="text-xs sm:text-sm mb-4 sm:mb-6 text-tdf-text-highlight">
          Alleen actieve renners tellen mee.
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
                        <RiderName name={rider.name} abandoned={abandoned.has(rider.name)} />
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
                            {rider.selection_percentage >= SELECTION_THRESHOLDS.POPULAR ? SELECTION_ICONS.POPULAR_TOP_10 : SELECTION_ICONS.RARE_TOP_10}
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
                {riderStageBreakdown(rider.name)}
              </CardExpandedSection>
            </Card>
          ))}
        </div>

        {/* Desktop Table View — shared StandingsTable (card surface). */}
        <StandingsTable
          columns={columns}
          rows={displayData as PloegRow[]}
          getRowKey={(r) => r.name}
          onRowClick={(r) => setExpandedRider(expandedRider === r.name ? null : r.name)}
          isRowExpanded={(r) => expandedRider === r.name}
          renderExpanded={(r) => (
            <div className="ml-8 max-w-md">
              <h3 className="text-sm font-semibold mb-2 pb-2 text-tdf-text-highlight border-b">Punten per Etappe</h3>
              {riderStageBreakdown(r.name)}
            </div>
          )}
        />

        {displayData.length === 0 && (
          <div className="text-center py-12 text-tdf-text-secondary">
            {selectedParticipant ? 'Geen ploeg gevonden voor deze deelnemer' : 'Geen renners gevonden'}
          </div>
        )}
      </main>
    </Layout>
  );
}

export default Ploegen;