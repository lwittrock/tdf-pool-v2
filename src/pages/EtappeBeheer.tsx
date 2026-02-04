/**
 * StageManagement Page (Optimized)
 * 
 * Optimizations:
 * - Uses shared types from lib/types.ts
 * - Uses constants from lib/constants.ts
 * - Extracted form logic into custom hooks
 * - Better state management with useMemo
 * - Separated concerns (view/entry/list)
 * - Type-safe throughout
 */

import { useState, useMemo, useCallback } from 'react';
import Layout from '../components/Layout';
import { Autocomplete, MultiAutocomplete } from '../components/Autocomplete';
import { useRefreshTdfData } from '../hooks/useRefreshTdfData';
import { useStagesData, useRiders } from '../hooks/useTdfData';
import { JERSEY_ICONS } from '../../lib/constants';
import type { StageData, RidersData } from '../../lib/types';
import { TestDataSeeder } from '../components/TestDataSeeder';

// ============================================================================
// Types
// ============================================================================

interface StageFormData {
  stage_number: number;
  date: string;
  distance: string;
  departure_city: string;
  arrival_city: string;
  stage_type: string;
  difficulty: string;
  won_how: string;
  top_20_finishers: Array<{ rider_name: string; position: number }>;
  jerseys: {
    yellow: string;
    green: string;
    polka_dot: string;
    white: string;
  };
  combativity: string;
  dnf_riders: string[];
  dns_riders: string[];
}

type ViewMode = 'list' | 'entry' | 'view';

// ============================================================================
// Constants
// ============================================================================

const STAGE_TYPES = [
  'Flat',
  'Hills, flat finish',
  'Hills, uphill finish',
  'Mountains, flat finish',
  'Mountains, uphill finish',
] as const;

const EMPTY_FORM_DATA: StageFormData = {
  stage_number: 1,
  date: '',
  distance: '',
  departure_city: '',
  arrival_city: '',
  stage_type: '',
  difficulty: 'Flat',
  won_how: '',
  top_20_finishers: Array.from({ length: 20 }, (_, i) => ({ 
    rider_name: '', 
    position: i + 1 
  })),
  jerseys: { yellow: '', green: '', polka_dot: '', white: '' },
  combativity: '',
  dnf_riders: [],
  dns_riders: [],
};

// ============================================================================
// Helper Functions
// ============================================================================

function getNextStageNumber(stages: StageData[]): number {
  if (stages.length === 0) return 1;
  const maxStage = Math.max(...stages.map(s => s.stage_number));
  return Math.min(maxStage + 1, 21);
}

function padFinishersTo20(finishers: Array<{ rider_name: string; position: number }>): Array<{ rider_name: string; position: number }> {
  const padded = [...finishers];
  while (padded.length < 20) {
    padded.push({ rider_name: '', position: padded.length + 1 });
  }
  return padded;
}

function createFormDataFromStage(stage: StageData): StageFormData {
  return {
    stage_number: stage.stage_number,
    date: stage.date || '',
    distance: stage.distance || '',
    departure_city: stage.departure_city || '',
    arrival_city: stage.arrival_city || '',
    stage_type: stage.stage_type || '',
    difficulty: stage.difficulty || 'Flat',
    won_how: stage.won_how || '',
    top_20_finishers: padFinishersTo20(stage.top_20_finishers || []),
    jerseys: stage.jerseys || { yellow: '', green: '', polka_dot: '', white: '' },
    combativity: stage.combativity || '',
    dnf_riders: stage.dnf_riders || [],
    dns_riders: stage.dns_riders || [],
  };
}

// ============================================================================
// Main Component
// ============================================================================

function StageManagementPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const { refreshAll } = useRefreshTdfData();

  const [formData, setFormData] = useState<StageFormData>(EMPTY_FORM_DATA);

  // Fetch data
  const { data: ridersData, isLoading: ridersLoading } = useRiders();
  const { data: stagesData, isLoading: stagesLoading } = useStagesData();

  // Memoized calculations
  const loading = ridersLoading || stagesLoading;

  const riders = useMemo(() => {
    if (!ridersData) return [];
    return Object.keys(ridersData as RidersData).map(name => ({ 
      id: name,  // Use name as ID since riders are keyed by name
      name 
    }));
  }, [ridersData]);

  const stages = useMemo(() => {
    return stagesData || [];
  }, [stagesData]);

  const nextStageNumber = useMemo(() => {
    return getNextStageNumber(stages);
  }, [stages]);

  // Event handlers
  const handleOpenEntry = useCallback((stageNumber: number) => {
    setFormData({
      ...EMPTY_FORM_DATA,
      stage_number: stageNumber,
    });
    setViewMode('entry');
    setSuccessMessage('');
    setErrorMessage('');
  }, []);

  const handleViewStage = useCallback((stageNumber: number) => {
    const stage = stages.find(s => s.stage_number === stageNumber);
    if (!stage) {
      setErrorMessage('Stage not found');
      return;
    }

    setFormData(createFormDataFromStage(stage));
    setViewMode('view');
  }, [stages]);

  const handleEditMode = useCallback(() => {
    setViewMode('entry');
  }, []);

  const handleUpdateFinisher = useCallback((index: number, riderName: string) => {
    setFormData(prev => ({
      ...prev,
      top_20_finishers: prev.top_20_finishers.map((f, i) => 
        i === index ? { rider_name: riderName, position: index + 1 } : f
      )
    }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.date || !formData.departure_city || !formData.arrival_city) {
      setErrorMessage('Vul alle verplichte velden in');
      return;
    }

    const validFinishers = formData.top_20_finishers.filter(f => f.rider_name.trim() !== '');
    
    if (validFinishers.length === 0) {
      setErrorMessage('Voeg minimaal 1 renner toe aan de uitslag');
      return;
    }

    if (!formData.jerseys.yellow || !formData.jerseys.green || 
        !formData.jerseys.polka_dot || !formData.jerseys.white) {
      setErrorMessage('Vul alle truien in');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      // Check if stage is already complete
      const existingStage = stages.find(s => s.stage_number === formData.stage_number);
      let shouldForce = false;

      if (existingStage?.is_complete) {
        const confirmReprocess = window.confirm(
          `⚠️ Etappe ${formData.stage_number} is al verwerkt.\n\n` +
          `Wil je deze etappe opnieuw invoeren en verwerken?\n\n` +
          `Dit zal de bestaande resultaten overschrijven.`
        );
        
        if (!confirmReprocess) {
          setSubmitting(false);
          setErrorMessage('Bewerking geannuleerd');
          return;
        }
        
        shouldForce = true;
      }

      // Step 1: Save stage data
      const saveResponse = await fetch('/api/admin/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          top_20_finishers: validFinishers,
          force: shouldForce,
        }),
      });

      if (!saveResponse.ok) {
        const error = await saveResponse.json();
        throw new Error(error.error || 'Failed to save stage');
      }

      // Step 2: Process stage (calculate points)
      const processResponse = await fetch('/api/admin/process-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          stage_number: formData.stage_number,
          force: shouldForce 
        }),
      });

      if (!processResponse.ok) {
        const error = await processResponse.json();
        throw new Error(error.error || 'Failed to process stage');
      }

      setSuccessMessage(`Etappe ${formData.stage_number} succesvol opgeslagen en verwerkt!`);
      
      // Refresh data and return to list
      setTimeout(async () => {
        setViewMode('list');
        setSuccessMessage('Data wordt vernieuwd...');
        
        await refreshAll();
        
        setSuccessMessage('✅ Data succesvol bijgewerkt!');
        setTimeout(() => setSuccessMessage(''), 2000);
      }, 2000);

    } catch (error: any) {
      console.error('Submit error:', error);
      setErrorMessage(error.message || 'Er is een fout opgetreden');
    } finally {
      setSubmitting(false);
    }
  }, [formData, stages, refreshAll]);

  // Loading state
  if (loading) {
    return (
      <Layout title="Etappe Beheer">
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout title="Etappe Beheer">
      <main>
        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <StageListView
            stages={stages}
            nextStageNumber={nextStageNumber}
            successMessage={successMessage}
            onViewStage={handleViewStage}
            onOpenEntry={handleOpenEntry}
          />
        )}
        <TestDataSeeder />
        {/* VIEW MODE */}
        {viewMode === 'view' && (
          <StageViewMode
            formData={formData}
            onBack={() => setViewMode('list')}
            onEdit={handleEditMode}
          />
        )}

        {/* ENTRY MODE */}
        {viewMode === 'entry' && (
          <StageEntryMode
            formData={formData}
            riders={riders}
            stages={stages}
            submitting={submitting}
            successMessage={successMessage}
            errorMessage={errorMessage}
            onBack={() => setViewMode('list')}
            onSubmit={handleSubmit}
            onUpdateFormData={setFormData}
            onUpdateFinisher={handleUpdateFinisher}
          />
        )}
      </main>
    </Layout>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

