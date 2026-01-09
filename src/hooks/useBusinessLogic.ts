/**
 * Custom Hooks for Business Logic
 * 
 * Extracts complex logic from components into reusable hooks.
 */

import { useMemo, useState, useCallback } from 'react';
import type {
  LeaderboardsData,
  RidersData,
  TeamSelectionsData,
  Metadata,
} from '../../lib/types';
import {
  filterLeaderboardEntries,
  matchesSearch,
  createRiderRankMap,
  calculateSelectionCounts,
  calculateSelectionPercentage,
} from '../../lib/data-transforms';

// ============================================================================
// Leaderboard Data Hook
// ============================================================================

interface UseLeaderboardDataOptions {
  metadata: Metadata | undefined;
  leaderboardsData: LeaderboardsData | undefined;
  searchTerm: string;
  viewType: 'stage_individual' | 'standings_individual' | 'standings_directie';
}

export function useLeaderboardData({
  metadata,
  leaderboardsData,
  searchTerm,
  viewType,
}: UseLeaderboardDataOptions) {
  // Current leaderboards
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

  // Stage results (sorted by stage rank)
  const stageResults = useMemo(() => {
    return [...currentLeaderboard].sort((a, b) => a.stage_rank - b.stage_rank);
  }, [currentLeaderboard]);

  // Filtered results based on view and search
  const filteredResults = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();

    if (!searchLower) {
      if (viewType === 'standings_individual') return currentLeaderboard;
      if (viewType === 'stage_individual') return stageResults;
      return currentDirectieLeaderboard;
    }

    if (viewType === 'standings_individual') {
      return filterLeaderboardEntries(currentLeaderboard, searchTerm);
    } else if (viewType === 'stage_individual') {
      return filterLeaderboardEntries(stageResults, searchTerm);
    } else {
      return currentDirectieLeaderboard.filter(
        (d) =>
          matchesSearch(d.directie_name, searchTerm) ||
          d.overall_participant_contributions.some((cp) =>
            matchesSearch(cp.participant_name, searchTerm)
          )
      );
    }
  }, [
    viewType,
    searchTerm,
    currentLeaderboard,
    stageResults,
    currentDirectieLeaderboard,
  ]);

  return {
    currentLeaderboard,
    currentDirectieLeaderboard,
    stageResults,
    filteredResults,
  };
}

// ============================================================================
// Rider Rankings Hook
// ============================================================================

interface UseRiderRankingsOptions {
  ridersData: RidersData | undefined;
  metadata: Metadata | undefined;
  searchTerm: string;
  viewType: 'stage' | 'total' | 'team';
}

export function useRiderRankings({
  ridersData,
  metadata,
  searchTerm,
  viewType,
}: UseRiderRankingsOptions) {
  // Convert to array and filter out riders with no points
  const ridersArray = useMemo(() => {
    if (!ridersData) return [];

    return Object.entries(ridersData)
      .map(([name, riderData]) => ({
        name,
        team: riderData.team || 'Onbekend Team',
        total_points: riderData.total_points,
        stages: riderData.stages,
      }))
      .filter((rider) => rider.total_points > 0);
  }, [ridersData]);

  // Current stage key
  const currentStageKey = useMemo(() => {
    return metadata ? `stage_${metadata.current_stage}` : 'stage_1';
  }, [metadata]);

  // Stage rankings
  const stageRankings = useMemo(() => {
    return ridersArray
      .map((rider) => {
        const stageData = rider.stages[currentStageKey];
        return {
          ...rider,
          stage_points: stageData?.stage_total || 0,
          stage_data: stageData,
        };
      })
      .filter((rider) => rider.stage_points > 0)
      .sort((a, b) => b.stage_points - a.stage_points);
  }, [ridersArray, currentStageKey]);

  // Total rankings
  const totalRankings = useMemo(() => {
    return [...ridersArray]
      .sort((a, b) => b.total_points - a.total_points)
      .map((rider, index) => ({
        ...rider,
        overall_rank: index + 1,
      }));
  }, [ridersArray]);

  // Rank map for quick lookups
  const riderRankMap = useMemo(() => {
    if (!ridersData) return {};
    return createRiderRankMap(ridersData);
  }, [ridersData]);

  // Filtered results
  const filteredResults = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();
    const dataToFilter = viewType === 'stage' ? stageRankings : totalRankings;

    if (!searchLower) return dataToFilter;

    return dataToFilter.filter(
      (rider) =>
        matchesSearch(rider.name, searchTerm) ||
        matchesSearch(rider.team, searchTerm)
    );
  }, [viewType, searchTerm, stageRankings, totalRankings]);

  return {
    stageRankings,
    totalRankings,
    riderRankMap,
    filteredResults,
  };
}

