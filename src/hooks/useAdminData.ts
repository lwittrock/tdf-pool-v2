/**
 * Admin data hooks (WP-A2, R13).
 *
 * The entry UI must NOT read riders from the public snapshot: riders.json
 * only contains riders that already scored points, so before stage 1 the
 * autocomplete would be empty and zero-scorers would be unselectable
 * (fact 23). The admin API returns the full riders table.
 */

import { useQuery } from '@tanstack/react-query';
import { getAdminAuthHeaders } from '../lib/adminAuth';

export interface AdminRider {
  id: string;
  name: string;
  team: string;
  /** Alternative spellings (rider_aliases) — used by client-side matching. */
  aliases?: string[];
}

export function useAdminRiders(enabled: boolean) {
  return useQuery<AdminRider[]>({
    queryKey: ['admin-riders'],
    queryFn: async () => {
      const response = await fetch('/api/admin/riders-list', {
        headers: await getAdminAuthHeaders(),
      });
      if (response.status === 401 || response.status === 403) {
        throw new Error('Geen toegang: log opnieuw in');
      }
      if (!response.ok) {
        throw new Error(`Renners laden mislukt (${response.status})`);
      }
      const body = (await response.json()) as { data?: AdminRider[] };
      return body.data ?? [];
    },
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
