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
});
