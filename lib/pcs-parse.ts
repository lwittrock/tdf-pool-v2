/**
 * ProCyclingStats HTML parsers (pure, unit-tested — no network, no DB).
 *
 * Selectors are ported from the procyclingstats python package v0.2.8
 * (stage_scraper.py / table_parser.py), which tracks PCS's live markup:
 *   - classification tabs: `ul.tabs.tabnav.resultTabs li a[data-id]`
 *     (old markup: `ul.restabs`), content in `div.resTab[data-id]`,
 *     each holding a `table.results`
 *   - the rank column ("Rnk") holds a number for finishers and a status
 *     (DNF/DNS/OTL/DSQ) for everyone else
 *   - rider/team cells are anchors with `rider/…` / `team/…` hrefs
 *
 * Every field parses independently and returns null/[] on failure: a PCS
 * markup change costs one empty form field (typed by hand, like before),
 * never a wrong value. All output is RAW PCS text — matching against DB
 * rider/team names happens later, against the alias-aware machinery.
 */

import { parse, HTMLElement } from 'node-html-parser';

export interface PcsResultRow {
  position: number;
  rider: string;
  team: string;
}

export interface PcsAbandon {
  rider: string;
  status: 'DNF' | 'DNS' | 'OTL' | 'DSQ';
}

export interface PcsStagePage {
  /** Numeric-ranked rows of the STAGE tab, in order (max 20). */
  top20: PcsResultRow[];
  /** Leader (rank 1) of each classification tab, raw PCS rider name. */
  jerseys: {
    yellow: string | null; // GC
    green: string | null; // Points
    polka_dot: string | null; // KOM
    white: string | null; // Youth
  };
  /** Non-finishers listed in the stage result table. */
  abandons: PcsAbandon[];
  won_how: string | null;
  /** True when the stage tab holds a TTT table (no per-rider result rows). */
  is_ttt: boolean;
  /** Tab labels found — diagnostics for when PCS changes markup. */
  tabs_found: string[];
}

const ABANDON_STATUSES = new Set(['DNF', 'DNS', 'OTL', 'DSQ']);
const RANK_HEADERS = ['RNK', 'POS', 'RESULT', '#'];

export function pcsStageUrl(season: string, stage: number): string {
  return `https://www.procyclingstats.com/race/tour-de-france/${season}/stage-${stage}`;
}

export function pcsComplementaryUrl(season: string, stage: number): string {
  return `${pcsStageUrl(season, stage)}/info/complementary-results`;
}

/** PCS's own URL spells it "comative-riders" (sic). */
export function pcsCombativeRidersUrl(season: string): string {
  return `https://www.procyclingstats.com/race/tour-de-france/${season}/results/comative-riders`;
}

