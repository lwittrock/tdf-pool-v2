/**
 * Combativity Icon Component
 * 
 * Red square icon for most combative rider award.
 */

interface CombativityIconProps {
  size?: 'sm' | 'md';
  riderNumber?: string | number;
  className?: string;
}

const DIMENSIONS = {
  sm: { size: 12, fontSize: 10 },
  md: { size: 15, fontSize: 12 },
} as const;

/**
 * Combativity award icon (red square with rider number)
 */
export function CombativityIcon({
  size = 'sm',
  riderNumber,
  className = '',
}: CombativityIconProps) {
  const { size: dimensions, fontSize } = DIMENSIONS[size];

  return (
    <svg
      width={dimensions}
      height={dimensions}
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      className={`flex-shrink-0 ${className}`}
    >
      <rect width="20" height="20" fill="#d32f2fd0" rx="2" />
      <text
        x="10"
        y="10"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={fontSize}
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        {riderNumber || '#'}
      </text>
    </svg>
  );
}
