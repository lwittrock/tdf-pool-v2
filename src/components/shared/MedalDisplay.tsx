/**
 * Medal Display Component
 * 
 * Renders medal emoji for positions (gold/silver/bronze).
 */

import { MEDALS, MEDAL_POSITIONS } from '../../../lib/scoring-constants.js';

interface MedalDisplayProps {
  position?: number;
  medalString?: string;
  className?: string;
}

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
 * Displays medals - either from a position number or a pre-formatted string
 */
export function MedalDisplay({ position, medalString, className = '' }: MedalDisplayProps) {
  if (medalString) {
    return medalString ? <span className={className}>{medalString}</span> : null;
  }

  if (position !== undefined) {
    return <MedalIcon position={position} className={className} />;
  }

  return null;
}

/**
 * Displays medal counts (multiple medals as a string)
 */
export function MedalCounts({ display, className = '' }: { display: string; className?: string }) {
  return display ? <span className={className}>{display}</span> : <span className={className}>—</span>;
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
