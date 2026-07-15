import type { StageData } from '../../../lib/types';

interface StageListViewProps {
  stages: StageData[];
  nextStageNumber: number;
  successMessage: string;
  onViewStage: (stageNumber: number) => void;
  onOpenEntry: (stageNumber: number) => void;
}

export function StageListView({
  stages,
  nextStageNumber,
  successMessage,
  onViewStage,
  onOpenEntry
}: StageListViewProps) {
  return (
    <>
      <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">
        Etappes Overzicht
      </h2>

      {successMessage && (
        <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-lg">
          {successMessage}
        </div>
      )}

      {/* Completed stages */}
      <div className="space-y-2 mb-6">
        {stages.map(stage => (
          <div
            key={stage.stage_number}
            onClick={() => onViewStage(stage.stage_number)}
            className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <span className="text-2xl">
                  {stage.is_complete ? '✓' : '○'}
                </span>
                <div className="flex-1">
                  <div className="font-bold text-tdf-text-primary">
                    Etappe {stage.stage_number}
                  </div>
                  {stage.departure_city && stage.arrival_city && (
                    <div className="text-sm text-tdf-text-secondary">
                      {stage.departure_city} → {stage.arrival_city}
                    </div>
                  )}
                  {stage.date && (
                    <div className="text-xs text-tdf-text-secondary">
                      {new Date(stage.date).toLocaleDateString('nl-NL')}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-tdf-primary">→</div>
            </div>
          </div>
        ))}
      </div>

      {/* Next stage to enter */}
      {nextStageNumber <= 21 && (
        <div className="bg-tdf-accent bg-opacity-10 border-2 border-tdf-accent rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-tdf-primary text-lg">
                Etappe {nextStageNumber}
              </div>
              <div className="text-sm text-gray-600">
                Nog geen data ingevoerd
              </div>
            </div>
            <button
              onClick={() => onOpenEntry(nextStageNumber)}
              className="px-6 py-3 bg-tdf-accent text-white rounded-lg hover:bg-yellow-600 font-semibold"
            >
              Voer Data In
            </button>
          </div>
        </div>
      )}
    </>
  );
}
