/**
 * Atomic stage entry endpoint (WP-A2).
 *
 * The single authenticated call behind "Opslaan & Verwerken":
 * validate → log → transactional swap → recalculate → regenerate → publish.
 * maxDuration is raised to 300s in vercel.json (belt and braces, F10).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../../lib/require-admin.js';
import { enterStage } from '../../lib/enter-stage.js';
import type { ManualStageEntry } from '../../lib/types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const identity = await requireAdmin(req, res);
  if (!identity) return;

  const submittedBy = identity.kind === 'user' ? identity.email : identity.kind;

  try {
    const entry = req.body as ManualStageEntry;
    const result = await enterStage(entry, submittedBy);

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        error: 'Invoer niet verwerkt',
        validation_errors: result.errors,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        stage_number: result.stageNumber,
        winning_team: result.winningTeam,
        warnings: result.warnings,
        dns_riders: result.process.selections.dnsRiders,
        substitutions: result.process.selections.substitutions,
        run_id: result.process.runId,
      },
    });
  } catch (error: any) {
    console.error('[Enter Stage] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Er is een serverfout opgetreden',
    });
  }
}
