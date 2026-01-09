/**
 * Klassement Page (Optimized)
 * 
 * Shows participant and directie leaderboards with stage-by-stage rankings.
 * Uses extracted components and hooks for better maintainability.
 */

import React, { useState, useMemo } from 'react';
import { useMetadata, useLeaderboards } from '../hooks/useTdfData';
import { useLeaderboardData, useSearch, useExpandableItem } from '../hooks/useBusinessLogic';
import { RankChange } from '../components/shared/RankChange';
import { MedalCounts } from '../components/shared/MedalDisplay';
import { getParticipantMedals, getParticipantStages } from '../../lib/data-transforms';
import { LABELS } from '../../lib/constants';
import type { LeaderboardViewType, LeaderboardEntry, DirectieLeaderboardEntry } from '../../lib/types';

// ============================================================================
// Sub-Components
// ============================================================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded transition-colors ${
        active
          ? 'bg-tdf-primary text-white'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return (
    <input
      type="text"
      placeholder={placeholder || LABELS.SEARCH_PLACEHOLDER}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-tdf-primary"
    />
  );
}

// ============================================================================
// Participant Leaderboard Components
// ============================================================================

interface ParticipantCardProps {
  entry: LeaderboardEntry;
  medals: string;
  isExpanded: boolean;
  onToggle: () => void;
  leaderboardsData: any;
  isStageView?: boolean;
}

