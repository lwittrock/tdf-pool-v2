/**
 * A rider's name, with an "uitgevallen" chip + muted styling when the rider has
 * abandoned (DNF/DNS in any stage). Keeps the marking identical across the
 * Rennerpunten and Ploegen lists (5.5).
 */
export function RiderName({ name, abandoned }: { name: string; abandoned?: boolean }) {
  if (!abandoned) return <>{name}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-tdf-text-muted">{name}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-tdf-button-inactive text-tdf-text-secondary">
        uitgevallen
      </span>
    </span>
  );
}
