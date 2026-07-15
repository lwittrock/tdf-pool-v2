/**
 * Full-screen loading and error states shared by the standings pages
 * (Klassement, RennerPunten). Dutch strings come from LABELS so the whole
 * site speaks one language (finding 4.4).
 */

import { LABELS } from '../../lib/constants';

export function LoadingState({ subtitle }: { subtitle?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-tdf-bg">
      <div className="text-center">
        <div className="text-2xl font-bold text-tdf-primary mb-4">{LABELS.LOADING}</div>
        {subtitle && <div className="text-tdf-text-secondary">{subtitle}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-tdf-bg">
      <div className="text-center">
        <div className="text-2xl font-bold text-tdf-red mb-4">{LABELS.ERROR}</div>
        {message && <div className="text-tdf-text-secondary mb-4">{message}</div>}
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-tdf-accent text-tdf-on-accent font-semibold rounded hover:brightness-95"
        >
          {LABELS.RETRY}
        </button>
      </div>
    </div>
  );
}
