/**
 * Poule Page — participant standings (Dag · Algemeen · Directie tabs).
 */

import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useMetadata, useLeaderboards, useStagesData } from '../hooks/useTdfData';
import { usePageTitle } from '../hooks/usePageTitle';
import { RankChange } from '../components/shared/RankChange';
import { MedalIcon, MedalCountsAligned } from '../components/shared/MedalDisplay';
import { TabButton, SearchInput } from '../components/Button';
import { StandingsTable, ExpandableCard, type Column } from '../components/shared/StandingsTable';
import { FreshnessNote } from '../components/shared/FreshnessNote';
import { LoadingState, ErrorState } from '../components/StatusStates';
import { competitionRankMap, rankChangeMap, getAllParticipantMedals, getParticipantStages, formatLastUpdated } from '../../lib/data-transforms';
import { LABELS } from '../../lib/constants';
import type { MedalCounts } from '../../lib/types';

interface LeaderboardEntry {
  participant_name: string;
  directie_name: string;
  overall_score: number;
  overall_rank: number;
  overall_rank_change: number;
  stage_score: number;  // Note: json-generators maps stage_points → stage_score
  stage_rank: number;
  stage_rider_contributions: Record<string, number | undefined>;
}

interface DirectieEntry {
  directie_name: string;
  overall_score: number;
  overall_rank: number;
  overall_rank_change: number;
  stage_score: number;  // Note: json-generators maps stage_points → stage_score
  stage_rank: number;
  stage_participant_contributions: Array<{ participant_name: string; stage_score: number }>;
  overall_participant_contributions: Array<{ participant_name: string; overall_score: number }>;
}

type ViewType = 'stage_individual' | 'standings_individual' | 'standings_directie';

const NO_MEDALS: MedalCounts = { gold: 0, silver: 0, bronze: 0, display: '' };

/**
 * Single-stage breakdown for one participant: rider contributions plus the
 * Dagploeg bonus — the +6 sits in stage_score but not in
 * stage_rider_contributions, so it gets its own line or the breakdown would
 * not sum to the shown total.
 */
function StageContributions({ entry }: { entry: LeaderboardEntry }) {
  const contributions = Object.entries(entry.stage_rider_contributions ?? {})
    .map(([riderName, points]) => ({ riderName, points: points ?? 0 }))
    .sort((a, b) => b.points - a.points);
  const contribSum = contributions.reduce((sum, c) => sum + c.points, 0);
  const ploegBonus = entry.stage_score - contribSum;

  if (contributions.length === 0 && ploegBonus <= 0) {
    return <div className="text-sm text-tdf-text-secondary py-1 px-2">Geen punten in deze etappe</div>;
  }

  return (
    <>
      {contributions.map((c) => (
        <div key={c.riderName} className="flex justify-between py-1 px-2 rounded hover:bg-table-header">
          <span className="text-sm text-tdf-text-highlight">{c.riderName}</span>
          <span className="text-sm font-bold">{c.points}</span>
        </div>
      ))}
      {ploegBonus > 0 && (
        <div className="flex justify-between py-1 px-2 rounded hover:bg-table-header">
          <span className="text-sm text-tdf-text-highlight">Ploegenbonus</span>
          <span className="text-sm font-bold">{ploegBonus}</span>
        </div>
      )}
      <div className="flex justify-between py-1 px-2 mt-1 border-t border-gray-300">
        <span className="text-sm font-semibold text-tdf-text-highlight">Totaal</span>
        <span className="text-sm font-bold">{entry.stage_score}</span>
      </div>
    </>
  );
}

