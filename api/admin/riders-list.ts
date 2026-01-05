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
    const { data: riders, error } = await supabase
      .from('riders')
      .select('id, name, team')
      .order('name');

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch riders', details: error });
    }

    return res.status(200).json(riders || []);
  } catch (error: any) {
    console.error('[API] Error fetching riders:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}