function anchorText(el: HTMLElement, hrefPrefix: string): string | null {
  for (const a of el.querySelectorAll('a')) {
    const href = (a.getAttribute('href') ?? '').replace(/^\//, '');
    if (href.startsWith(hrefPrefix)) {
      const text = a.text.replace(/\s+/g, ' ').trim();
      if (text && text.toLowerCase() !== 'view') return text;
    }
  }
  return null;
}

/** Index of the rank column in the table's header row, default 0. */
function rankColumnIndex(table: HTMLElement): number {
  const headerCells = table.querySelectorAll('thead th');
  for (let i = 0; i < headerCells.length; i++) {
    const label = headerCells[i].text.trim().toUpperCase();
    if (RANK_HEADERS.includes(label)) return i;
  }
  return 0;
}

interface RawRow {
  rankText: string;
  rider: string | null;
  team: string | null;
}

function parseResultTable(table: HTMLElement): RawRow[] {
  const rankIdx = rankColumnIndex(table);
  const body = table.querySelector('tbody') ?? table;
  const rows: RawRow[] = [];
  for (const tr of body.querySelectorAll('tr')) {
    const cells = tr.querySelectorAll('td');
    // Non-result rows the python package also drops: spacers and
    // "relegated from position X" annotations.
    if (cells.length === 0) continue;
    if (cells.length <= 2 && cells[0].text.trim() === '') continue;
    if (/relegated/i.test(tr.text)) continue;
    rows.push({
      rankText: (cells[rankIdx]?.text ?? '').trim(),
      rider: anchorText(tr, 'rider/'),
      team: anchorText(tr, 'team/'),
    });
  }
  return rows;
}

/**
 * The classification tables live in tabbed divs; the tab nav links carry a
 * data-id that names the matching `div.resTab`. Labels are matched on
 * substring (the python package's tab_mapping).
 */
function classificationTable(
  root: HTMLElement,
  tabLinks: HTMLElement[],
  keyword: string
): HTMLElement | null {
  for (const link of tabLinks) {
    if (!link.text.toUpperCase().includes(keyword)) continue;
    const dataId = link.getAttribute('data-id');
    if (!dataId) continue;
    const tabDiv = root
      .querySelectorAll('div.resTab')
      .find((d) => d.getAttribute('data-id') === dataId);
    const table = tabDiv?.querySelector('table.results');
    if (table) return table;
  }
  return null;
}

function tabNavLinks(root: HTMLElement): HTMLElement[] {
  const current = root.querySelectorAll('ul.tabs.tabnav.resultTabs li a');
  if (current.length > 0) return current;
  return root.querySelectorAll('ul.restabs li a'); // pre-2025 markup
}

function classificationLeader(
  root: HTMLElement,
  tabLinks: HTMLElement[],
  keyword: string
): string | null {
  const table = classificationTable(root, tabLinks, keyword);
  if (!table) return null;
  for (const row of parseResultTable(table)) {
    if (row.rankText === '1' && row.rider) return row.rider;
  }
  return null;
}

/** "Race information" infolist value for a label ("Won how", …). */
function stageInfoByLabel(root: HTMLElement, label: string): string | null {
  for (const h4 of root.querySelectorAll('h4')) {
    if (h4.text.trim().toLowerCase() !== 'race information') continue;
    let sibling = h4.nextElementSibling;
    while (sibling && !(sibling.tagName === 'UL' || sibling.tagName === 'OL')) {
      sibling = sibling.nextElementSibling;
    }
    if (!sibling) return null;
    for (const li of sibling.querySelectorAll('li')) {
      const text = li.structuredText.replace(/\s+/g, ' ').trim();
      const match = new RegExp(`^${label}:?\\s*(.+)$`, 'i').exec(text);
      if (match) return match[1].trim();
    }
  }
  return null;
}

export function parsePcsStagePage(html: string): PcsStagePage {
  const root = parse(html);
  const tabLinks = tabNavLinks(root);

  // Stage result table: via the STAGE tab, with the package's fallbacks.
  const stageTable =
    classificationTable(root, tabLinks, 'STAGE') ??
    root.querySelector('.resultCont .resTab table.results') ??
    root.querySelector('div.resTab table.results');

  const top20: PcsResultRow[] = [];
  const abandons: PcsAbandon[] = [];
  for (const row of stageTable ? parseResultTable(stageTable) : []) {
    if (!row.rider) continue;
    const status = row.rankText.toUpperCase();
    if (/^\d+$/.test(row.rankText)) {
      if (top20.length < 20) {
        top20.push({
          position: top20.length + 1,
          rider: row.rider,
          team: row.team ?? '',
        });
      }
    } else if (ABANDON_STATUSES.has(status)) {
      abandons.push({ rider: row.rider, status: status as PcsAbandon['status'] });
    }
  }

  return {
    top20,
    jerseys: {
      yellow: classificationLeader(root, tabLinks, 'GC'),
      green: classificationLeader(root, tabLinks, 'POINTS'),
      polka_dot: classificationLeader(root, tabLinks, 'KOM'),
      white: classificationLeader(root, tabLinks, 'YOUTH'),
    },
    abandons,
    won_how: stageInfoByLabel(root, 'Won how'),
    is_ttt: top20.length === 0 && root.querySelector('.ttt-results') !== null,
    tabs_found: tabLinks.map((l) => l.text.trim()).filter(Boolean),
  };
}

export interface PcsComplementaryPage {
  /** Winner of the stage's team day classification, raw PCS team name. */
  team_day_winner: string | null;
  /** Combativity/most-active award when the page lists one. */
  combativity: string | null;
  /** All section headers found — diagnostics + structure discovery. */
  sections_found: string[];
}

/**
 * The complementary-results page (…/stage-N/info/complementary-results) is
 * a sequence of header + table sections (intermediate sprints, KOM sprints,
 * day classifications). The python package has no scraper for it, so this
 * is header-text driven and deliberately loose: find a section whose header
 * mentions the team day classification, take the first team in its table.
 */
export function parsePcsComplementaryPage(html: string): PcsComplementaryPage {
  const root = parse(html);
  const sections: Array<{ header: string; el: HTMLElement }> = [];
  for (const h of root.querySelectorAll('h2, h3, h4')) {
    const header = h.text.replace(/\s+/g, ' ').trim();
    if (header) sections.push({ header, el: h });
  }

  const sectionValue = (
    headerPattern: RegExp,
    hrefPrefix: string
  ): string | null => {
    for (const { header, el } of sections) {
      if (!headerPattern.test(header)) continue;
      let sibling = el.nextElementSibling;
      while (sibling && sibling.tagName !== 'TABLE') {
        // A following header means the section had no table.
        if (/^H[2-4]$/.test(sibling.tagName ?? '')) break;
        sibling = sibling.nextElementSibling;
      }
      if (sibling && sibling.tagName === 'TABLE') {
        const value = anchorText(sibling as HTMLElement, hrefPrefix);
        if (value) return value;
      }
    }
    return null;
  };

  return {
    team_day_winner: sectionValue(/team.*(day|stage)|(day|daily).*team/i, 'team/'),
    combativity: sectionValue(/combativ|most active/i, 'rider/'),
    sections_found: sections.map((s) => s.header),
  };
}

/**
 * Race-level combative riders page (results/comative-riders — PCS's own
 * spelling): one `table.basic` mapping each stage to its award winner.
 * Backup source for combativity when the complementary page lacks it.
 */
export function parsePcsCombativeRiders(html: string): Map<number, string> {
  const root = parse(html);
  const byStage = new Map<number, string>();
  const table = root.querySelector('table.basic');
  if (!table) return byStage;
  const body = table.querySelector('tbody') ?? table;
  for (const tr of body.querySelectorAll('tr')) {
    const rider = anchorText(tr, 'rider/');
    if (!rider) continue;
    for (const a of tr.querySelectorAll('a')) {
      const stageMatch = /stage-(\d+)/.exec(a.getAttribute('href') ?? '');
      if (stageMatch) {
        byStage.set(Number(stageMatch[1]), rider);
        break;
      }
    }
  }
  return byStage;
}
