/**
 * Riders List API (Optimized)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../../lib/require-admin.js';
import { getServiceClient } from '../../lib/supabase-server.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const supabase = getServiceClient();
    const { data: riders, error } = await supabase
      .from('riders')
      .select('id, name, team')
      .order('name');

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch riders',
        details: error
      });
    }

    // Aliases ride along so client-side matching (paste + PCS-prefill)
    // resolves the same alternative spellings the server accepts at entry
    // time. Best-effort: without them matching still works, only worse.
    const { data: aliases, error: aliasError } = await supabase
      .from('rider_aliases')
      .select('alias, rider_id');
    if (aliasError) {
      console.error('[Riders List] rider_aliases niet beschikbaar:', aliasError.message);
    }
    const aliasesByRider = new Map<string, string[]>();
    for (const row of aliases ?? []) {
      const list = aliasesByRider.get(row.rider_id) ?? [];
      list.push(row.alias);
      aliasesByRider.set(row.rider_id, list);
    }

    return res.status(200).json({
      success: true,
      data: (riders || []).map((r) => ({
        ...r,
        aliases: aliasesByRider.get(r.id) ?? [],
      }))
    });
  } catch (error: any) {
    console.error('[API] Error fetching riders:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error.message 
    });
  }
}