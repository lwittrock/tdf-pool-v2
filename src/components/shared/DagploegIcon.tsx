/**
 * Dagploeg Icon
 *
 * A yellow number-bib (dossard jaune) — the marker the winning team's riders
 * wear for the day's team classification. Square, to sit alongside the
 * combativity red square in the stage jersey strip.
 */

interface DagploegIconProps {
  sizePx?: number;
  className?: string;
}

export function DagploegIcon({ sizePx = 16, className = '' }: DagploegIconProps) {
  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      className={`flex-shrink-0 ${className}`}
      role="img"
      aria-label="Dagploeg"
    >
      <rect x="1.5" y="1.5" width="17" height="17" rx="3" fill="#eab308" stroke="#a16207" strokeWidth="1.5" />
      {/* two stacked bars, evoking a stylised team of riders */}
      <rect x="5.5" y="7" width="9" height="1.8" rx="0.9" fill="#78350f" />
      <rect x="5.5" y="11.2" width="9" height="1.8" rx="0.9" fill="#78350f" />
    </svg>
  );
}
