/**
 * Capture real PCS pages as test fixtures AND smoke-test the prefill chain.
 *
 *   npm run pcs:fixtures -- 12          # capture + parse stage 12
 *   npm run pcs:fixtures -- 12 13 14    # multiple stages
 *
 * Run this from a network where PCS is reachable (home connection works;
 * datacenters may hit the Cloudflare wall — that outcome is exactly what
 * this script diagnoses, so run it BEFORE trusting the /admin prefill
 * button on Vercel). Captured pages land in tests/fixtures/pcs/real-*.html,
 * where the pcs-parse test suite picks them up automatically.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPcsPage } from '../lib/pcs-fetch.js';
import {
  parsePcsStagePage,
  parsePcsComplementaryPage,
  parsePcsCombativeRiders,
  pcsStageUrl,
  pcsComplementaryUrl,
  pcsCombativeRidersUrl,
} from '../lib/pcs-parse.js';

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'tests',
  'fixtures',
  'pcs'
);

const season = process.env.SEASON || '2026';
const stages = process.argv.slice(2).map(Number).filter(Number.isInteger);
if (stages.length === 0) {
  console.error('Gebruik: npm run pcs:fixtures -- <etappenummer> [meer nummers]');
  process.exit(1);
}

async function capture(label: string, url: string, file: string): Promise<string | null> {
  try {
    const html = await fetchPcsPage(url);
    writeFileSync(join(FIXTURE_DIR, file), html);
    console.log(`✔ ${label}: ${html.length} bytes → tests/fixtures/pcs/${file}`);
    return html;
  } catch (error) {
    console.error(`✘ ${label}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function main() {
  mkdirSync(FIXTURE_DIR, { recursive: true });

  const combativeHtml = await capture(
    'combative riders',
    pcsCombativeRidersUrl(season),
    'real-combative-riders.html'
  );
  if (combativeHtml) {
    const byStage = parsePcsCombativeRiders(combativeHtml);
    console.log(
      `  strijdlust per etappe: ${[...byStage.entries()].map(([s, r]) => `${s}: ${r}`).join(', ') || 'NIETS GEVONDEN'}`
    );
  }

  for (const stage of stages) {
    console.log(`\n=== Etappe ${stage} ===`);
    const stageHtml = await capture(
      'stage page',
      pcsStageUrl(season, stage),
      `real-stage-${stage}.html`
    );
    if (stageHtml) {
      const page = parsePcsStagePage(stageHtml);
      console.log(`  tabs: ${page.tabs_found.join(' | ')}`);
      console.log(
        `  top-20: ${page.top20.length} rijen` +
          (page.top20.length > 0
            ? ` (1. ${page.top20[0].rider} — ${page.top20[0].team})`
            : '')
      );
      console.log(`  truien: ${JSON.stringify(page.jerseys)}`);
      console.log(
        `  opgaves: ${page.abandons.map((a) => `${a.rider} (${a.status})`).join(', ') || 'geen'}`
      );
      console.log(`  won how: ${page.won_how ?? '—'}  TTT: ${page.is_ttt}`);
    }

    const compHtml = await capture(
      'complementary results',
      pcsComplementaryUrl(season, stage),
      `real-complementary-${stage}.html`
    );
    if (compHtml) {
      const comp = parsePcsComplementaryPage(compHtml);
      console.log(`  secties: ${comp.sections_found.join(' | ') || 'GEEN'}`);
      console.log(`  dagploeg: ${comp.team_day_winner ?? 'NIET GEVONDEN'}`);
      console.log(`  strijdlust: ${comp.combativity ?? 'niet op deze pagina'}`);
    }
  }
}

main();
