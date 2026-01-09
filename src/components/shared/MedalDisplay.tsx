/**
 * Medal Display Component
 * 
 * Renders medal emoji for positions (gold/silver/bronze).
 */

import React from 'react';
import { MEDALS, MEDAL_POSITIONS } from '../lib/constants';

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