interface StageListViewProps {
  stages: StageData[];
  nextStageNumber: number;
  successMessage: string;
  onViewStage: (stageNumber: number) => void;
  onOpenEntry: (stageNumber: number) => void;
}

function StageListView({ 
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

interface StageViewModeProps {
  formData: StageFormData;
  onBack: () => void;
  onEdit: () => void;
}

function StageViewMode({ formData, onBack, onEdit }: StageViewModeProps) {
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

interface StageEntryModeProps {
  formData: StageFormData;
  riders: Array<{ id: string; name: string }>;
  stages: StageData[];
  submitting: boolean;
  successMessage: string;
  errorMessage: string;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onUpdateFormData: (data: StageFormData) => void;
  onUpdateFinisher: (index: number, riderName: string) => void;
}

function StageEntryMode({
  formData,
  riders,
  stages,
  submitting,
  successMessage,
  errorMessage,
  onBack,
  onSubmit,
  onUpdateFormData,
  onUpdateFinisher,
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
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-lg">
          {successMessage}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Stage metadata */}
        <StageMetadataForm
          formData={formData}
          onUpdate={onUpdateFormData}
        />

        {/* Top 20 finishers */}
        <StageFinishersForm
          formData={formData}
          riders={riders}
          onUpdateFinisher={onUpdateFinisher}
        />

        {/* Jerseys */}
        <StageJerseysForm
          formData={formData}
          riders={riders}
          onUpdate={onUpdateFormData}
        />

        {/* Combativity */}
        <StageCombativityForm
          formData={formData}
          riders={riders}
          onUpdate={onUpdateFormData}
        />

        {/* DNF/DNS */}
        <StageDNFForm
          formData={formData}
          riders={riders}
          onUpdate={onUpdateFormData}
        />

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

// Form sub-components
function StageMetadataForm({ 
  formData, 
  onUpdate 
}: { 
  formData: StageFormData; 
  onUpdate: (data: StageFormData) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
      <h3 className="font-semibold text-lg">Etappe Informatie</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Datum *</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => onUpdate({ ...formData, date: e.target.value })}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Afstand (km)</label>
          <input
            type="text"
            value={formData.distance}
            onChange={(e) => onUpdate({ ...formData, distance: e.target.value })}
            placeholder="175.5"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Start *</label>
          <input
            type="text"
            value={formData.departure_city}
            onChange={(e) => onUpdate({ ...formData, departure_city: e.target.value })}
            required
            placeholder="Nice"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Finish *</label>
          <input
            type="text"
            value={formData.arrival_city}
            onChange={(e) => onUpdate({ ...formData, arrival_city: e.target.value })}
            required
            placeholder="Col de la Bonette"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            value={formData.difficulty}
            onChange={(e) => onUpdate({ ...formData, difficulty: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            {STAGE_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Gewonnen door</label>
          <input
            type="text"
            value={formData.won_how}
            onChange={(e) => onUpdate({ ...formData, won_how: e.target.value })}
            placeholder="Sprint, Solo, Breakaway..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}

function StageFinishersForm({
  formData,
  riders,
  onUpdateFinisher,
}: {
  formData: StageFormData;
  riders: Array<{ id: string; name: string }>;
  onUpdateFinisher: (index: number, riderName: string) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
      <h3 className="font-semibold text-lg">Top 20 Uitslag</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {formData.top_20_finishers.map((finisher, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="text-sm font-medium w-8">{index + 1}.</span>
            <Autocomplete
              options={riders}
              value={finisher.rider_name}
              onChange={(value: string) => onUpdateFinisher(index, value)}
              placeholder="Selecteer renner..."
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function StageJerseysForm({
  formData,
  riders,
  onUpdate,
}: {
  formData: StageFormData;
  riders: Array<{ id: string; name: string }>;
  onUpdate: (data: StageFormData) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
      <h3 className="font-semibold text-lg">Truien</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 flex items-center gap-2">
            <img src={JERSEY_ICONS.yellow} alt="Yellow" className="w-5 h-5" />
            Gele Trui *
          </label>
          <Autocomplete
            options={riders}
            value={formData.jerseys.yellow}
            onChange={(value: string) => onUpdate({ 
              ...formData, 
              jerseys: { ...formData.jerseys, yellow: value }
            })}
            placeholder="Selecteer renner..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 flex items-center gap-2">
            <img src={JERSEY_ICONS.green} alt="Green" className="w-5 h-5" />
            Groene Trui *
          </label>
          <Autocomplete
            options={riders}
            value={formData.jerseys.green}
            onChange={(value: string) => onUpdate({ 
              ...formData, 
              jerseys: { ...formData.jerseys, green: value }
            })}
            placeholder="Selecteer renner..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 flex items-center gap-2">
            <img src={JERSEY_ICONS.polka_dot} alt="Polka" className="w-5 h-5" />
            Bolletjestrui *
          </label>
          <Autocomplete
            options={riders}
            value={formData.jerseys.polka_dot}
            onChange={(value: string) => onUpdate({ 
              ...formData, 
              jerseys: { ...formData.jerseys, polka_dot: value }
            })}
            placeholder="Selecteer renner..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 flex items-center gap-2">
            <img src={JERSEY_ICONS.white} alt="White" className="w-5 h-5" />
            Witte Trui *
          </label>
          <Autocomplete
            options={riders}
            value={formData.jerseys.white}
            onChange={(value: string) => onUpdate({ 
              ...formData, 
              jerseys: { ...formData.jerseys, white: value }
            })}
            placeholder="Selecteer renner..."
          />
        </div>
      </div>
    </div>
  );
}

function StageCombativityForm({
  formData,
  riders,
  onUpdate,
}: {
  formData: StageFormData;
  riders: Array<{ id: string; name: string }>;
  onUpdate: (data: StageFormData) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
      <h3 className="font-semibold text-lg">Strijdlust</h3>
      <div>
        <label className="block text-sm font-medium mb-1">Strijdlustigste Renner</label>
        <Autocomplete
          options={riders}
          value={formData.combativity}
          onChange={(value: string) => onUpdate({ ...formData, combativity: value })}
          placeholder="Selecteer renner..."
        />
      </div>
    </div>
  );
}

function StageDNFForm({
  formData,
  riders,
  onUpdate,
}: {
  formData: StageFormData;
  riders: Array<{ id: string; name: string }>;
  onUpdate: (data: StageFormData) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
      <h3 className="font-semibold text-lg">Uitvallers</h3>
      
      <div>
        <label className="block text-sm font-medium mb-1">DNF (Did Not Finish)</label>
        <MultiAutocomplete
          options={riders}
          selectedValues={formData.dnf_riders}
          onChange={(values: string[]) => onUpdate({ ...formData, dnf_riders: values })}
          placeholder="Selecteer renners..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">DNS (Did Not Start)</label>
        <MultiAutocomplete
          options={riders}
          selectedValues={formData.dns_riders}
          onChange={(values: string[]) => onUpdate({ ...formData, dns_riders: values })}
          placeholder="Selecteer renners..."
        />
      </div>
    </div>
  );
}

export default StageManagementPage;