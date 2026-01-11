/**
 * Rank Change Indicator Component
 * 
 * Displays rank changes with colored arrows.
 */

import { RANK_ARROWS, RANK_COLORS } from '../../../lib/constants';

interface RankChangeProps {
  change: number;
  className?: string;
}

/**
 * Displays rank change with appropriate color and arrow
 * Positive = moved up (green), Negative = moved down (red), Zero = no change (gray)
 */
export function RankChange({ change, className = '' }: RankChangeProps) {
  if (change > 0) {
    return (
      <span className={`font-semibold ${RANK_COLORS.UP} ${className}`}>
        {RANK_ARROWS.UP}{change}
      </span>
    );
  }

  if (change < 0) {
    return (
      <span className={`font-semibold ${RANK_COLORS.DOWN} ${className}`}>
        {RANK_ARROWS.DOWN}{Math.abs(change)}
      </span>
    );
  }

  return (
    <span className={`${RANK_COLORS.SAME} ${className}`}>
      {RANK_ARROWS.SAME}
    </span>
  );
}
