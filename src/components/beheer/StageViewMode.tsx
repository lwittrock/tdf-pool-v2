import { JERSEY_ICONS } from '../../../lib/constants';
import type { StageFormData } from './stage-form';

interface StageViewModeProps {
  formData: StageFormData;
  onBack: () => void;
  onEdit: () => void;
}

export function StageViewMode({ formData, onBack, onEdit }: StageViewModeProps) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-tdf-primary hover:underline"
        >
          ← Terug naar overzicht
        </button>
        <button
          onClick={onEdit}
          className="px-4 py-2 bg-tdf-accent text-white rounded-lg hover:bg-yellow-600"
        >
          Bewerk
        </button>
      </div>

      <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">
        Etappe {formData.stage_number}
      </h2>

      {/* Stage metadata */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-4">
        <h3 className="font-semibold text-lg mb-3">Etappe Informatie</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-600">Datum:</span>
            <div className="font-medium">
              {formData.date ? new Date(formData.date).toLocaleDateString('nl-NL') : '-'}
            </div>
          </div>
          <div>
            <span className="text-gray-600">Afstand:</span>
            <div className="font-medium">{formData.distance || '-'} km</div>
          </div>
          <div>
            <span className="text-gray-600">Start:</span>
            <div className="font-medium">{formData.departure_city || '-'}</div>
          </div>
          <div>
            <span className="text-gray-600">Finish:</span>
            <div className="font-medium">{formData.arrival_city || '-'}</div>
          </div>
          <div>
            <span className="text-gray-600">Type:</span>
            <div className="font-medium">{formData.difficulty || '-'}</div>
          </div>
          <div>
            <span className="text-gray-600">Gewonnen door:</span>
            <div className="font-medium">{formData.won_how || '-'}</div>
          </div>
        </div>
      </div>

      {/* Top finishers */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-4">
        <h3 className="font-semibold text-lg mb-3">Top 20 Uitslag</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {formData.top_20_finishers.filter(f => f.rider_name).map((finisher) => (
            <div key={finisher.position} className="flex items-center gap-2 text-sm">
              <span className="font-medium w-8">{finisher.position}.</span>
              <span>{finisher.rider_name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Jerseys */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-4">
        <h3 className="font-semibold text-lg mb-3">Truien</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <img src={JERSEY_ICONS.yellow} alt="Yellow" className="w-6 h-6" />
            <span className="text-sm font-medium">{formData.jerseys.yellow || '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <img src={JERSEY_ICONS.green} alt="Green" className="w-6 h-6" />
            <span className="text-sm font-medium">{formData.jerseys.green || '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <img src={JERSEY_ICONS.polka_dot} alt="Polka" className="w-6 h-6" />
            <span className="text-sm font-medium">{formData.jerseys.polka_dot || '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <img src={JERSEY_ICONS.white} alt="White" className="w-6 h-6" />
            <span className="text-sm font-medium">{formData.jerseys.white || '-'}</span>
          </div>
        </div>
      </div>

      {/* Combativity and DNF/DNS */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-4">
        <h3 className="font-semibold text-lg mb-3">Overig</h3>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-gray-600">Strijdlustigste renner:</span>
            <div className="font-medium">{formData.combativity || '-'}</div>
          </div>
          <div>
            <span className="text-gray-600">Dagploeg (ploegen-dagklassement):</span>
            <div className="font-medium">{formData.dagploeg || '-'}</div>
          </div>
          {formData.dnf_riders.length > 0 && (
            <div>
              <span className="text-gray-600">DNF:</span>
              <div className="font-medium">{formData.dnf_riders.join(', ')}</div>
            </div>
          )}
          {formData.dns_riders.length > 0 && (
            <div>
              <span className="text-gray-600">DNS:</span>
              <div className="font-medium">{formData.dns_riders.join(', ')}</div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Terug
        </button>
        <button
          onClick={onEdit}
          className="px-6 py-3 bg-tdf-accent text-white rounded-lg hover:bg-yellow-600 font-semibold"
        >
          Bewerk Etappe
        </button>
      </div>
    </>
  );
}
