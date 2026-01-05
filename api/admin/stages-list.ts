import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[API] Fetching all stages list');
    
    const { data: stages, error } = await supabase
      .from('stages')
      .select('id, stage_number, date, departure_city, arrival_city, is_complete')
      .order('stage_number');

    if (error) {
      console.error('[API] Error fetching stages:', error);
      return res.status(500).json({ error: 'Failed to fetch stages', details: error });
    }

    console.log('[API] Found stages:', stages?.length);
    return res.status(200).json(stages || []);
  } catch (error: any) {
    console.error('[API] Error fetching stages:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}