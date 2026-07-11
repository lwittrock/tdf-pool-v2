/**
 * Data Refresh Hook
 * 
 * Simple hook to refresh all TdF data after processing a new stage.
 * No page reload needed - smooth user experience.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Hook for refreshing all TdF data
 * 
 * @returns Object with refreshAll function and loading state
 * 
 * @example
 * function AdminPanel() {
 *   const { refreshAll, isRefreshing } = useRefreshTdfData();
 *   
 *   const handleProcessStage = async () => {
 *     // ... process stage
 *     await refreshAll();  // Refresh all data
 *   };
 *   
 *   return (
 *     <button onClick={handleProcessStage} disabled={isRefreshing}>
 *       {isRefreshing ? 'Verwerken...' : 'Verwerk Etappe'}
 *     </button>
 *   );
 * }
 */
export function useRefreshTdfData() {
  const queryClient = useQueryClient();

  /**
   * Refresh all TdF data (metadata, leaderboards, riders, stages, team selections)
   */
  const refreshAll = useCallback(async () => {
    // Re-fetch the pointer; data queries are keyed on run_id and follow it.
    await queryClient.invalidateQueries({ queryKey: ['snapshot-pointer'] });
    await queryClient.invalidateQueries({ queryKey: ['snapshot'] });
  }, [queryClient]);

  /**
   * Check if any queries are currently fetching
   */
  const isRefreshing = queryClient.isFetching() > 0;

  return {
    refreshAll,
    isRefreshing,
  };
}