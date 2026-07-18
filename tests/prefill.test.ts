/**
 * PCS-prefill → form-patch tests. Rider/team spellings mirror the real
 * mismatch: DB names are the pool-Excel's GIVEN SURNAME ASCII-folded
 * uppercase, PCS serves "SURNAME Given" with accents; DB team names are
 * the Excel's, PCS's carry sponsor suffixes.
 */

import { describe, expect, it } from 'vitest';
import { buildPrefillPatch, matchTeamName, type PcsPrefillData } from '../lib/prefill';

const RIDERS = [
  { name: 'TADEJ POGACAR', team: 'UAE Team Emirates' },
  { name: 'JONAS VINGEGAARD', team: 'Team Visma Lease a Bike' },
  { name: 'JONATHAN MILAN', team: 'Lidl-Trek' },
  { name: 'LENNY MARTINEZ', team: 'Bahrain Victorious' },
  { name: 'ISAAC DEL TORO', team: 'UAE Team Emirates' },
  { name: 'VALENTIN MADOUAS', team: 'Groupama-FDJ' },
  { name: 'FILIPPO GANNA', team: 'INEOS Grenadiers' },
  { name: 'ROMAIN BARDET', team: 'Team Picnic PostNL' },
  { name: 'ADAM YATES', team: 'UAE Team Emirates' },
  { name: 'SIMON YATES', team: 'Team Visma Lease a Bike' },
];

const BASE: PcsPrefillData = {
  stage_number: 12,
  top20: [],
  jerseys: { yellow: null, green: null, polka_dot: null, white: null },
  abandons: [],
  won_how: null,
  team_day_winner: null,
  combativity: null,
  warnings: [],
};

describe('buildPrefillPatch', () => {
  it('matches accented, surname-first PCS names to DB names', () => {
    const { patch, feedback, matchedCount } = buildPrefillPatch(
      {
        ...BASE,
        top20: [
          { position: 1, rider: 'POGAČAR Tadej', team: 'UAE Team Emirates - XRG' },
          { position: 2, rider: 'VINGEGAARD Jonas', team: 'Team Visma | Lease a Bike' },
        ],
      },
      RIDERS
    );
    expect(patch.top_20_finishers[0].rider_name).toBe('TADEJ POGACAR');
    expect(patch.top_20_finishers[1].rider_name).toBe('JONAS VINGEGAARD');
    expect(patch.top_20_finishers[2].rider_name).toBe('');
    expect(matchedCount).toBe(2);
    // Only the (intentional) missing-jersey notes — no rider complaints.
    expect(feedback.filter((f) => !f.includes('trui'))).toEqual([]);
  });

  it('keeps unmatched top-20 rows visible in their position', () => {
    const { patch, feedback } = buildPrefillPatch(
      { ...BASE, top20: [{ position: 1, rider: 'ONBEKENDE RENNER', team: '' }] },
      RIDERS
    );
    expect(patch.top_20_finishers[0].rider_name).toBe('ONBEKENDE RENNER');
    expect(feedback[0]).toContain('Positie 1');
  });

  it('resolves PCS spellings through rider aliases', () => {
    // The real case from the 2026 startlist: Excel/DB "AARON MURRAY GATE",
    // PCS "GATE Aaron" — only the rider_aliases row can bridge that.
    const { patch, feedback } = buildPrefillPatch(
      { ...BASE, top20: [{ position: 1, rider: 'GATE Aaron', team: 'XDS Astana Team' }] },
      [...RIDERS, { name: 'AARON MURRAY GATE', team: 'XDS ASTANA TEAM', aliases: ['AARON GATE'] }]
    );
    expect(patch.top_20_finishers[0].rider_name).toBe('AARON MURRAY GATE');
    expect(feedback.filter((f) => f.includes('Positie'))).toEqual([]);
  });

  it('never guesses on ambiguous surnames', () => {
    const { patch, feedback } = buildPrefillPatch(
      { ...BASE, top20: [{ position: 1, rider: 'YATES', team: '' }] },
      RIDERS
    );
    expect(patch.top_20_finishers[0].rider_name).toBe('YATES');
    expect(feedback.filter((f) => f.includes('Positie 1'))).toHaveLength(1);
  });

  it('fills jerseys with matched names and flags missing ones', () => {
    const { patch, feedback } = buildPrefillPatch(
      {
        ...BASE,
        jerseys: {
          yellow: 'POGAČAR Tadej',
          green: 'MILAN Jonathan',
          polka_dot: 'MARTINEZ Lenny',
          white: null,
        },
      },
      RIDERS
    );
    expect(patch.jerseys.yellow).toBe('TADEJ POGACAR');
    expect(patch.jerseys.green).toBe('JONATHAN MILAN');
    expect(patch.jerseys.polka_dot).toBe('LENNY MARTINEZ');
    expect(patch.jerseys.white).toBe('');
    expect(feedback.some((f) => f.includes('witte trui'))).toBe(true);
  });

  it('maps PCS team names to the pool-Excel spelling for the Dagploeg', () => {
    const { patch } = buildPrefillPatch(
      { ...BASE, team_day_winner: 'UAE Team Emirates - XRG' },
      RIDERS
    );
    expect(patch.dagploeg).toBe('UAE Team Emirates');
  });

  it('splits abandons into DNS vs DNF/OTL/DSQ (reserve rule)', () => {
    const { patch } = buildPrefillPatch(
      {
        ...BASE,
        abandons: [
          { rider: 'GANNA Filippo', status: 'DNF' },
          { rider: 'BARDET Romain', status: 'DNS' },
          { rider: 'MADOUAS Valentin', status: 'OTL' },
        ],
      },
      RIDERS
    );
    expect(patch.dnf_riders).toEqual(['FILIPPO GANNA', 'VALENTIN MADOUAS']);
    expect(patch.dns_riders).toEqual(['ROMAIN BARDET']);
  });

  it('passes combativity and won_how through when matched', () => {
    const { patch } = buildPrefillPatch(
      { ...BASE, combativity: 'MADOUAS Valentin', won_how: 'Sprint of small group' },
      RIDERS
    );
    expect(patch.combativity).toBe('VALENTIN MADOUAS');
    expect(patch.won_how).toBe('Sprint of small group');
  });
});

describe('matchTeamName', () => {
  const TEAMS = [...new Set(RIDERS.map((r) => r.team))];

  it('matches despite sponsor suffixes and punctuation differences', () => {
    expect(matchTeamName('Team Visma | Lease a Bike', TEAMS)).toBe('Team Visma Lease a Bike');
    expect(matchTeamName('Lidl - Trek', TEAMS)).toBe('Lidl-Trek');
    expect(matchTeamName('Bahrain - Victorious', TEAMS)).toBe('Bahrain Victorious');
    expect(matchTeamName('Groupama - FDJ', TEAMS)).toBe('Groupama-FDJ');
  });

  it('returns null for teams outside the pool list', () => {
    expect(matchTeamName('Cofidis', TEAMS)).toBeNull();
  });
});
