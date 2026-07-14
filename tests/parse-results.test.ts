/**
 * Paste-parser tests: the three real input shapes (bare Excel-style names,
 * numbered lines, copied PCS rows with reversed names + team suffixes) and
 * the safety rules (never guess on ambiguity, never silently drop a line).
 */

import { describe, expect, it } from 'vitest';
import { parseResultsPaste } from '../lib/parse-results';

const RIDERS = [
  'TADEJ POGACAR',
  'JONAS VINGEGAARD',
  'TIM WELLENS',
  'TIM VAN DIJKE',
  'SEAN QUINN',
  'QUINN SIMMONS',
  'TOBIAS HALLAND JOHANNESSEN',
  'ANDERS HALLAND JOHANNESSEN',
  'MATHIEU VAN DER POEL',
  'SOREN WAERENSKJOLD',
];

describe('parseResultsPaste', () => {
  it('parses bare names in DB spelling, in order', () => {
    const { entries, unmatched } = parseResultsPaste(
      'TADEJ POGACAR\nJONAS VINGEGAARD\nMATHIEU VAN DER POEL',
      RIDERS
    );
    expect(unmatched).toEqual([]);
    expect(entries.map((e) => e.rider_name)).toEqual([
      'TADEJ POGACAR',
      'JONAS VINGEGAARD',
      'MATHIEU VAN DER POEL',
    ]);
    expect(entries.map((e) => e.position)).toEqual([1, 2, 3]);
  });

  it('parses numbered lines and PCS-style rows (reversed name, accents, team suffix)', () => {
    const text = [
      '1  POGAČAR Tadej  UAE Team Emirates - XRG  4:15:03',
      '2. Vingegaard Jonas — Team Visma | Lease a Bike',
      '3e WÆRENSKJOLD Søren Uno-X Mobility',
      '4 VAN DER POEL Mathieu Alpecin - Premier Tech',
    ].join('\n');
    const { entries, unmatched } = parseResultsPaste(text, RIDERS);
    expect(unmatched).toEqual([]);
    expect(entries.map((e) => e.rider_name)).toEqual([
      'TADEJ POGACAR',
      'JONAS VINGEGAARD',
      'SOREN WAERENSKJOLD',
      'MATHIEU VAN DER POEL',
    ]);
  });

  it('disambiguates overlapping names by requiring all tokens', () => {
    const { entries } = parseResultsPaste(
      'QUINN Sean EF Education\nSIMMONS Quinn Lidl - Trek\nVAN DIJKE Tim\nWELLENS Tim',
      RIDERS
    );
    expect(entries.map((e) => e.rider_name)).toEqual([
      'SEAN QUINN',
      'QUINN SIMMONS',
      'TIM VAN DIJKE',
      'TIM WELLENS',
    ]);
  });

  it('prefers the longest matching name (Halland brothers vs short forms)', () => {
    const { entries } = parseResultsPaste('JOHANNESSEN Tobias Halland Uno-X Mobility', RIDERS);
    expect(entries[0].rider_name).toBe('TOBIAS HALLAND JOHANNESSEN');
    expect(entries[0].matched).toBe(true);
  });

  it('keeps unrecognized rider lines in place instead of shifting positions', () => {
    const { entries, unmatched } = parseResultsPaste(
      'TADEJ POGACAR\n2. Piet Pataat\nJONAS VINGEGAARD',
      RIDERS
    );
    expect(entries).toHaveLength(3);
    expect(entries[1].matched).toBe(false);
    expect(entries[2].rider_name).toBe('JONAS VINGEGAARD');
    expect(entries[2].position).toBe(3);
    expect(unmatched).toEqual(['2. Piet Pataat']);
  });

  it('skips headers and empty/numeric lines, caps at maxEntries', () => {
    const text = ['Rnk Rider Team Points', '', '4:15:03', 'TADEJ POGACAR', 'JONAS VINGEGAARD'].join(
      '\n'
    );
    const { entries } = parseResultsPaste(text, RIDERS, 1);
    expect(entries).toHaveLength(1);
    expect(entries[0].rider_name).toBe('TADEJ POGACAR');
  });

  it('ignores un-numbered non-rider lines (teams, nav junk) but reports them', () => {
    const text = [
      'TADEJ POGACAR',
      'UAE Team Emirates - XRG', // team on its own line — must not shift positions
      'JONAS VINGEGAARD',
    ].join('\n');
    const { entries, unmatched, ignored } = parseResultsPaste(text, RIDERS);
    expect(entries.map((e) => e.rider_name)).toEqual(['TADEJ POGACAR', 'JONAS VINGEGAARD']);
    expect(unmatched).toEqual([]);
    expect(ignored).toEqual(['UAE Team Emirates - XRG']);
  });

  it('parses the real PCS copy format: split ranks, team lines, nav junk, mixed case', () => {
    const RIDERS_S10 = [
      'TADEJ POGACAR', 'REMCO EVENEPOEL', 'PAUL SEIXAS', 'FLORIAN LIPOWITZ', 'JUAN AYUSO',
      'MATTIAS SKJELMOSE', 'JONAS VINGEGAARD', 'ISAAC DEL TORO', 'LENNY MARTINEZ', 'TOM PIDCOCK',
      'RICHARD CARAPAZ', 'DAVIDE PIGANZOLI', 'ILAN VAN WILDER', 'RAMSES DEBRUYNE', 'EGAN BERNAL',
      'YANNIS VOISARD', 'ADAM YATES', 'TOBIAS HALLAND JOHANNESSEN', 'ANDERS HALLAND JOHANNESSEN',
      'SEAN QUINN', 'QUINN SIMMONS', 'PABLO CASTRILLO',
    ];
    const text = [
      '2026   »   113th Tour de France (2.UWT)',
      'Stage 10   »   Aurillac  ›  Le Lioran   (166.6km)',
      'STAGE', 'GC', 'POINTS', 'KOM', 'YOUTH', 'TEAMS',
      'Age', 'BIB', 'H2H', 'Specialty', 'next stage', 'previous stage',
      'Rnk\tRider\tTeam\tUCI\tPnt\t\tTime',
      '1\tPogačar Tadej', '\tUAE Team Emirates - XRG\t210\t100\t10″\t3:58:08',
      '2\tEvenepoel Remco', '\tRed Bull - BORA - hansgrohe\t150\t70\t6″\t0:32',
      '3\tSeixas Paul', '\tDecathlon CMA CGM Team\t110\t50\t4″\t0:34',
      '4\tLipowitz Florian', '\tRed Bull - BORA - hansgrohe\t90\t40\t\t,,',
      '5\tAyuso Juan', '\tLidl - Trek\t70\t32\t\t0:38',
      '6\tSkjelmose Mattias', '\tLidl - Trek\t55\t26\t\t,,',
      '7\tVingegaard Jonas', '\tTeam Visma | Lease a Bike\t45\t22\t\t0:44',
      '8\tdel Toro Isaac', '\tUAE Team Emirates - XRG\t40\t18\t\t1:31',
      '9\t', 'Martinez Lenny', '\tPinarello Q36.5 Pro Cycling Team\t35\t14\t\t1:59',
      '10\t', 'Pidcock Tom', '\tBahrain - Victorious\t30\t10\t\t2:03',
      '11\tCarapaz Richard', '\tEF Education - EasyPost\t25\t8\t\t2:09',
      '12\tPiganzoli Davide', '\tTeam Visma | Lease a Bike\t20\t6\t\t2:42',
      '13\tVan Wilder Ilan', '\tSoudal Quick-Step\t15\t4\t\t2:48',
      '14\tDebruyne Ramses', '\tAlpecin - Premier Tech\t10\t2\t\t,,',
      '15\tBernal Egan', '\tNetcompany INEOS\t5\t1\t\t2:53',
      '16\tVoisard Yannis', '\tTudor Pro Cycling Team\t\t\t\t3:05',
      '17\tYates Adam', '\tUAE Team Emirates - XRG\t\t\t\t3:45',
      '18\tJohannessen Tobias Halland', '\tUno-X Mobility\t\t\t\t4:50',
      '19\tQuinn Sean', '\tEF Education - EasyPost\t\t\t\t5:23',
      '20\tCastrillo Pablo', '\tMovistar Team\t\t\t\t6:45',
    ].join('\n');
    const { entries, unmatched } = parseResultsPaste(text, RIDERS_S10);
    expect(unmatched).toEqual([]);
    expect(entries.map((e) => e.rider_name)).toEqual([
      'TADEJ POGACAR', 'REMCO EVENEPOEL', 'PAUL SEIXAS', 'FLORIAN LIPOWITZ', 'JUAN AYUSO',
      'MATTIAS SKJELMOSE', 'JONAS VINGEGAARD', 'ISAAC DEL TORO', 'LENNY MARTINEZ', 'TOM PIDCOCK',
      'RICHARD CARAPAZ', 'DAVIDE PIGANZOLI', 'ILAN VAN WILDER', 'RAMSES DEBRUYNE', 'EGAN BERNAL',
      'YANNIS VOISARD', 'ADAM YATES', 'TOBIAS HALLAND JOHANNESSEN', 'SEAN QUINN', 'PABLO CASTRILLO',
    ]);
    expect(entries.every((e) => e.matched)).toBe(true);
  });
});
