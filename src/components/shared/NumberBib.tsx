/**
 * NumberBib — a rider's race-number bib, used as a small inline award marker.
 *
 * One shape (a rounded square with a bold figure) in two colour variants, so
 * the strijdlust and dagploeg markers read as the same family (#11):
 *   • combative — red, the stage's most combative rider (strijdlust)
 *   • best      — yellow (dossard jaune), the winning day-team (dagploeg)
 *
 * Replaces the former separate CombativityIcon + DagploegIcon.
 */

interface NumberBibProps {
  variant?: 'combative' | 'best';
  size?: 'sm' | 'md';
  /** Explicit pixel size, overriding the `size` preset. */
  sizePx?: number;
  /** Figure shown on the bib; defaults to a neutral '#'. */
  label?: string | number;
  className?: string;
}

const DIMENSIONS = {
  sm: { size: 12, fontSize: 10 },
  md: { size: 15, fontSize: 12 },
} as const;

// Yellow needs a darker figure + a rim to hold up on a light background; the
// red bib reads fine as a solid fill with white text.
const VARIANTS = {
  combative: { fill: '#d32f2fd0', stroke: 'none', strokeWidth: 0, text: '#ffffff', aria: 'Strijdlust' },
  best: { fill: '#eab308', stroke: '#a16207', strokeWidth: 1.5, text: '#78350f', aria: 'Dagploeg' },
} as const;

export function NumberBib({
  variant = 'combative',
  size = 'sm',
  sizePx,
  label,
  className = '',
}: NumberBibProps) {
  const dimensions = sizePx ?? DIMENSIONS[size].size;
  const fontSize = sizePx ? Math.round(sizePx * 0.66) : DIMENSIONS[size].fontSize;
  const v = VARIANTS[variant];
  const inset = v.strokeWidth / 2;

  return (
    <svg
      width={dimensions}
      height={dimensions}
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      className={`flex-shrink-0 ${className}`}
      role="img"
      aria-label={v.aria}
    >
      <rect
        x={inset}
        y={inset}
        width={20 - v.strokeWidth}
        height={20 - v.strokeWidth}
        rx="3"
        fill={v.fill}
        stroke={v.stroke}
        strokeWidth={v.strokeWidth}
      />
      <text
        x="10"
        y="10"
        textAnchor="middle"
        dominantBaseline="central"
        fill={v.text}
        fontSize={fontSize}
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        {label ?? '#'}
      </text>
    </svg>
  );
}
