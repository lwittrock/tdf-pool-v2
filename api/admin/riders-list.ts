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
    const { data: riders, error } = await getServiceClient()
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

    return res.status(200).json({
      success: true,
      data: riders || []
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