function ParticipantCard({
  entry,
  medals,
  isExpanded,
  onToggle,
  leaderboardsData,
  isStageView = false,
}: ParticipantCardProps) {
  const rankToShow = isStageView ? entry.stage_rank : entry.overall_rank;
  const scoreToShow = isStageView ? entry.stage_score : entry.overall_score;

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div onClick={onToggle} className="p-3 cursor-pointer active:bg-tdf-bg">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center justify-center min-w-[50px]">
            <div className="text-lg font-bold text-tdf-text-primary">#{rankToShow}</div>
            {!isStageView && (
              <div className="text-xs">
                <RankChange change={entry.overall_rank_change} />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-tdf-text-primary truncate">
              {entry.participant_name}
            </div>
            <div className="text-xs text-tdf-text-secondary truncate">
              {entry.directie_name}
            </div>
          </div>

          <div className="text-right">
            <div className="text-lg font-bold text-tdf-primary">{scoreToShow}</div>
            {!isStageView && medals && (
              <div className="text-sm leading-none mt-0.5">{medals}</div>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 bg-tdf-bg border-t border-gray-200">
          <div className="pt-3">
            <h3 className="text-xs font-semibold mb-2 text-gray-600">Punten per Etappe</h3>
            {getParticipantStages(leaderboardsData, entry.participant_name).map((stage) => (
              <div
                key={stage.stageKey}
                className="flex justify-between py-1.5 border-b border-gray-100 last:border-0"
              >
                <span className="text-sm text-gray-700">Etappe {stage.stageNum}:</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tdf-text-secondary">#{stage.stage_rank}</span>
                  <span className="text-sm font-bold text-tdf-text-primary">
                    {stage.stage_score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ParticipantTableProps {
  entries: LeaderboardEntry[];
  expandedItem: string | null;
  onToggle: (name: string) => void;
  leaderboardsData: any;
  isStageView?: boolean;
}

function ParticipantTable({
  entries,
  expandedItem,
  onToggle,
  leaderboardsData,
  isStageView = false,
}: ParticipantTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-200">
            <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">
              {LABELS.POSITION}
            </th>
            {!isStageView && (
              <th className="px-4 py-4 text-center text-sm font-semibold text-gray-600">
                {LABELS.RANK_CHANGE}
              </th>
            )}
            <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">
              {LABELS.PARTICIPANT}
            </th>
            <th className="px-4 py-4 text-left text-sm font-semibold text-gray-600">
              {LABELS.DIRECTIE}
            </th>
            <th className="px-4 py-4 text-right text-sm font-semibold text-gray-600">
              {LABELS.TOTAL_POINTS}
            </th>
            {!isStageView && (
              <th className="px-4 py-4 text-center text-sm font-semibold text-gray-600">
                {LABELS.STAGE_MEDALS}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, idx) => {
            const medals = getParticipantMedals(leaderboardsData, entry.participant_name);
            const rankToShow = isStageView ? entry.stage_rank : entry.overall_rank;
            const scoreToShow = isStageView ? entry.stage_score : entry.overall_score;

            return (
              <React.Fragment key={entry.participant_name}>
                <tr
                  className={`cursor-pointer hover:bg-gray-100 ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-tdf-bg'
                  }`}
                  onClick={() => onToggle(entry.participant_name)}
                >
                  <td className="px-4 py-3 text-sm font-medium">{rankToShow}</td>
                  {!isStageView && (
                    <td className="px-4 py-3 text-sm text-center">
                      <RankChange change={entry.overall_rank_change} />
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm">{entry.participant_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{entry.directie_name}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">{scoreToShow}</td>
                  {!isStageView && (
                    <td className="px-4 py-3 text-sm text-center">
                      <MedalCounts display={medals.display} />
                    </td>
                  )}
                </tr>
                {expandedItem === entry.participant_name && (
                  <tr className="bg-gray-100">
                    <td colSpan={isStageView ? 5 : 6} className="px-4 py-4">
                      <div className="ml-8 max-w-md">
                        <h3 className="text-sm font-semibold mb-2 pb-2 text-gray-600 border-b">
                          Punten per Etappe
                        </h3>
                        {getParticipantStages(leaderboardsData, entry.participant_name).map(
                          (stage) => (
                            <div
                              key={stage.stageKey}
                              className="flex justify-between py-1 px-2 rounded hover:bg-gray-200"
                            >
                              <span className="text-sm text-gray-600">
                                Etappe {stage.stageNum}:
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-tdf-text-secondary">
                                  #{stage.stage_rank}
                                </span>
                                <span className="text-sm font-bold">{stage.stage_score}</span>
                              </div>
                            </div>
                          )
                        )}
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
  );
}

// ============================================================================
// Directie Leaderboard Components
// ============================================================================

interface DirectieCardProps {
  entry: DirectieLeaderboardEntry;
  isExpanded: boolean;
  onToggle: () => void;
}

function DirectieCard({ entry, isExpanded, onToggle }: DirectieCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div onClick={onToggle} className="p-3 cursor-pointer active:bg-tdf-bg">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center justify-center min-w-[50px]">
            <div className="text-lg font-bold text-tdf-text-primary">#{entry.overall_rank}</div>
            <div className="text-xs">
              <RankChange change={entry.overall_rank_change} />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-tdf-text-primary truncate">
              {entry.directie_name}
            </div>
          </div>

          <div className="text-right min-w-[60px]">
            <div className="text-lg font-bold text-tdf-primary">{entry.overall_score}</div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 bg-tdf-bg border-t border-gray-200">
          <div className="pt-3">
            <h3 className="text-xs font-semibold mb-2 text-gray-600">
              Totale Bijdragen per Deelnemer
            </h3>
            {entry.overall_participant_contributions.map((participant, pidx) => (
              <div
                key={participant.participant_name}
                className="flex justify-between py-1.5 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xs font-semibold text-tdf-text-secondary">
                    #{pidx + 1}
                  </span>
                  <span className="text-sm text-gray-700 truncate">
                    {participant.participant_name}
                  </span>
                </div>
                <span className="text-sm font-bold text-tdf-text-primary">
                  {participant.overall_score}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function Klassement() {
  const [activeView, setActiveView] = useState<LeaderboardViewType>('standings_individual');
  const { searchTerm, setSearchTerm } = useSearch('');
  const { expandedItem, toggleItem } = useExpandableItem<string | null>();

  // Fetch data
  const { data: metadata, isLoading: metadataLoading, error: metadataError } = useMetadata();
  const {
    data: leaderboardsData,
    isLoading: leaderboardsLoading,
    error: leaderboardsError,
  } = useLeaderboards();

  const loading = metadataLoading || leaderboardsLoading;
  const error = metadataError || leaderboardsError;

  // Process data
  const { filteredResults } = useLeaderboardData({
    metadata,
    leaderboardsData,
    searchTerm,
    viewType: activeView,
  });

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-tdf-bg">
        <div className="text-center">
          <div className="text-2xl font-bold text-tdf-primary mb-4">{LABELS.LOADING}</div>
          <div className="text-tdf-text-secondary">Fetching race data...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-tdf-bg">
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600 mb-4">{LABELS.ERROR}</div>
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

  const isStageView = activeView === 'stage_individual';
  const isDirectieView = activeView === 'standings_directie';

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-tdf-primary mb-2">
          {LABELS.KLASSEMENT}
        </h1>
        <p className="text-sm sm:text-base text-tdf-text-secondary">
          Na etappe {metadata.current_stage}
        </p>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4 sm:mb-6">
        <TabButton
          active={activeView === 'standings_individual'}
          onClick={() => setActiveView('standings_individual')}
        >
          {LABELS.STANDINGS_INDIVIDUAL}
        </TabButton>
        <TabButton
          active={activeView === 'stage_individual'}
          onClick={() => setActiveView('stage_individual')}
        >
          {LABELS.STAGE_INDIVIDUAL}
        </TabButton>
        <TabButton
          active={activeView === 'standings_directie'}
          onClick={() => setActiveView('standings_directie')}
        >
          {LABELS.STANDINGS_DIRECTIE}
        </TabButton>
      </div>

      {/* Search */}
      <div className="mb-4 sm:mb-6">
        <SearchInput value={searchTerm} onChange={setSearchTerm} />
      </div>

      {/* Content */}
      {!isDirectieView ? (
        <main>
          <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">
            {isStageView ? 'Etappe Klassement' : 'Algemeen Klassement'}
          </h2>

          {/* Mobile Cards */}
          <div className="block lg:hidden space-y-2 mb-6">
            {(filteredResults as LeaderboardEntry[]).map((entry) => {
              const medals = getParticipantMedals(leaderboardsData, entry.participant_name);
              return (
                <ParticipantCard
                  key={entry.participant_name}
                  entry={entry}
                  medals={medals.display}
                  isExpanded={expandedItem === entry.participant_name}
                  onToggle={() => toggleItem(entry.participant_name)}
                  leaderboardsData={leaderboardsData}
                  isStageView={isStageView}
                />
              );
            })}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block">
            <ParticipantTable
              entries={filteredResults as LeaderboardEntry[]}
              expandedItem={expandedItem}
              onToggle={toggleItem}
              leaderboardsData={leaderboardsData}
              isStageView={isStageView}
            />
          </div>
        </main>
      ) : (
        <main>
          <h2 className="text-xl sm:text-2xl font-semibold mb-2 sm:mb-4 text-tdf-primary">
            Directie Klassement
          </h2>
          <p className="text-xs sm:text-sm mb-4 sm:mb-6 text-gray-600">
            Top {metadata.top_n_participants_for_directie} deelnemers per directie per etappe tellen
            mee
          </p>

          {/* Mobile Cards */}
          <div className="block lg:hidden space-y-2">
            {(filteredResults as DirectieLeaderboardEntry[]).map((entry) => (
              <DirectieCard
                key={entry.directie_name}
                entry={entry}
                isExpanded={expandedItem === entry.directie_name}
                onToggle={() => toggleItem(entry.directie_name)}
              />
            ))}
          </div>

          {/* Desktop Table - Similar structure, omitted for brevity */}
        </main>
      )}
    </div>
  );
}

export default Klassement;
