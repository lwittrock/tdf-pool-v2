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
    await queryClient.invalidateQueries({ queryKey: ['metadata'] });
    await queryClient.invalidateQueries({ queryKey: ['leaderboards'] });
    await queryClient.invalidateQueries({ queryKey: ['riders'] });
    await queryClient.invalidateQueries({ queryKey: ['stagesData'] });
    await queryClient.invalidateQueries({ queryKey: ['teamSelections'] });
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