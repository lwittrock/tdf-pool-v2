/**
 * Shared standings primitives used by Poule, Rennerpunten and Etappes.
 *
 * `StandingsTable` renders the desktop table skeleton (card surface, styled
 * header, hairline row dividers — no zebra, optional click-to-expand row) from
 * a column spec, so the hand-rolled tables share one place for header tokens,
 * dividers and keyboard affordance. `ExpandableCard` is the mobile counterpart:
 * the card shell + expansion region, with bespoke content passed as children.
 *
 * Cell/heading content stays bespoke — pass it via `Column.render` / `header`
 * and per-column `cellClassName` (e.g. font-semibold, score colours).
 */

import React from 'react';

export type Align = 'left' | 'right' | 'center';

const alignClass: Record<Align, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  align?: Align; // default 'left'
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T, index: number) => React.ReactNode;
}

interface StandingsTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** When set, rows are clickable/keyboard-focusable and can expand. */
  onRowClick?: (row: T) => void;
  isRowExpanded?: (row: T) => boolean;
  renderExpanded?: (row: T) => React.ReactNode;
}

export function StandingsTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  isRowExpanded,
  renderExpanded,
}: StandingsTableProps<T>) {
  const expandable = Boolean(onRowClick);

  return (
    // Card surface (design direction A): one rounded, bordered surface with a
    // soft shadow, hairline row dividers and no zebra — the same language as
    // the mobile ExpandableCards. No overflow-hidden here: the header stays
    // sticky to the page scroll, which an overflow container would disable.
    <div className="hidden lg:block rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full">
        <thead>
          {/* Uppercase micro-labels over a hairline rule (no fill). bg-white
              keeps the header opaque so rows don't bleed through as they
              scroll under it — it stays sticky to the page scroll (6.3). */}
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`sticky top-0 z-10 whitespace-nowrap bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-tdf-text-secondary border-b border-gray-200 first:rounded-tl-xl last:rounded-tr-xl ${alignClass[col.align ?? 'left']} ${col.headerClassName ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, idx) => {
            const key = getRowKey(row);
            const expanded = isRowExpanded?.(row) ?? false;
            const expandedContent = expanded && renderExpanded ? renderExpanded(row) : null;
            return (
              <React.Fragment key={key}>
                <tr
                  className={expandable ? 'cursor-pointer hover:bg-tdf-card-hover' : ''}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={expandable ? 0 : undefined}
                  aria-expanded={expandable ? expanded : undefined}
                  onKeyDown={
                    expandable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick!(row);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`whitespace-nowrap px-4 py-2.5 text-sm ${alignClass[col.align ?? 'left']} ${col.cellClassName ?? ''}`}
                    >
                      {col.render(row, idx)}
                    </td>
                  ))}
                </tr>
                {expandedContent && (
                  <tr className="bg-tdf-card-hover">
                    <td colSpan={columns.length} className="px-4 py-4">
                      {expandedContent}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface ExpandableCardProps {
  expanded: boolean;
  onToggle: () => void;
  /** Always-visible card header (rank / name / score row). */
  header: React.ReactNode;
  /** Expansion body; when omitted the card is not expandable. */
  children?: React.ReactNode;
}

/** Mobile counterpart to a StandingsTable row: card shell + expansion region. */
export function ExpandableCard({ expanded, onToggle, header, children }: ExpandableCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className="p-3 cursor-pointer active:bg-tdf-bg"
      >
        {header}
      </div>
      {expanded && children && (
        <div className="px-3 pb-3 bg-tdf-bg border-t border-gray-200">
          <div className="pt-3">{children}</div>
        </div>
      )}
    </div>
  );
}
