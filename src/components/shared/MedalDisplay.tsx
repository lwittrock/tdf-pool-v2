/**
 * Medal Display Component
 * 
 * Renders medal emoji for positions (gold/silver/bronze).
 */

import { MEDALS, MEDAL_POSITIONS } from '../../../lib/scoring-constants.js';

/**
 * Displays a single medal emoji based on position
 */
export function MedalIcon({ position, className = '' }: { position: number; className?: string }) {
  if (position === MEDAL_POSITIONS.GOLD) return <span className={className}>{MEDALS.GOLD}</span>;
  if (position === MEDAL_POSITIONS.SILVER) return <span className={className}>{MEDALS.SILVER}</span>;
  if (position === MEDAL_POSITIONS.BRONZE) return <span className={className}>{MEDALS.BRONZE}</span>;
  return null;
}

/**
 * Medal counts laid out for clean vertical alignment: each medal and its count
 * are centered together (emoji glyphs otherwise sit high next to the digits),
 * with even spacing and tabular figures so columns line up. Empty → em dash.
 */
export function MedalCountsAligned({
  gold,
  silver,
  bronze,
  className = '',
}: {
  gold: number;
  silver: number;
  bronze: number;
  className?: string;
}) {
  const parts: Array<[string, number]> = [];
  if (gold > 0) parts.push([MEDALS.GOLD, gold]);
  if (silver > 0) parts.push([MEDALS.SILVER, silver]);
  if (bronze > 0) parts.push([MEDALS.BRONZE, bronze]);

  if (parts.length === 0) return <span className={`text-tdf-text-muted ${className}`}>—</span>;

  return (
    <span className={`inline-flex items-center gap-2 leading-none ${className}`}>
      {parts.map(([medal, count]) => (
        <span key={medal} className="inline-flex items-center gap-0.5">
          <span>{medal}</span>
          <span className="tabular-nums">{count}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * Medal counts in three fixed gold/silver/bronze columns, so every medal type
 * lines up down a column across rows (a lone bronze stays under the bronzes,
 * not shoved left). Meant for a right-aligned table cell — the block hugs the
 * right edge. Empty medal slots stay blank; no medals at all → em dash.
 */
export function MedalCountsColumns({
  gold,
  silver,
  bronze,
  className = '',
}: {
  gold: number;
  silver: number;
  bronze: number;
  className?: string;
}) {
  if (gold + silver + bronze === 0) return <span className={`text-tdf-text-muted ${className}`}>—</span>;

  const slot = (medal: string, count: number) =>
    count > 0 ? (
      <span className="inline-flex items-center gap-0.5">
        <span>{medal}</span>
        <span className="tabular-nums">{count}</span>
      </span>
    ) : (
      // Empty placeholder keeps this medal's column slot so the others don't shift.
      <span aria-hidden="true" />
    );

  return (
    <span className={`inline-grid grid-cols-[2.3em_2.3em_2.3em] leading-none ${className}`}>
      {slot(MEDALS.GOLD, gold)}
      {slot(MEDALS.SILVER, silver)}
      {slot(MEDALS.BRONZE, bronze)}
    </span>
  );
}