// ============================================================================
// Team Selections Hook
// ============================================================================

interface UseTeamSelectionsOptions {
  ridersData: RidersData | undefined;
  teamSelectionsData: TeamSelectionsData | undefined;
  searchTerm: string;
}

export function useTeamSelections({
  ridersData,
  teamSelectionsData,
  searchTerm,
}: UseTeamSelectionsOptions) {
  const totalParticipants = useMemo(() => {
    return teamSelectionsData ? Object.keys(teamSelectionsData).length : 0;
  }, [teamSelectionsData]);

  // Calculate selection counts
  const selectionCounts = useMemo(() => {
    if (!teamSelectionsData) return {};
    return calculateSelectionCounts(teamSelectionsData);
  }, [teamSelectionsData]);

  // Rider rank map
  const riderRankMap = useMemo(() => {
    if (!ridersData) return {};
    return createRiderRankMap(ridersData);
  }, [ridersData]);

  // Find selected participant
  const selectedParticipant = useMemo(() => {
    if (!teamSelectionsData || !searchTerm) return null;

    const entry = Object.entries(teamSelectionsData).find(
      ([name, data]) =>
        matchesSearch(name, searchTerm) ||
        matchesSearch(data.directie_name, searchTerm)
    );

    if (!entry) return null;

    const [name, data] = entry;
    return {
      name,
      team: data.riders,
    };
  }, [teamSelectionsData, searchTerm]);

  // Popularity rankings (all riders sorted by selection count)
  const popularityRankings = useMemo(() => {
    if (!ridersData) return [];

    return Object.entries(ridersData)
      .map(([name, riderData]) => ({
        name,
        team: riderData.team || 'Onbekend Team',
        total_points: riderData.total_points,
        stages: riderData.stages,
        selection_count: selectionCounts[name] || 0,
        selection_percentage: calculateSelectionPercentage(
          selectionCounts[name] || 0,
          totalParticipants
        ),
      }))
      .filter((rider) => rider.selection_count > 0)
      .sort((a, b) => b.selection_count - a.selection_count);
  }, [ridersData, selectionCounts, totalParticipants]);

  // Participant team rankings (selected team sorted by popularity)
  const participantTeamRankings = useMemo(() => {
    if (!selectedParticipant || !ridersData) return [];

    return selectedParticipant.team
      .map((riderName) => ({
        name: riderName,
        team: ridersData[riderName]?.team || 'Onbekend Team',
        total_points: ridersData[riderName]?.total_points || 0,
        stages: ridersData[riderName]?.stages || {},
        selection_count: selectionCounts[riderName] || 0,
        selection_percentage: calculateSelectionPercentage(
          selectionCounts[riderName] || 0,
          totalParticipants
        ),
      }))
      .sort((a, b) => b.selection_count - a.selection_count);
  }, [selectedParticipant, ridersData, selectionCounts, totalParticipants]);

  return {
    totalParticipants,
    selectionCounts,
    riderRankMap,
    selectedParticipant,
    popularityRankings,
    participantTeamRankings,
    displayData: selectedParticipant
      ? participantTeamRankings
      : popularityRankings,
  };
}

// ============================================================================
// Search Hook
// ============================================================================

export function useSearch(initialValue: string = '') {
  const [searchTerm, setSearchTerm] = useState(initialValue);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  return {
    searchTerm,
    setSearchTerm: handleSearchChange,
    clearSearch,
  };
}

// ============================================================================
// Expandable Item Hook
// ============================================================================

export function useExpandableItem<T extends string | null = string | null>(
  initialValue: T = null as T
) {
  const [expandedItem, setExpandedItem] = useState<T>(initialValue);

  const toggleItem = useCallback((itemId: T) => {
    setExpandedItem((prev) => (prev === itemId ? (null as T) : itemId));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedItem(null as T);
  }, []);

  const isExpanded = useCallback(
    (itemId: T) => {
      return expandedItem === itemId;
    },
    [expandedItem]
  );

  return {
    expandedItem,
    toggleItem,
    collapseAll,
    isExpanded,
  };
}