import React, { useState, useMemo } from 'react'
import { useMetadata, useLeaderboards } from '../hooks/useTdfData';

interface LeaderboardEntry {
  participant_name: string;
  directie_name: string;
  overall_score: number;
  overall_rank: number;
  overall_rank_change: number;
  stage_score: number;
  stage_rank: number;
  stage_rider_contributions: Record<string, number | undefined>;
}

interface DirectieEntry {
  directie_name: string;
  overall_score: number;
  overall_rank: number;
  overall_rank_change: number;
  stage_score: number;
  stage_rank: number;
  stage_participant_contributions: Array<{ participant_name: string; stage_score: number }>;
  overall_participant_contributions: Array<{ participant_name: string; overall_score: number }>;
}

type ViewType = 'stage_individual' | 'standings_individual' | 'standings_directie';

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

  const stageResults = useMemo(() => {
    return [...currentLeaderboard].sort((a, b) => a.stage_rank - b.stage_rank);
  }, [currentLeaderboard]);

  const filteredResults = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();
    
    if (!searchLower) {
      if (activeView === 'standings_individual') return currentLeaderboard;
      if (activeView === 'stage_individual') return stageResults;
      return currentDirectieLeaderboard;
    }

    if (activeView === 'standings_individual') {
      return currentLeaderboard.filter((p) => 
        p.participant_name.toLowerCase().includes(searchLower) ||
        p.directie_name.toLowerCase().includes(searchLower)
      );
    } else if (activeView === 'stage_individual') {
      return stageResults.filter((r) => 
        r.participant_name.toLowerCase().includes(searchLower) ||
        r.directie_name.toLowerCase().includes(searchLower)
      );
    } else {
      return currentDirectieLeaderboard.filter((d) => 
        d.directie_name.toLowerCase().includes(searchLower) ||
        d.overall_participant_contributions.some((cp: { participant_name: string }) => 
          cp.participant_name.toLowerCase().includes(searchLower)
        )
      );
    }
  }, [activeView, searchTerm, stageResults, currentDirectieLeaderboard, currentLeaderboard]);

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

  const renderRankChange = (rankChange: number) => {
    if (rankChange > 0) {
      return <span className="font-semibold text-green-600">↑{rankChange}</span>;
    }
    if (rankChange < 0) {
      return <span className="font-semibold text-red-600">↓{Math.abs(rankChange)}</span>;
    }
    return <span className="text-gray-400">—</span>;
  };

  const renderMedal = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  };

  const toggleItemDetails = (itemName: string) => {
    setExpandedItem(prev => prev === itemName ? null : itemName);
  };

  const getParticipantStages = (participantName: string) => {
    if (!leaderboardsData) return [];
    
    const allStages: Array<{ stageNum: number; stageKey: string; stage_score: number; stage_rank: number }> = [];
    Object.entries(leaderboardsData.leaderboard_by_stage).forEach(([stageKey, stageData]) => {
      const participantEntry = stageData.find(p => p.participant_name === participantName);
      if (participantEntry) {
        allStages.push({
          stageNum: parseInt(stageKey.replace('stage_', '')),
          stageKey,
          stage_score: participantEntry.stage_score,
          stage_rank: participantEntry.stage_rank
        });
      }
    });
    return allStages.sort((a, b) => a.stageNum - b.stageNum);
  };

  const getParticipantMedals = (participantName: string) => {
    if (!leaderboardsData) return '';
    
    let goldCount = 0, silverCount = 0, bronzeCount = 0;
    Object.values(leaderboardsData.leaderboard_by_stage).forEach((stageData) => {
      const participantEntry = stageData.find(p => p.participant_name === participantName);
      if (participantEntry) {
        if (participantEntry.stage_rank === 1) goldCount++;
        else if (participantEntry.stage_rank === 2) silverCount++;
        else if (participantEntry.stage_rank === 3) bronzeCount++;
      }
    });
    const medals = [];
    if (goldCount > 0) medals.push('🥇'.repeat(goldCount));
    if (silverCount > 0) medals.push('🥈'.repeat(silverCount));
    if (bronzeCount > 0) medals.push('🥉'.repeat(bronzeCount));
    return medals.join('');
  };

  return (
    <div className="min-h-screen py-4 px-4 sm:px-6 lg:px-32 bg-tdf-bg">
      <header className="mb-6 sm:mb-12 text-center">
        <h1 className="text-2xl sm:text-3xl lg:text-5xl font-bold text-tdf-primary">
          Klassement
        </h1>
      </header>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView('stage_individual')}
            className={`flex-1 py-3 px-2 rounded-lg font-semibold transition-all text-xs sm:text-sm lg:text-base ${
              activeView === 'stage_individual'
                ? 'bg-tdf-accent text-white border-2 border-yellow-500'
                : 'bg-gray-200 text-gray-700 border-2 border-transparent'
            }`}
          >
            Etappe
          </button>
          <button
            onClick={() => setActiveView('standings_individual')}
            className={`flex-1 py-3 px-2 rounded-lg font-semibold transition-all text-xs sm:text-sm lg:text-base ${
              activeView === 'standings_individual'
                ? 'bg-tdf-accent text-white border-2 border-yellow-500'
                : 'bg-gray-200 text-gray-700 border-2 border-transparent'
            }`}
          >
            Individueel
          </button>
          <button
            onClick={() => setActiveView('standings_directie')}
            className={`flex-1 py-3 px-2 rounded-lg font-semibold transition-all text-xs sm:text-sm lg:text-base ${
              activeView === 'standings_directie'
                ? 'bg-tdf-accent text-white border-2 border-yellow-500'
                : 'bg-gray-200 text-gray-700 border-2 border-transparent'
            }`}
          >
            Directie
          </button>
        </div>

        <div className="relative w-full">
          <input
            type="text"
            placeholder="Zoek deelnemer of directie..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 pr-10 rounded-lg bg-white border-2 border-gray-300 text-tdf-text-primary focus:border-yellow-500 text-sm sm:text-base"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              aria-label="Clear search"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {activeView === 'stage_individual' && (
        <main>
          <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">
            Etappe {currentStageNum} Resultaten
          </h2>

          <div className="block lg:hidden space-y-2">
            {(filteredResults as LeaderboardEntry[]).map((entry) => {
              const sortedRiders = Object.entries(entry.stage_rider_contributions)
                .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
              const medal = renderMedal(entry.stage_rank);

              return (
                <div key={entry.participant_name} className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div
                    onClick={() => toggleItemDetails(entry.participant_name)}
                    className="p-3 cursor-pointer active:bg-tdf-bg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center justify-center min-w-[50px]">
                        <div className="text-lg font-bold text-tdf-text-primary">#{entry.stage_rank}</div>
                        {medal && <div className="text-xl leading-none">{medal}</div>}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-tdf-text-primary truncate">{entry.participant_name}</div>
                        <div className="text-xs text-tdf-text-secondary truncate">{entry.directie_name}</div>
                      </div>
                      
                      <div className="text-right min-w-[60px]">
                        <div className="text-lg font-bold text-tdf-primary">{entry.stage_score}</div>
                        <div className="text-xs text-tdf-text-secondary">Alg. #{entry.overall_rank}</div>
                      </div>
                    </div>
                  </div>

                  {expandedItem === entry.participant_name && (
                    <div className="px-3 pb-3 bg-tdf-bg border-t border-gray-200">
                      <div className="pt-3">
                        <h3 className="text-xs font-semibold mb-2 text-gray-600">Renner Bijdragen</h3>
                        {sortedRiders.map(([rider, points]) => (
                          <div key={rider} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
                            <span className="text-sm text-gray-700">{rider}</span>
                            <span className="text-sm font-bold text-tdf-text-primary">{points}</span>
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
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Deelnemer</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">Directie</th>
                  <th className="px-4 py-4 text-right text-sm font-semibold text-gray-600">Punten</th>
                  <th className="px-4 py-4 text-center text-sm font-semibold text-gray-600">Alg. kl.</th>
                </tr>
              </thead>
              <tbody>
                {(filteredResults as LeaderboardEntry[]).map((entry, idx) => {
                  const sortedRiders = Object.entries(entry.stage_rider_contributions)
                    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));

                  return (
                    <React.Fragment key={entry.participant_name}>
                      <tr
                        className={`cursor-pointer hover:bg-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-tdf-bg'}`}
                        onClick={() => toggleItemDetails(entry.participant_name)}
                      >
                        <td className="px-4 py-3 text-sm font-medium">
                          {entry.stage_rank}{renderMedal(entry.stage_rank)}
                        </td>
                        <td className="px-4 py-3 text-sm">{entry.participant_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{entry.directie_name}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">{entry.stage_score}</td>
                        <td className="px-4 py-3 text-sm text-center text-gray-600">#{entry.overall_rank}</td>
                      </tr>
                      {expandedItem === entry.participant_name && (
                        <tr className="bg-gray-100">
                          <td colSpan={5} className="px-4 py-4">
                            <div className="ml-8 max-w-md">
                              <h3 className="text-sm font-semibold mb-2 pb-2 text-gray-600 border-b">Renner Bijdragen</h3>
                              {sortedRiders.map(([rider, points]) => (
                                <div key={rider} className="flex justify-between py-1 px-2 rounded hover:bg-gray-200">
                                  <span className="text-sm text-gray-600">{rider}</span>
                                  <span className="text-sm font-bold">{points}</span>
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

      {activeView === 'standings_individual' && (
        <main>
          <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">Algemeen Klassement</h2>

          <div className="block lg:hidden space-y-2">
            {(filteredResults as LeaderboardEntry[]).map((entry) => {
              const medals = getParticipantMedals(entry.participant_name);

              return (
                <div key={entry.participant_name} className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div
                    onClick={() => toggleItemDetails(entry.participant_name)}
                    className="p-3 cursor-pointer active:bg-tdf-bg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center justify-center min-w-[50px]">
                        <div className="text-lg font-bold text-tdf-text-primary">#{entry.overall_rank}</div>
                        <div className="text-xs">{renderRankChange(entry.overall_rank_change)}</div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-tdf-text-primary truncate">{entry.participant_name}</div>
                        <div className="text-xs text-tdf-text-secondary truncate">{entry.directie_name}</div>
                      </div>
                      
                      <div className="text-right min-w-[60px]">
                        <div className="text-lg font-bold text-tdf-primary">{entry.overall_score}</div>
                        {medals && <div className="text-sm leading-none mt-0.5">{medals}</div>}
                      </div>
                    </div>
                  </div>

                  {expandedItem === entry.participant_name && (
                    <div className="px-3 pb-3 bg-tdf-bg border-t border-gray-200">
                      <div className="pt-3">
                        <h3 className="text-xs font-semibold mb-2 text-gray-600">Punten per Etappe</h3>
                        {getParticipantStages(entry.participant_name).map((stage) => (
                          <div key={stage.stageKey} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
                            <span className="text-sm text-gray-700">Etappe {stage.stageNum}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-tdf-text-secondary">#{stage.stage_rank}</span>
                              <span className="text-sm font-bold text-tdf-text-primary">{stage.stage_score}</span>
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
                  const medals = getParticipantMedals(entry.participant_name);

                  return (
                    <React.Fragment key={entry.participant_name}>
                      <tr
                        className={`cursor-pointer hover:bg-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-tdf-bg'}`}
                        onClick={() => toggleItemDetails(entry.participant_name)}
                      >
                        <td className="px-4 py-3 text-sm font-medium">{entry.overall_rank}</td>
                        <td className="px-4 py-3 text-sm text-center">{renderRankChange(entry.overall_rank_change)}</td>
                        <td className="px-4 py-3 text-sm">{entry.participant_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{entry.directie_name}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">{entry.overall_score}</td>
                        <td className="px-4 py-3 text-sm text-center">{medals || ''}</td>
                      </tr>
                      {expandedItem === entry.participant_name && (
                        <tr className="bg-gray-100">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="ml-8 max-w-md">
                              <h3 className="text-sm font-semibold mb-2 pb-2 text-gray-600 border-b">Punten per Etappe</h3>
                              {getParticipantStages(entry.participant_name).map((stage) => (
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

      {activeView === 'standings_directie' && (
        <main>
          <h2 className="text-xl sm:text-2xl font-semibold mb-2 sm:mb-4 text-tdf-primary">Directie Klassement</h2>
          <p className="text-xs sm:text-sm mb-4 sm:mb-6 text-gray-600">
            Top {metadata.top_n_participants_for_directie} deelnemers per directie per etappe tellen mee
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
                      <div className="text-lg font-bold text-tdf-text-primary">#{entry.overall_rank}</div>
                      <div className="text-xs">{renderRankChange(entry.overall_rank_change)}</div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-tdf-text-primary truncate">{entry.directie_name}</div>
                    </div>
                    
                    <div className="text-right min-w-[60px]">
                      <div className="text-lg font-bold text-tdf-primary">{entry.overall_score}</div>
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
                      <td className="px-4 py-3 text-sm font-medium">{entry.overall_rank}</td>
                      <td className="px-4 py-3 text-sm text-center">{renderRankChange(entry.overall_rank_change)}</td>
                      <td className="px-4 py-3 text-sm font-medium">{entry.directie_name}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">{entry.overall_score}</td>
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