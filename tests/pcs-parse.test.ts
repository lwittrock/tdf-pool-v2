/**
 * PCS parser tests.
 *
 * The synthetic fixtures mirror the markup the procyclingstats python
 * package (v0.2.8) parses on live PCS — exact assertions run against those.
 * When real captured pages are present (tests/fixtures/pcs/real-*.html,
 * captured via `npm run pcs:fixtures` from a network where PCS is
 * reachable), a second block asserts structural invariants against them.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  parsePcsStagePage,
  parsePcsComplementaryPage,
  parsePcsCombativeRiders,
  pcsStageUrl,
  pcsComplementaryUrl,
} from '../lib/pcs-parse';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'pcs');
const fixture = (name: string) => readFileSync(join(FIXTURE_DIR, name), 'utf8');

describe('parsePcsStagePage (synthetic fixture)', () => {
  const page = parsePcsStagePage(fixture('synthetic-stage.html'));

  it('parses the top-20 in order with raw PCS names', () => {
    expect(page.top20).toHaveLength(20);
    expect(page.top20[0]).toEqual({
      position: 1,
      rank: 1,
      rider: 'ARENSMAN Thymen',
      team: 'Netcompany INEOS Cycling Team',
    });
    // the fixture's rank sequence is intact, so position === rank throughout
    expect(page.top20.every((r) => r.rank === r.position)).toBe(true);
    expect(page.top20[1].rider).toBe('POGAČAR Tadej');
    expect(page.top20[7].rider).toBe('MERLIER Tim');
    // rank 21 exists in the fixture but must be cut off
    expect(page.top20[19].rider).toBe('EENKHOORN Pascal');
  });

  it('skips relegation annotation rows without shifting positions', () => {
    expect(page.top20[8]).toMatchObject({ position: 9, rider: 'VAN DER POEL Mathieu' });
  });

  it('takes jersey holders from the classification tab leaders', () => {
    expect(page.jerseys).toEqual({
      yellow: 'POGAČAR Tadej',
      green: 'PEDERSEN Mads',
      polka_dot: 'MARTINEZ Lenny',
      white: 'DEL TORO Isaac',
    });
  });

  it('collects DNF/DNS/OTL rows with their status', () => {
    expect(page.abandons).toEqual([
      { rider: 'GROSSSCHARTNER Felix', status: 'DNF' },
      { rider: 'BERNAL Egan', status: 'DNS' },
      { rider: 'BOL Cees', status: 'OTL' },
    ]);
  });

  it('reads "Won how" from the race information list', () => {
    expect(page.won_how).toBe('Sprint of small group');
  });

  it('reports the tabs it found for diagnostics', () => {
    expect(page.tabs_found).toEqual(['Stage', 'GC', 'Points', 'KOM', 'Youth', 'Teams']);
    expect(page.is_ttt).toBe(false);
  });

  it('carries PCS ranks so callers can detect a parsing gap', () => {
    const gappy = parsePcsStagePage(
      `<div class="resTab"><table class="results">
         <thead><tr><th>Rnk</th><th>Rider</th></tr></thead>
         <tbody>
           <tr><td>1</td><td><a href="rider/a">AAA Aa</a></td></tr>
           <tr><td>3</td><td><a href="rider/b">BBB Bb</a></td></tr>
         </tbody></table></div>`
    );
    expect(gappy.top20.map((r) => [r.position, r.rank])).toEqual([
      [1, 1],
      [2, 3], // hole at rank 2 → position ≠ rank, endpoint warns
    ]);
  });

  it('degrades to empty output on unrecognizable HTML, never throws', () => {
    const empty = parsePcsStagePage('<html><body><p>Just a moment...</p></body></html>');
    expect(empty.top20).toEqual([]);
    expect(empty.jerseys.yellow).toBeNull();
    expect(empty.abandons).toEqual([]);
  });
});

describe('parsePcsComplementaryPage (synthetic fixture)', () => {
  const page = parsePcsComplementaryPage(fixture('synthetic-complementary.html'));

  it('finds the team day classification winner', () => {
    expect(page.team_day_winner).toBe('Netcompany INEOS Cycling Team');
  });

  it('finds the combativity award', () => {
    expect(page.combativity).toBe('BENOOT Tiesj');
  });

  it('lists section headers for diagnostics', () => {
    expect(page.sections_found).toContain('Team day classification');
    expect(page.sections_found).toContain('Youth day classification');
  });

  it('does not confuse the youth day classification with the team day one', () => {
    // Both sections' tables contain team anchors; the winner must come from
    // the section whose header names the *team* classification.
    expect(page.team_day_winner).not.toBe('UAE Team Emirates - XRG');
  });
});

describe('parsePcsCombativeRiders (synthetic fixture)', () => {
  it('maps stage numbers to award winners', () => {
    const byStage = parsePcsCombativeRiders(fixture('synthetic-combative-riders.html'));
    expect(byStage.get(12)).toBe('BENOOT Tiesj');
    expect(byStage.get(11)).toBe('VAN DER POEL Mathieu');
    expect(byStage.has(1)).toBe(false); // TTT: no award
  });
});

describe('URL builders', () => {
  it('build the documented PCS URL shapes', () => {
    expect(pcsStageUrl('2026', 12)).toBe(
      'https://www.procyclingstats.com/race/tour-de-france/2026/stage-12'
    );
    expect(pcsComplementaryUrl('2026', 12)).toBe(
      'https://www.procyclingstats.com/race/tour-de-france/2026/stage-12/info/complementary-results'
    );
  });
});

// Structural invariants against real captured pages, when present.
const realStageFixtures = readdirSync(FIXTURE_DIR).filter((f) =>
  /^real-stage-\d+\.html$/.test(f)
);

describe.runIf(realStageFixtures.length > 0)('real captured PCS pages', () => {
  it.each(realStageFixtures)('%s parses into a plausible stage result', (name) => {
    const page = parsePcsStagePage(fixture(name));
    expect(page.top20.length).toBe(20);
    expect(new Set(page.top20.map((r) => r.rider)).size).toBe(20);
    for (const jersey of Object.values(page.jerseys)) {
      expect(jersey).toBeTruthy();
    }
  });
});