function Poule() {
  usePageTitle(LABELS.POULE);
  const [activeView, setActiveView] = useState<ViewType>('standings_individual');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  // Algemeen sort (5.9): total points (default) or Olympic-lexicographic medals.
  const [sortKey, setSortKey] = useState<'points' | 'medals'>('points');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // Fetch split data
  const { data: metadata, isLoading: metadataLoading, error: metadataError } = useMetadata();
  const { data: leaderboardsData, isLoading: leaderboardsLoading, error: leaderboardsError } = useLeaderboards();
  // Only feeds the Dag tab's route line; the page renders fine while (or if
  // ever) this snapshot is still loading, so it doesn't gate the page.
  const { data: stagesData } = useStagesData();

  const loading = metadataLoading || leaderboardsLoading;
  const error = metadataError || leaderboardsError;

  const currentLeaderboard = useMemo(() => {
    if (!metadata || !leaderboardsData) return [];
    const currentStageKey = `stage_${metadata.current_stage}`;
    return leaderboardsData.leaderboard_by_stage[currentStageKey] || [];
  }, [metadata, leaderboardsData]);
  
  const currentDirectieLeaderboard = useMemo(() => {
    if (!metadata || !leaderboardsData) return [];
    const currentStageKey = `stage_${metadata.current_stage}`;
    return leaderboardsData.directie_leaderboard_by_stage[currentStageKey] || [];
  }, [metadata, leaderboardsData]);

  // Tie-aware display ranks (competition ranking: 1,2,2,4), derived from the
  // FULL lists so search filtering never renumbers. Server ranks in the
  // snapshot stay dense and keep feeding the rank_change arrows.
  const stageRankMap = useMemo(
    () => competitionRankMap(currentLeaderboard, (e) => e.stage_score, (e) => e.participant_name),
    [currentLeaderboard]
  );
  const overallRankMap = useMemo(
    () => competitionRankMap(currentLeaderboard, (e) => e.overall_score, (e) => e.participant_name),
    [currentLeaderboard]
  );
  const directieOverallRankMap = useMemo(
    () => competitionRankMap(currentDirectieLeaderboard, (e) => e.overall_score, (e) => e.directie_name),
    [currentDirectieLeaderboard]
  );
  const medalsByParticipant = useMemo(
    () => (leaderboardsData ? getAllParticipantMedals(leaderboardsData) : new Map<string, MedalCounts>()),
    [leaderboardsData]
  );

  // Tie-aware +/- vs the previous stage: co-leaders who stay tied show no
  // change, only a real position move does. The snapshot's *_rank_change is
  // dense-rank based and wrong across ties, so we recompute it here.
  const overallChangeMap = useMemo(() => {
    if (!metadata || !leaderboardsData) return new Map<string, number | null>();
    const prev = leaderboardsData.leaderboard_by_stage[`stage_${metadata.current_stage - 1}`] ?? [];
    return rankChangeMap(currentLeaderboard, prev, (e) => e.overall_score, (e) => e.participant_name);
  }, [metadata, leaderboardsData, currentLeaderboard]);
  const directieChangeMap = useMemo(() => {
    if (!metadata || !leaderboardsData) return new Map<string, number | null>();
    const prev = leaderboardsData.directie_leaderboard_by_stage[`stage_${metadata.current_stage - 1}`] ?? [];
    return rankChangeMap(currentDirectieLeaderboard, prev, (e) => e.overall_score, (e) => e.directie_name);
  }, [metadata, leaderboardsData, currentDirectieLeaderboard]);

  // Filter and sort results
  const filteredResults = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();
    
    // Get the base data for each view (sorted by rank)
    if (activeView === 'standings_individual') {
      const baseData = [...currentLeaderboard].sort((a, b) => b.overall_score - a.overall_score);
      
      if (!searchLower) return baseData;
      
      return baseData.filter((p) => 
        p.participant_name.toLowerCase().includes(searchLower) ||
        p.directie_name.toLowerCase().includes(searchLower)
      );
    } else if (activeView === 'stage_individual') {
      const baseData = [...currentLeaderboard].sort((a, b) => b.stage_score - a.stage_score);
      
      if (!searchLower) return baseData;
      
      return baseData.filter((p) => 
        p.participant_name.toLowerCase().includes(searchLower) ||
        p.directie_name.toLowerCase().includes(searchLower)
      );
    } else {
      const baseData = [...currentDirectieLeaderboard].sort((a, b) => b.overall_score - a.overall_score);
      
      if (!searchLower) return baseData;
      
      return baseData.filter((d) => 
        d.directie_name.toLowerCase().includes(searchLower) ||
        d.overall_participant_contributions.some((cp) => 
          cp.participant_name.toLowerCase().includes(searchLower)
        )
      );
    }
  }, [activeView, searchTerm, currentLeaderboard, currentDirectieLeaderboard]);

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error.message} />;
  }

  if (!metadata || !leaderboardsData) return null;

  const currentStageNum = metadata.current_stage;
  const lastUpdated = formatLastUpdated(metadata.last_updated);

  // Route line for the Dag tab ("Ennezat → Le Mont-Dore"), when known.
  const currentStageInfo = stagesData?.find((s) => s.stage_number === currentStageNum);
  const stageRoute = currentStageInfo?.departure_city && currentStageInfo?.arrival_city
    ? `${currentStageInfo.departure_city} → ${currentStageInfo.arrival_city}`
    : null;

  const toggleItemDetails = (itemName: string) => {
    setExpandedItem(prev => prev === itemName ? null : itemName);
  };

  // Names are the expansion keys in every view, so collapse when switching tabs.
  const switchView = (view: ViewType) => {
    setActiveView(view);
    setExpandedItem(null);
  };

  const isOpen = (name: string) => expandedItem === name;

  // Deep-link from a participant's Algemeen expansion to their ploeg (5.6).
  const ploegLink = (name: string) => (
    <Link
      to={`/ploegen?deelnemer=${encodeURIComponent(name)}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-block mt-3 text-sm font-medium text-tdf-heading hover:underline"
    >
      Bekijk ploeg van {name} →
    </Link>
  );

  // Per-etappe list for a participant, shared by the Algemeen card and row.
  const participantStageList = (name: string) =>
    getParticipantStages(leaderboardsData, name).map((stage) => (
      <div key={stage.stageKey} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
        <span className="text-sm text-tdf-text-highlight">Etappe {stage.stageNum}:</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-tdf-text-secondary">#{stage.stage_rank}</span>
          <span className="text-sm font-bold">{stage.stage_score}</span>
        </div>
      </div>
    ));

  // ---- Column specs -----------------------------------------------------------
  const stageColumns: Column<LeaderboardEntry>[] = [
    {
      key: 'pos',
      header: 'Positie',
      cellClassName: 'font-medium',
      render: (entry) => {
        const rank = stageRankMap.get(entry.participant_name) ?? entry.stage_rank;
        return (<>{rank} <MedalIcon position={rank} className="ml-1" /></>);
      },
    },
    { key: 'deelnemer', header: 'Deelnemer', render: (e) => e.participant_name },
    { key: 'directie', header: 'Directie', cellClassName: 'text-tdf-text-highlight', render: (e) => e.directie_name },
    {
      key: 'punten',
      header: 'Punten',
      align: 'right',
      cellClassName: 'font-semibold text-tdf-score',
      render: (e) => e.stage_score,
    },
  ];

  // ---- Algemeen sort (5.9) ----------------------------------------------------
  // Olympic-lexicographic medal score, packed into one number for reuse in
  // competitionRankMap: golds dominate silvers dominate bronzes.
  const medalScore = (name: string) => {
    const m = medalsByParticipant.get(name) ?? NO_MEDALS;
    return m.gold * 1e6 + m.silver * 1e3 + m.bronze;
  };
  const medalSorted = sortKey === 'medals';
  const dirSign = sortDir === 'desc' ? 1 : -1;

  const toggleSort = (key: 'points' | 'medals') => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // Positie follows the active sort key (tie-aware); +/- is meaningful only for
  // the points ranking, so it's hidden while medal-sorted.
  const algemeenRankMap = medalSorted
    ? competitionRankMap(currentLeaderboard, (e) => medalScore(e.participant_name), (e) => e.participant_name)
    : overallRankMap;

  const algemeenRows = (rows: LeaderboardEntry[]) =>
    [...rows].sort((a, b) => {
      if (medalSorted) {
        const d = medalScore(b.participant_name) - medalScore(a.participant_name);
        if (d !== 0) return d * dirSign;
      }
      return (b.overall_score - a.overall_score) * dirSign;
    });

  // The Algemeen rows in display order, shared by the desktop table and mobile
  // cards. Rank blanking (#5) keys off adjacency in this exact order.
  const algemeenDisplayed = algemeenRows(filteredResults as LeaderboardEntry[]);
  const algemeenRankAt = (i: number) =>
    algemeenRankMap.get(algemeenDisplayed[i].participant_name) ?? algemeenDisplayed[i].overall_rank;
  const isRepeatRank = (i: number) => i > 0 && algemeenRankAt(i) === algemeenRankAt(i - 1);

  const sortArrow = (key: 'points' | 'medals') =>
    sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '';
  const sortableHeader = (key: 'points' | 'medals', label: string) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      aria-label={`Sorteer op ${label}`}
      className={`inline-flex items-center gap-0.5 hover:text-tdf-text-primary ${sortKey === key ? 'text-tdf-text-primary' : ''}`}
    >
      {label}
      <span className={sortKey === key ? '' : 'text-tdf-text-muted'}>{sortKey === key ? sortArrow(key) : ' ⇅'}</span>
    </button>
  );

  const standingsColumns: Column<LeaderboardEntry>[] = [
    {
      key: 'pos',
      // Positie + +/- form one tight "rank & movement" unit: narrow rank cell,
      // minimal padding between them, then a clear gap before Deelnemer.
      header: 'Positie',
      headerClassName: 'w-10 pr-1',
      cellClassName: 'font-medium w-10 pr-1',
      // On a tie, only the first row of the group shows the shared rank; the
      // repeats stay blank for visual calm (#5). Rows arrive pre-sorted, so a
      // repeat is any row whose rank equals the one above it.
      render: (e, index) =>
        isRepeatRank(index) ? '' : algemeenRankMap.get(e.participant_name) ?? e.overall_rank,
    },
    ...(medalSorted
      ? []
      : [{
          key: 'change',
          header: '+/-',
          align: 'left' as const,
          headerClassName: 'w-11 pl-1',
          cellClassName: 'w-11 pl-1',
          render: (e: LeaderboardEntry) => <RankChange change={overallChangeMap.get(e.participant_name) ?? 0} />,
        }]),
    { key: 'deelnemer', header: 'Deelnemer', headerClassName: 'pl-8', cellClassName: 'pl-8', render: (e) => e.participant_name },
    { key: 'directie', header: 'Directie', cellClassName: 'text-tdf-text-highlight', render: (e) => e.directie_name },
    {
      key: 'punten',
      header: sortableHeader('points', 'Punten'),
      align: 'right',
      cellClassName: 'font-semibold text-tdf-score',
      render: (e) => e.overall_score,
    },
    {
      key: 'medals',
      header: sortableHeader('medals', 'Etappe Medailles'),
      align: 'center',
      render: (e) => {
        const m = medalsByParticipant.get(e.participant_name) ?? NO_MEDALS;
        return <MedalCountsAligned gold={m.gold} silver={m.silver} bronze={m.bronze} />;
      },
    },
  ];

  const directieColumns: Column<DirectieEntry>[] = [
    {
      key: 'pos',
      header: 'Positie',
      headerClassName: 'w-10 pr-1',
      cellClassName: 'font-medium w-10 pr-1',
      render: (e) => directieOverallRankMap.get(e.directie_name) ?? e.overall_rank,
    },
    { key: 'change', header: '+/-', align: 'left', headerClassName: 'w-11 pl-1', cellClassName: 'w-11 pl-1', render: (e) => <RankChange change={directieChangeMap.get(e.directie_name) ?? 0} /> },
    { key: 'directie', header: 'Directie', headerClassName: 'pl-8', cellClassName: 'font-medium pl-8', render: (e) => e.directie_name },
    {
      key: 'punten',
      header: 'Punten',
      align: 'right',
      cellClassName: 'font-semibold text-tdf-score',
      render: (e) => e.overall_score.toFixed(1),
    },
  ];

  return (
    <Layout title={LABELS.POULE}>
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex gap-2">
          <TabButton active={activeView === 'stage_individual'} onClick={() => switchView('stage_individual')}>
            Dag
          </TabButton>
          <TabButton active={activeView === 'standings_individual'} onClick={() => switchView('standings_individual')}>
            {LABELS.STANDINGS_INDIVIDUAL}
          </TabButton>
          <TabButton active={activeView === 'standings_directie'} onClick={() => switchView('standings_directie')}>
            {LABELS.STANDINGS_DIRECTIE}
          </TabButton>
        </div>

        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder={LABELS.SEARCH_PLACEHOLDER} />
        <FreshnessNote stage={currentStageNum} lastUpdated={lastUpdated} />
      </div>

      {/* ETAPPE VIEW */}
      {activeView === 'stage_individual' && (
        <main>
          <p className="text-xs sm:text-sm mb-4 sm:mb-6 text-tdf-text-highlight">
            Etappe {currentStageNum}{stageRoute && `: ${stageRoute}`}
          </p>

          <div className="block lg:hidden space-y-2">
            {(filteredResults as LeaderboardEntry[]).map((entry) => {
              const rank = stageRankMap.get(entry.participant_name) ?? entry.stage_rank;
              return (
                <ExpandableCard
                  key={entry.participant_name}
                  expanded={isOpen(entry.participant_name)}
                  onToggle={() => toggleItemDetails(entry.participant_name)}
                  header={
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center justify-center min-w-[50px]">
                        <div className="text-lg font-bold text-tdf-text-primary">#{rank}</div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-tdf-text-primary truncate">{entry.participant_name}</div>
                        <div className="text-xs text-tdf-text-secondary truncate">{entry.directie_name}</div>
                      </div>

                      <div className="text-right min-w-[60px]">
                        <div className="text-lg font-bold text-tdf-primary">{entry.stage_score}</div>
                        {rank <= 3 && (
                          <div className="text-sm leading-none mt-0.5"><MedalIcon position={rank} /></div>
                        )}
                      </div>
                    </div>
                  }
                >
                  <h3 className="text-xs font-semibold mb-2 text-tdf-text-highlight">Punten per Renner</h3>
                  <StageContributions entry={entry} />
                </ExpandableCard>
              );
            })}
          </div>

          <StandingsTable
            columns={stageColumns}
            rows={filteredResults as LeaderboardEntry[]}
            getRowKey={(e) => e.participant_name}
            onRowClick={(e) => toggleItemDetails(e.participant_name)}
            isRowExpanded={(e) => isOpen(e.participant_name)}
            renderExpanded={(entry) => (
              <div className="ml-8 max-w-md">
                <h3 className="text-sm font-semibold mb-2 pb-2 text-tdf-text-highlight border-b">Punten per Renner</h3>
                <StageContributions entry={entry} />
              </div>
            )}
          />
        </main>
      )}

      {/* ALGEMEEN KLASSEMENT VIEW */}
      {activeView === 'standings_individual' && (
        <main>
          {/* Sort chips — mobile only (desktop sorts via column headers) */}
          <div className="flex items-center gap-2 mb-3 lg:hidden">
            <span className="text-xs text-tdf-text-secondary">Sorteer:</span>
            {(['points', 'medals'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleSort(key)}
                className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                  sortKey === key
                    ? 'bg-tdf-accent text-tdf-on-accent border-tdf-accent'
                    : 'bg-white text-tdf-text-secondary border-gray-200 hover:bg-tdf-card-hover'
                }`}
              >
                {key === 'points' ? 'Punten' : 'Medailles'}
                {sortKey === key && sortArrow(key)}
              </button>
            ))}
          </div>

          <div className="block lg:hidden space-y-2">
            {algemeenDisplayed.map((entry) => {
              const medals = medalsByParticipant.get(entry.participant_name) ?? NO_MEDALS;
              const rank = algemeenRankMap.get(entry.participant_name) ?? entry.overall_rank;
              return (
                <ExpandableCard
                  key={entry.participant_name}
                  expanded={isOpen(entry.participant_name)}
                  onToggle={() => toggleItemDetails(entry.participant_name)}
                  header={
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center justify-center min-w-[50px]">
                        <div className="text-lg font-bold text-tdf-text-primary">#{rank}</div>
                        {/* rank_change describes the points ranking; hide it while medal-sorted */}
                        {!medalSorted && (
                          <div className="text-xs"><RankChange change={overallChangeMap.get(entry.participant_name) ?? 0} /></div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-tdf-text-primary truncate">{entry.participant_name}</div>
                        <div className="text-xs text-tdf-text-secondary truncate">{entry.directie_name}</div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold text-tdf-primary">{entry.overall_score}</div>
                        {medals.display && (
                          <div className="text-sm mt-0.5 flex justify-end">
                            <MedalCountsAligned gold={medals.gold} silver={medals.silver} bronze={medals.bronze} />
                          </div>
                        )}
                      </div>
                    </div>
                  }
                >
                  <h3 className="text-xs font-semibold mb-2 text-tdf-text-highlight">Punten per Etappe</h3>
                  {participantStageList(entry.participant_name)}
                  {ploegLink(entry.participant_name)}
                </ExpandableCard>
              );
            })}
          </div>

          <StandingsTable
            columns={standingsColumns}
            rows={algemeenDisplayed}
            getRowKey={(e) => e.participant_name}
            onRowClick={(e) => toggleItemDetails(e.participant_name)}
            isRowExpanded={(e) => isOpen(e.participant_name)}
            renderExpanded={(entry) => (
              <div className="ml-8 max-w-md">
                <h3 className="text-sm font-semibold mb-2 pb-2 text-tdf-text-highlight border-b">Punten per Etappe</h3>
                {participantStageList(entry.participant_name)}
                {ploegLink(entry.participant_name)}
              </div>
            )}
          />
        </main>
      )}

      {/* DIRECTIE KLASSEMENT VIEW */}
      {activeView === 'standings_directie' && (
        <main>
          <p className="text-xs sm:text-sm mb-4 sm:mb-6 text-tdf-text-highlight">
            Gemiddelde van de top {metadata.top_n_participants_for_directie} deelnemers per directie
          </p>

          <div className="block lg:hidden space-y-2">
            {(filteredResults as DirectieEntry[]).map((entry) => (
              <ExpandableCard
                key={entry.directie_name}
                expanded={isOpen(entry.directie_name)}
                onToggle={() => toggleItemDetails(entry.directie_name)}
                header={
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center justify-center min-w-[50px]">
                      <div className="text-lg font-bold text-tdf-text-primary">#{directieOverallRankMap.get(entry.directie_name) ?? entry.overall_rank}</div>
                      <div className="text-xs"><RankChange change={directieChangeMap.get(entry.directie_name) ?? 0} /></div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-tdf-text-primary truncate">{entry.directie_name}</div>
                    </div>

                    <div className="text-right min-w-[60px]">
                      <div className="text-lg font-bold text-tdf-primary">{entry.overall_score.toFixed(1)}</div>
                    </div>
                  </div>
                }
              >
                <h3 className="text-xs font-semibold mb-2 text-tdf-text-highlight">Totale Bijdragen per Deelnemer</h3>
                {entry.overall_participant_contributions.map((participant, pidx) => (
                  <div key={participant.participant_name} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs font-semibold text-tdf-text-secondary">#{pidx + 1}</span>
                      <span className="text-sm text-tdf-text-highlight truncate">{participant.participant_name}</span>
                    </div>
                    <span className="text-sm font-bold text-tdf-text-primary">{participant.overall_score}</span>
                  </div>
                ))}
              </ExpandableCard>
            ))}
          </div>

          <StandingsTable
            columns={directieColumns}
            rows={filteredResults as DirectieEntry[]}
            getRowKey={(e) => e.directie_name}
            onRowClick={(e) => toggleItemDetails(e.directie_name)}
            isRowExpanded={(e) => isOpen(e.directie_name)}
            renderExpanded={(entry) => (
              <div className="ml-8 max-w-2xl">
                <h3 className="text-sm font-semibold mb-2 pb-2 text-tdf-text-highlight border-b">Totale Bijdragen per Deelnemer</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {entry.overall_participant_contributions.map((participant, pidx) => (
                    <div
                      key={participant.participant_name}
                      className="flex justify-between items-center py-2 px-3 rounded hover:bg-table-header"
                    >
                      <span className="text-sm flex items-center gap-2 text-tdf-text-highlight">
                        <span className="text-xs font-semibold w-5 text-tdf-text-muted">#{pidx + 1}</span>
                        {participant.participant_name}
                      </span>
                      <span className="text-sm font-bold">{participant.overall_score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          />
        </main>
      )}

      {filteredResults.length === 0 && (
        <div className="text-center py-12 text-tdf-text-secondary">{LABELS.NO_RESULTS}</div>
      )}
    </Layout>
  );
}

export default Poule;