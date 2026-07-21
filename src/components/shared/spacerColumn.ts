import type { Column } from './StandingsTable';

/**
 * A flexible, empty spacer column for a StandingsTable. Place one between the
 * name column and the secondary column (e.g. Deelnemer | spacer | Directie):
 * `w-full` makes it soak up all the leftover row width, so the name hugs the
 * left (by the rank), the secondary column floats right (by the values), and
 * the gap between them grows/shrinks with the screen — no fixed widths.
 */
export function spacerColumn<T>(key: string): Column<T> {
  return { key, header: '', headerClassName: 'w-full', cellClassName: 'w-full', render: () => null };
}
