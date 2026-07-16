/**
 * Small "Na etappe N (datum)" freshness line. Sits just below the search on
 * standings pages rather than under the page title, so the heading stays clean
 * (3.x polish). De-emphasized on purpose.
 */
export function FreshnessNote({
  stage,
  lastUpdated,
  className = '',
}: {
  stage: number;
  lastUpdated: string | null;
  className?: string;
}) {
  return (
    <p className={`text-xs text-tdf-text-secondary ${className}`}>
      Na etappe {stage}
      {lastUpdated ? ` (${lastUpdated})` : ''}
    </p>
  );
}
