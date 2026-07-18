/**
 * Stage prefill endpoint: fetch + parse the PCS pages for one stage and
 * return RAW results for the entry form to prefill.
 *
 * Read-only by design — no DB writes, nothing submitted. Name/team matching
 * happens client-side with the same matcher as the paste flow, and the
 * admin reviews everything before "Opslaan & Verwerken" (which validates
 * server-side against riders + aliases as always). A wrong or changed PCS
 * page can therefore cost an empty field, never corrupt standings.
 *
 * The stage page is required; the complementary page (Dagploeg,
 * combativity) and the race-level combative-riders page are best-effort —
 * their absence appears in `warnings`, the rest of the form still fills.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../../lib/require-admin.js';
import { fetchPcsPage, PcsFetchError } from '../../lib/pcs-fetch.js';
import {
  parsePcsStagePage,
  parsePcsComplementaryPage,
  parsePcsCombativeRiders,
  pcsStageUrl,
  pcsComplementaryUrl,
  pcsCombativeRidersUrl,
} from '../../lib/pcs-parse.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!(await requireAdmin(req, res))) return;

  const stage = Number(req.query.stage);
  if (!Number.isInteger(stage) || stage < 1 || stage > 21) {
    return res
      .status(400)
      .json({ success: false, error: 'Ongeldige etappe (1–21 verwacht)' });
  }

  const season = process.env.SEASON || '2026';
  const stageUrl = pcsStageUrl(season, stage);
  const complementaryUrl = pcsComplementaryUrl(season, stage);
  const combativeUrl = pcsCombativeRidersUrl(season);
  const warnings: string[] = [];

  // All three pages in parallel: wall time = one fetch, which matters
  // inside the function's maxDuration. Only the stage page is required.
  const [stageResult, complementary, combative] = await Promise.allSettled([
    fetchPcsPage(stageUrl),
    fetchPcsPage(complementaryUrl).then(parsePcsComplementaryPage),
    fetchPcsPage(combativeUrl).then(parsePcsCombativeRiders),
  ]);

  if (stageResult.status === 'rejected') {
    const error = stageResult.reason;
    const kind = error instanceof PcsFetchError ? error.kind : 'network';
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[Prefill Stage] stage page fetch failed:', detail);
    return res.status(502).json({
      success: false,
      error:
        kind === 'blocked'
          ? 'PCS blokkeert de server (Cloudflare). Gebruik de plak-invoer, of configureer PCS_FETCH_PROXY.'
          : `PCS-pagina niet bereikbaar: ${detail}`,
    });
  }

  const stagePage = parsePcsStagePage(stageResult.value);
  if (stagePage.is_ttt) {
    warnings.push('Ploegentijdrit: PCS heeft geen individuele top-20 — vul de uitslag handmatig in.');
  } else if (stagePage.top20.length === 0) {
    warnings.push('Geen uitslag gevonden op de PCS-pagina (nog niet binnen, of gewijzigde opmaak).');
  } else if (stagePage.top20.length < 20) {
    warnings.push(`Slechts ${stagePage.top20.length} posities gevonden op de PCS-pagina.`);
  }
  // A hole in the rank sequence means a result row didn't parse — every
  // position below it would silently shift. Loudly refuse to pretend.
  if (stagePage.top20.some((row) => row.rank !== row.position)) {
    warnings.push(
      'PCS-ranglijst is niet doorlopend (rij niet herkend?) — controleer ALLE posities.'
    );
  }

  let teamDayWinner: string | null = null;
  let combativity: string | null = null;
  let sectionsFound: string[] = [];
  if (complementary.status === 'fulfilled') {
    teamDayWinner = complementary.value.team_day_winner;
    combativity = complementary.value.combativity;
    sectionsFound = complementary.value.sections_found;
    if (!teamDayWinner) {
      warnings.push('Dagploeg niet gevonden in de complementary results — vul handmatig in.');
    }
  } else {
    warnings.push('Complementary results (Dagploeg) niet opgehaald — vul handmatig in.');
  }
  if (!combativity && combative.status === 'fulfilled') {
    combativity = combative.value.get(stage) ?? null;
  }
  if (!combativity) {
    warnings.push('Strijdlust nog niet gevonden (komt vaak pas later online).');
  }

  return res.status(200).json({
    success: true,
    data: {
      stage_number: stage,
      top20: stagePage.top20,
      jerseys: stagePage.jerseys,
      abandons: stagePage.abandons,
      won_how: stagePage.won_how,
      team_day_winner: teamDayWinner,
      combativity,
      warnings,
      diagnostics: {
        stage_url: stageUrl,
        complementary_url: complementaryUrl,
        tabs_found: stagePage.tabs_found,
        sections_found: sectionsFound,
      },
    },
  });
}
