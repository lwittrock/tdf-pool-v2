/**
 * Klassement Page
 */

import React, { useState, useMemo } from 'react'
import { useMetadata, useLeaderboards } from '../hooks/useTdfData';
import { RankChange } from '../components/shared/RankChange';
import { MedalIcon } from '../components/shared/MedalDisplay';
import { competitionRankMap, getAllParticipantMedals, getParticipantStages } from '../../lib/data-transforms';
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
    return <div className="text-sm text-gray-500 py-1 px-2">Geen punten in deze etappe</div>;
  }

  return (
    <>
      {contributions.map((c) => (
        <div key={c.riderName} className="flex justify-between py-1 px-2 rounded hover:bg-gray-200">
          <span className="text-sm text-gray-600">{c.riderName}</span>
          <span className="text-sm font-bold">{c.points}</span>
        </div>
      ))}
      {ploegBonus > 0 && (
        <div className="flex justify-between py-1 px-2 rounded hover:bg-gray-200">
          <span className="text-sm text-gray-600">Ploegenbonus</span>
          <span className="text-sm font-bold">{ploegBonus}</span>
        </div>
      )}
      <div className="flex justify-between py-1 px-2 mt-1 border-t border-gray-300">
        <span className="text-sm font-semibold text-gray-700">Totaal</span>
        <span className="text-sm font-bold">{entry.stage_score}</span>
      </div>
    </>
  );
}

