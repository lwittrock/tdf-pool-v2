import type { StageData } from '../../../lib/types';
import type { StageFormData, SubmitResult } from './stage-form';
import {
  StageMetadataForm,
  StageFinishersForm,
  StageJerseysForm,
  StageCombativityForm,
  StageDagploegForm,
  StageDNFForm,
} from './entry-forms';

interface StageEntryModeProps {
  formData: StageFormData;
  riders: Array<{ id: string; name: string; team?: string }>;
  stages: StageData[];
  submitting: boolean;
  successMessage: string;
  errorMessage: string;
  submitResult: SubmitResult | null;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onUpdateFormData: (data: StageFormData) => void;
  onUpdateFinisher: (index: number, riderName: string) => void;
  onPcsPrefill: () => void;
  prefilling: boolean;
  prefillFeedback: string[];
}

export function StageEntryMode({
  formData,
  riders,
  stages,
  submitting,
  successMessage,
  errorMessage,
  submitResult,
  onBack,
  onSubmit,
  onUpdateFormData,
  onUpdateFinisher,
  onPcsPrefill,
  prefilling,
  prefillFeedback,
}: StageEntryModeProps) {
  const isEditingCompletedStage = stages.find(
    s => s.stage_number === formData.stage_number && s.is_complete
  );

  return (
    <>
      <div className="mb-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-tdf-primary hover:underline"
        >
          ← Terug naar overzicht
        </button>
        <h2 className="text-xl sm:text-2xl font-semibold text-tdf-primary">
          Etappe {formData.stage_number} Invoeren
        </h2>
      </div>

      {isEditingCompletedStage && (
        <div className="mb-4 p-4 bg-orange-100 text-orange-700 rounded-lg">
          ⚠️ Let op: Deze etappe is al verwerkt. Wijzigingen herberekenen alle punten!
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg whitespace-pre-line">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-lg">
          {successMessage}
        </div>
      )}

      {/* Verwerkingsresultaat: waarschuwingen en vervangingen blijven staan
          tot de invoerder ze gezien heeft (fact 5) */}
      {submitResult && (
        <div className="mb-4 space-y-3">
          {submitResult.warnings.length > 0 && (
            <div className="p-4 bg-orange-100 text-orange-800 rounded-lg text-sm">
              <div className="font-semibold mb-1">Let op (niet blokkerend — de etappe is opgeslagen):</div>
              <ul className="list-disc list-inside space-y-1">
                {submitResult.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          {submitResult.substitutions.length > 0 && (
            <div className="p-4 bg-orange-100 text-orange-800 rounded-lg text-sm">
              <div className="font-semibold mb-1">Reserves geactiveerd:</div>
              <ul className="list-disc list-inside space-y-1">
                {submitResult.substitutions.map((sub, i) => (
                  <li key={i}>
                    {sub.participant_name}: {sub.rider_in} vervangt {sub.rider_out}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Terug naar overzicht
          </button>
        </div>
      )}

      {/* PCS-prefill: één tik vult het formulier; nalezen + opslaan blijft
          de menselijke stap. Nogmaals tikken haalt later binnengekomen
          velden (strijdlust, dagploeg) op zonder ingevulde te wissen. */}
      <div className="mb-6 bg-white rounded-lg shadow-md p-4 space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-lg">Automatisch invullen</h3>
            <p className="text-sm text-gray-600">
              Haalt uitslag, truien, strijdlust, dagploeg en opgaves op van ProCyclingStats.
            </p>
          </div>
          <button
            type="button"
            onClick={onPcsPrefill}
            disabled={prefilling || submitting}
            className="px-4 py-2 bg-tdf-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium"
          >
            {prefilling ? 'Bezig met ophalen…' : '📥 Haal op van PCS'}
          </button>
        </div>
        {prefillFeedback.length > 0 && (
          <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
            {prefillFeedback.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <StageMetadataForm formData={formData} onUpdate={onUpdateFormData} />

        <StageFinishersForm
          formData={formData}
          riders={riders}
          onUpdateFinisher={onUpdateFinisher}
          onUpdate={onUpdateFormData}
        />

        <StageJerseysForm formData={formData} riders={riders} onUpdate={onUpdateFormData} />

        <StageCombativityForm formData={formData} riders={riders} onUpdate={onUpdateFormData} />

        <StageDagploegForm formData={formData} riders={riders} onUpdate={onUpdateFormData} />

        <StageDNFForm formData={formData} riders={riders} onUpdate={onUpdateFormData} />

        {/* Submit */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            Annuleer
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-6 py-3 bg-tdf-accent text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 font-semibold"
          >
            {submitting ? 'Bezig met opslaan...' : 'Opslaan & Verwerken'}
          </button>
        </div>
      </form>
    </>
  );
}
