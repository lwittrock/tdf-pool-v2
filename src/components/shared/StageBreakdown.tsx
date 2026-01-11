/**
 * Stage Breakdown Component
 * 
 * Displays detailed per-stage breakdown for riders or participants.
 */

import { JerseyList } from './JerseyIcons';
import { CombativityIcon } from './CombativityIcon';
import { getStageAwards } from '../../../lib/data-transforms';
import type { StageInfo } from '../../../lib/types';

interface StageBreakdownProps {
  stages: StageInfo[];
  title?: string;
  className?: string;
}

interface StageRowProps {
  stage: StageInfo;
}

/**
 * Single stage row in breakdown
 */
function StageRow({ stage }: StageRowProps) {
  const { jerseys, hasCombative } = getStageAwards(stage);

  return (
    <div className="flex justify-between items-center py-1 px-2 rounded hover:bg-table-header">
      <div className="flex items-center">
        <span className="text-sm text-tdf-text-highlight w-20 sm:w-24">
          Etappe {stage.stageNum}:
        </span>

        <span className="text-xs text-tdf-text-secondary w-10 sm:w-16">
          {stage.stage_finish_position > 0 ? `# ${stage.stage_finish_position}` : ''}
        </span>

        {(jerseys.length > 0 || hasCombative) && (
          <div className="flex gap-1 items-center">
            <JerseyList jerseys={jerseys} />
            {hasCombative && <CombativityIcon size="sm" />}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-bold">{stage.stage_total}</span>
      </div>
    </div>
  );
}

/**
 * Complete stage breakdown list
 */
export function StageBreakdown({ stages, title = 'Punten per Etappe', className = '' }: StageBreakdownProps) {
  if (stages.length === 0) {
    return (
      <div className={`text-sm text-tdf-text-secondary ${className}`}>
        Geen etappe gegevens beschikbaar
      </div>
    );
  }

  return (
    <div className={className}>
      {title && (
        <h3 className="text-sm font-semibold mb-2 pb-2 text-tdf-text-highlight border-b">
          {title}
        </h3>
      )}
      <div className="space-y-1">
        {stages.map((stage) => (
          <StageRow key={stage.stageKey} stage={stage} />
        ))}
      </div>
    </div>
  );
}