function HomePage() {
  const [activeView, setActiveView] = useState<ViewType>('standings_individual');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // Fetch split data
  const { data: metadata, isLoading: metadataLoading, error: metadataError } = useMetadata();
  const { data: leaderboardsData, isLoading: leaderboardsLoading, error: leaderboardsError } = useLeaderboards();

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-tdf-bg">
        <div className="text-center">
          <div className="text-2xl font-bold text-tdf-primary mb-4">Loading...</div>
          <div className="text-tdf-text-secondary">Fetching race data...</div>
        </div>
      </div>
    );
  }

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

  if (!metadata || !leaderboardsData) return null;

  const currentStageNum = metadata.current_stage;

  const toggleItemDetails = (itemName: string) => {
    setExpandedItem(prev => prev === itemName ? null : itemName);
  };

  // Names are the expansion keys in every view, so collapse when switching tabs.
  const switchView = (view: ViewType) => {
    setActiveView(view);
    setExpandedItem(null);
  };

  return (
    <div className="min-h-screen py-4 px-4 sm:px-6 lg:px-32 bg-tdf-bg">
      <header className="mb-6 sm:mb-12 text-center">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-tdf-primary">
          Klassement
        </h1>
      </header>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => switchView('standings_individual')}
            className={`flex-1 py-3 px-2 rounded-lg font-semibold transition-all text-xs sm:text-sm lg:text-base ${
              activeView === 'standings_individual'
                ? 'bg-tdf-accent text-white border-2 border-yellow-500'
                : 'bg-gray-200 text-gray-700 border-2 border-transparent'
            }`}
          >
            Algemeen
          </button>
          <button
            onClick={() => switchView('stage_individual')}
            className={`flex-1 py-3 px-2 rounded-lg font-semibold transition-all text-xs sm:text-sm lg:text-base ${
              activeView === 'stage_individual'
                ? 'bg-tdf-accent text-white border-2 border-yellow-500'
                : 'bg-gray-200 text-gray-700 border-2 border-transparent'
            }`}
          >
            Etappe
          </button>
          <button
            onClick={() => switchView('standings_directie')}
            className={`flex-1 py-3 px-2 rounded-lg font-semibold transition-all text-xs sm:text-sm lg:text-base ${
              activeView === 'standings_directie'
                ? 'bg-tdf-accent text-white border-2 border-yellow-500'
                : 'bg-gray-200 text-gray-700 border-2 border-transparent'
            }`}
          >
            Directie
          </button>
        </div>

        <div className="w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Zoek deelnemer of directie..."
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 focus:border-tdf-accent focus:outline-none text-sm sm:text-base"
          />
        </div>
      </div>

      {/* ETAPPE VIEW */}
      {activeView === 'stage_individual' && (
        <main>
          <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">Etappe {currentStageNum} Klassement</h2>

          <div className="block lg:hidden space-y-2">
            {(filteredResults as LeaderboardEntry[]).map((entry) => {
              const rank = stageRankMap.get(entry.participant_name) ?? entry.stage_rank;

              return (
                <div key={entry.participant_name} className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div
                    onClick={() => toggleItemDetails(entry.participant_name)}
                    className="p-3 cursor-pointer active:bg-tdf-bg"
                  >
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
                  </div>

                  {expandedItem === entry.participant_name && (
                    <div className="px-3 pb-3 bg-tdf-bg border-t border-gray-200">
                      <div className="pt-3">
                        <h3 className="text-xs font-semibold mb-2 text-gray-600">Punten per Renner</h3>
                        <StageContributions entry={entry} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-200">
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Positie</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Deelnemer</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Directie</th>
                  <th className="px-4 py-4 text-right text-sm font-semibold text-gray-600">Etappe Punten</th>
                </tr>
              </thead>
              <tbody>
                {(filteredResults as LeaderboardEntry[]).map((entry, idx) => {
                  const rank = stageRankMap.get(entry.participant_name) ?? entry.stage_rank;

                  return (
                    <React.Fragment key={entry.participant_name}>
                      <tr
                        className={`cursor-pointer hover:bg-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-tdf-bg'}`}
                        onClick={() => toggleItemDetails(entry.participant_name)}
                      >
                        <td className="px-4 py-3 text-sm font-medium">
                          {rank} <MedalIcon position={rank} className="ml-1" />
                        </td>
                        <td className="px-4 py-3 text-sm">{entry.participant_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{entry.directie_name}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">{entry.stage_score}</td>
                      </tr>
                      {expandedItem === entry.participant_name && (
                        <tr className="bg-gray-100">
                          <td colSpan={4} className="px-4 py-4">
                            <div className="ml-8 max-w-md">
                              <h3 className="text-sm font-semibold mb-2 pb-2 text-gray-600 border-b">Punten per Renner</h3>
                              <StageContributions entry={entry} />
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

      {/* ALGEMEEN KLASSEMENT VIEW */}
      {activeView === 'standings_individual' && (
        <main>
          <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">Algemeen Klassement</h2>

          <div className="block lg:hidden space-y-2">
            {(filteredResults as LeaderboardEntry[]).map((entry) => {
              const medals = medalsByParticipant.get(entry.participant_name) ?? NO_MEDALS;
              const rank = overallRankMap.get(entry.participant_name) ?? entry.overall_rank;

              return (
                <div key={entry.participant_name} className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div
                    onClick={() => toggleItemDetails(entry.participant_name)}
                    className="p-3 cursor-pointer active:bg-tdf-bg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center justify-center min-w-[50px]">
                        <div className="text-lg font-bold text-tdf-text-primary">#{rank}</div>
                        {/* rank_change is based on dense server ranks; tie display may differ by design */}
                        <div className="text-xs"><RankChange change={entry.overall_rank_change} /></div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-tdf-text-primary truncate">{entry.participant_name}</div>
                        <div className="text-xs text-tdf-text-secondary truncate">{entry.directie_name}</div>
                      </div>
                      
                      <div className="text-right">
                        <div className="text-lg font-bold text-tdf-primary">{entry.overall_score}</div>
                        {medals.display && <div className="text-sm leading-none mt-0.5">{medals.display}</div>}
                      </div>
                    </div>
                  </div>

                  {expandedItem === entry.participant_name && (
                    <div className="px-3 pb-3 bg-tdf-bg border-t border-gray-200">
                      <div className="pt-3">
                        <h3 className="text-xs font-semibold mb-2 text-gray-600">Punten per Etappe</h3>
                        {getParticipantStages(leaderboardsData, entry.participant_name).map((stage) => (
                          <div key={stage.stageKey} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
                            <span className="text-sm text-gray-700">Etappe {stage.stageNum}:</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-tdf-text-secondary">#{stage.stage_rank}</span>
                              <span className="text-sm font-bold">{stage.stage_score}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-200">
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Positie</th>
                  <th className="px-4 py-4 text-center text-sm font-semibold text-gray-600">+/-</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Deelnemer</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Directie</th>
                  <th className="px-4 py-4 text-right text-sm font-semibold text-gray-600">Totaal Punten</th>
                  <th className="px-4 py-4 text-center text-sm font-semibold text-gray-600">Etappe Medailles</th>
                </tr>
              </thead>
              <tbody>
                {(filteredResults as LeaderboardEntry[]).map((entry, idx) => {
                  const medals = medalsByParticipant.get(entry.participant_name) ?? NO_MEDALS;
                  const rank = overallRankMap.get(entry.participant_name) ?? entry.overall_rank;

                  return (
                    <React.Fragment key={entry.participant_name}>
                      <tr
                        className={`cursor-pointer hover:bg-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-tdf-bg'}`}
                        onClick={() => toggleItemDetails(entry.participant_name)}
                      >
                        <td className="px-4 py-3 text-sm font-medium">{rank}</td>
                        <td className="px-4 py-3 text-sm text-center"><RankChange change={entry.overall_rank_change} /></td>
                        <td className="px-4 py-3 text-sm">{entry.participant_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{entry.directie_name}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">{entry.overall_score}</td>
                        <td className="px-4 py-3 text-sm text-center">{medals.display || '—'}</td>
                      </tr>
                      {expandedItem === entry.participant_name && (
                        <tr className="bg-gray-100">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="ml-8 max-w-md">
                              <h3 className="text-sm font-semibold mb-2 pb-2 text-gray-600 border-b">Punten per Etappe</h3>
                              {getParticipantStages(leaderboardsData, entry.participant_name).map((stage) => (
                                <div key={stage.stageKey} className="flex justify-between py-1 px-2 rounded hover:bg-gray-200">
                                  <span className="text-sm text-gray-600">Etappe {stage.stageNum}:</span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-tdf-text-secondary">#{stage.stage_rank}</span>
                                    <span className="text-sm font-bold">{stage.stage_score}</span>
                                  </div>
                                </div>
                              ))}
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

      {/* DIRECTIE KLASSEMENT VIEW */}
      {activeView === 'standings_directie' && (
        <main>
          <h2 className="text-xl sm:text-2xl font-semibold mb-2 sm:mb-4 text-tdf-primary">Directie Klassement</h2>
          <p className="text-xs sm:text-sm mb-4 sm:mb-6 text-gray-600">
            Gemiddelde van de top {metadata.top_n_participants_for_directie} deelnemers per directie
          </p>

          <div className="block lg:hidden space-y-2">
            {(filteredResults as DirectieEntry[]).map((entry) => (
              <div key={entry.directie_name} className="bg-white rounded-lg shadow-md overflow-hidden">
                <div
                  onClick={() => toggleItemDetails(entry.directie_name)}
                  className="p-3 cursor-pointer active:bg-tdf-bg"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center justify-center min-w-[50px]">
                      <div className="text-lg font-bold text-tdf-text-primary">#{directieOverallRankMap.get(entry.directie_name) ?? entry.overall_rank}</div>
                      <div className="text-xs"><RankChange change={entry.overall_rank_change} /></div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-tdf-text-primary truncate">{entry.directie_name}</div>
                    </div>
                    
                    <div className="text-right min-w-[60px]">
                      <div className="text-lg font-bold text-tdf-primary">{entry.overall_score.toFixed(1)}</div>
                    </div>
                  </div>
                </div>

                {expandedItem === entry.directie_name && (
                  <div className="px-3 pb-3 bg-tdf-bg border-t border-gray-200">
                    <div className="pt-3">
                      <h3 className="text-xs font-semibold mb-2 text-gray-600">Totale Bijdragen per Deelnemer</h3>
                      {entry.overall_participant_contributions.map((participant, pidx) => (
                        <div key={participant.participant_name} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-xs font-semibold text-tdf-text-secondary">#{pidx + 1}</span>
                            <span className="text-sm text-gray-700 truncate">{participant.participant_name}</span>
                          </div>
                          <span className="text-sm font-bold text-tdf-text-primary">{participant.overall_score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-200">
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Positie</th>
                  <th className="px-4 py-4 text-center text-sm font-semibold text-gray-600">+/-</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Directie</th>
                  <th className="px-4 py-4 text-right text-sm font-semibold text-gray-600">Totaal Punten</th>
                </tr>
              </thead>
              <tbody>
                {(filteredResults as DirectieEntry[]).map((entry, idx) => (
                  <React.Fragment key={entry.directie_name}>
                    <tr
                      className={`cursor-pointer hover:bg-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-tdf-bg'}`}
                      onClick={() => toggleItemDetails(entry.directie_name)}
                    >
                      <td className="px-4 py-3 text-sm font-medium">{directieOverallRankMap.get(entry.directie_name) ?? entry.overall_rank}</td>
                      <td className="px-4 py-3 text-sm text-center"><RankChange change={entry.overall_rank_change} /></td>
                      <td className="px-4 py-3 text-sm font-medium">{entry.directie_name}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">{entry.overall_score.toFixed(1)}</td>
                    </tr>
                    {expandedItem === entry.directie_name && (
                      <tr className="bg-gray-100">
                        <td colSpan={4} className="px-4 py-4">
                          <div className="ml-8 max-w-2xl">
                            <h3 className="text-sm font-semibold mb-2 pb-2 text-gray-600 border-b">Totale Bijdragen per Deelnemer</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {entry.overall_participant_contributions.map((participant, pidx) => (
                                <div
                                  key={participant.participant_name}
                                  className="flex justify-between items-center py-2 px-3 rounded hover:bg-gray-200"
                                >
                                  <span className="text-sm flex items-center gap-2 text-gray-600">
                                    <span className="text-xs font-semibold w-5 text-gray-400">#{pidx + 1}</span>
                                    {participant.participant_name}
                                  </span>
                                  <span className="text-sm font-bold">{participant.overall_score}</span>
                                </div>
                              ))}
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
        </main>
      )}
    </div>
  );
}

export default HomePage;