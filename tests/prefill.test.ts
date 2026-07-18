/**
 * PCS-prefill → form-patch tests. Rider/team spellings mirror the real
 * mismatch: DB names are the pool-Excel's GIVEN SURNAME ASCII-folded
 * uppercase, PCS serves "SURNAME Given" with accents; DB team names are
 * the Excel's, PCS's carry sponsor suffixes.
 */

import { describe, expect, it } from 'vitest';
import {
  buildPrefillPatch,
  matchTeamName,
  mergePrefillIntoForm,
  type PcsPrefillData,
  type PrefillableFields,
  type PrefillPatch,
} from '../lib/prefill';

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

describe('mergePrefillIntoForm', () => {
  const emptyForm = (): PrefillableFields => ({
    top_20_finishers: Array.from({ length: 20 }, (_, i) => ({ rider_name: '', position: i + 1 })),
    jerseys: { yellow: '', green: '', polka_dot: '', white: '' },
    combativity: '',
    dagploeg: '',
    dnf_riders: [],
    dns_riders: [],
    won_how: '',
  });
  const emptyPatch = (): PrefillPatch => ({
    top_20_finishers: Array.from({ length: 20 }, (_, i) => ({
      rider_name: '',
      position: i + 1,
      matched: false,
    })),
    jerseys: { yellow: '', green: '', polka_dot: '', white: '' },
    combativity: '',
    dagploeg: '',
    dnf_riders: [],
    dns_riders: [],
    won_how: '',
  });

  it('keeps a hand-corrected jersey and surfaces the difference as a note', () => {
    const prev = emptyForm();
    prev.jerseys.yellow = 'JONAS VINGEGAARD'; // admin's manual correction
    const patch = emptyPatch();
    patch.jerseys.yellow = 'TADEJ POGACAR'; // PCS disagrees
    const { fields, notes } = mergePrefillIntoForm(prev, patch);
    expect(fields.jerseys.yellow).toBe('JONAS VINGEGAARD');
    expect(notes.some((n) => n.includes('Gele trui') && n.includes('TADEJ POGACAR'))).toBe(true);
  });

  it('fills empty single-value fields without notes', () => {
    const patch = emptyPatch();
    patch.combativity = 'VALENTIN MADOUAS';
    patch.dagploeg = 'UAE Team Emirates';
    const { fields, notes } = mergePrefillIntoForm(emptyForm(), patch);
    expect(fields.combativity).toBe('VALENTIN MADOUAS');
    expect(fields.dagploeg).toBe('UAE Team Emirates');
    expect(notes).toEqual([]);
  });

  it('lets matched top-20 names replace earlier values, but raw text only fills empty slots', () => {
    const prev = emptyForm();
    prev.top_20_finishers[0].rider_name = 'OUDE INVOER';
    prev.top_20_finishers[1].rider_name = 'HANDMATIG GOED';
    const patch = emptyPatch();
    patch.top_20_finishers[0] = { rider_name: 'TADEJ POGACAR', position: 1, matched: true };
    patch.top_20_finishers[1] = { rider_name: 'RAW PCS TEKST', position: 2, matched: false };
    const { fields } = mergePrefillIntoForm(prev, patch);
    expect(fields.top_20_finishers[0].rider_name).toBe('TADEJ POGACAR');
    expect(fields.top_20_finishers[1].rider_name).toBe('HANDMATIG GOED');
  });

  it('replaces DNF/DNS with the fresh PCS list and notes removals', () => {
    const prev = emptyForm();
    prev.dnf_riders = ['FILIPPO GANNA']; // early PCS scrape, later corrected
    const patch = emptyPatch();
    patch.dns_riders = ['ROMAIN BARDET'];
    const { fields, notes } = mergePrefillIntoForm(prev, patch);
    expect(fields.dnf_riders).toEqual([]);
    expect(fields.dns_riders).toEqual(['ROMAIN BARDET']);
    expect(notes.some((n) => n.includes('FILIPPO GANNA'))).toBe(true);
  });

  it('leaves DNF/DNS untouched when PCS reports no abandons yet', () => {
    const prev = emptyForm();
    prev.dns_riders = ['ROMAIN BARDET']; // admin knew before PCS did
    const { fields, notes } = mergePrefillIntoForm(prev, emptyPatch());
    expect(fields.dns_riders).toEqual(['ROMAIN BARDET']);
    expect(notes).toEqual([]);
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
