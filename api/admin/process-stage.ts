/**
 * Reprocess + republish endpoint (WP-A2: thin wrapper over lib/pipeline).
 *
 * For stages whose result rows are already in the DB (e.g. after the
 * fixture import script, or to force-recompute an earlier stage). Normal
 * entry goes through /api/admin/enter-stage.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../../lib/require-admin.js';
import { processStage } from '../../lib/pipeline.js';
import { getServiceClient } from '../../lib/supabase-server.js';
import type { ProcessStageRequest } from '../../lib/types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!(await requireAdmin(req, res))) return;

  try {
    const { stage_number, force }: ProcessStageRequest = req.body;
    if (!stage_number) {
      return res.status(400).json({ success: false, error: 'stage_number is required' });
    }

    const supabase = getServiceClient();
    const { data: existingStage } = await supabase
      .from('stages')
      .select('is_complete')
      .eq('stage_number', stage_number)
      .single();

    if (existingStage?.is_complete && !force) {
      return res.status(200).json({
        success: true,
        message: `Etappe ${stage_number} is al verwerkt (gebruik force om te herberekenen)`,
      });
    }

    const result = await processStage(stage_number);

    return res.status(200).json({
      success: true,
      data: {
        stage_number: result.stageNumber,
        dns_riders: result.selections.dnsRiders,
        substitutions: result.selections.substitutions,
        run_id: result.runId,
      },
      message: `Etappe ${stage_number} verwerkt en gepubliceerd`,
    });
  } catch (error: any) {
    console.error('[Process Stage] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Er is een serverfout opgetreden',
    });
  }
}
