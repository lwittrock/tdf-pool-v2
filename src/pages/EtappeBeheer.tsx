import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Autocomplete, MultiAutocomplete } from '../components/Autocomplete';
import { useQueryClient } from '@tanstack/react-query';

// Jersey icons
const yellowIcon = '/assets/jersey_yellow.svg';
const greenIcon = '/assets/jersey_green.svg';
const polkaDotIcon = '/assets/jersey_polka_dot.svg';
const whiteIcon = '/assets/jersey_white.svg';

interface Rider {
  id: string;
  name: string;
  team: string;
}

interface Stage {
  stage_number: number;
  date: string | null;
  distance: string | null;
  departure_city: string | null;
  arrival_city: string | null;
  stage_type: string | null;
  difficulty: string | null;
  won_how: string | null;
  is_complete: boolean;
  top_20_finishers?: Array<{ position: number; rider_name: string; time_gap?: string }>;
  jerseys?: {
    yellow: string;
    green: string;
    polka_dot: string;
    white: string;
  };
  combativity?: string;
  dnf_riders?: string[];
  dns_riders?: string[];
}

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

function StageManagementPage() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<StageFormData>({
    stage_number: 1,
    date: '',
    distance: '',
    departure_city: '',
    arrival_city: '',
    stage_type: '',
    difficulty: 'Flat',
    won_how: '',
    top_20_finishers: Array.from({ length: 20 }, (_, i) => ({ rider_name: '', position: i + 1 })),
    jerseys: { yellow: '', green: '', polka_dot: '', white: '' },
    combativity: '',
    dnf_riders: [],
    dns_riders: [],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch both riders list and stages data from static JSON
      const [ridersRes, stagesRes] = await Promise.all([
        fetch('/api/admin/riders-list'),  // Still from API for live rider list
        fetch('/data/stages_data.json'),  // From static JSON
      ]);

      if (ridersRes.ok) {
        const ridersData = await ridersRes.json();
        setRiders(ridersData);
      }

      if (stagesRes.ok) {
        const stagesData = await stagesRes.json();
        setStages(stagesData);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setErrorMessage('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const getNextStageNumber = () => {
    if (stages.length === 0) return 1;
    const maxStage = Math.max(...stages.map(s => s.stage_number));
    return Math.min(maxStage + 1, 21);
  };

  const handleOpenEntry = (stageNumber: number) => {
    setFormData({
      ...formData,
      stage_number: stageNumber,
      top_20_finishers: Array.from({ length: 20 }, (_, i) => ({ rider_name: '', position: i + 1 })),
    });
    setViewMode('entry');
    setSuccessMessage('');
    setErrorMessage('');
  };

  const handleViewStage = (stageNumber: number) => {
    setViewMode('view');
    
    // Find stage in already-loaded data
    const stageData = stages.find(s => s.stage_number === stageNumber);
    if (!stageData) {
      setErrorMessage('Stage not found');
      return;
    }

    // Pad finishers to 20
    const paddedFinishers = [...(stageData.top_20_finishers || [])];
    while (paddedFinishers.length < 20) {
      paddedFinishers.push({ rider_name: '', position: paddedFinishers.length + 1 });
    }

    setFormData({
      stage_number: stageData.stage_number,
      date: stageData.date || '',
      distance: stageData.distance || '',
      departure_city: stageData.departure_city || '',
      arrival_city: stageData.arrival_city || '',
      stage_type: stageData.stage_type || '',
      difficulty: stageData.difficulty || 'Flat',
      won_how: stageData.won_how || '',
      top_20_finishers: paddedFinishers,
      jerseys: stageData.jerseys || { yellow: '', green: '', polka_dot: '', white: '' },
      combativity: stageData.combativity || '',
      dnf_riders: stageData.dnf_riders || [],
      dns_riders: stageData.dns_riders || [],
    });
  };

  const handleEditMode = () => {
    setViewMode('entry');
  };

  const handleUpdateFinisher = (index: number, riderName: string) => {
    const newFinishers = [...formData.top_20_finishers];
    newFinishers[index] = { rider_name: riderName, position: index + 1 };
    setFormData({ ...formData, top_20_finishers: newFinishers });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.date || !formData.departure_city || !formData.arrival_city) {
      setErrorMessage('Vul alle verplichte velden in');
      return;
    }

    // Filter out empty finishers
    const validFinishers = formData.top_20_finishers.filter(f => f.rider_name.trim() !== '');
    
    if (validFinishers.length === 0) {
      setErrorMessage('Voeg minimaal 1 renner toe aan de uitslag');
      return;
    }

    // Check if all jerseys are filled
    if (!formData.jerseys.yellow || !formData.jerseys.green || 
        !formData.jerseys.polka_dot || !formData.jerseys.white) {
      setErrorMessage('Vul alle truien in');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      // First attempt - without force
      let response = await fetch('/api/admin/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          top_20_finishers: validFinishers,
          force: false,
        }),
      });

      // If stage is already complete, ask for confirmation
      if (!response.ok) {
        const errorData = await response.json();
        
        if (errorData.error?.includes('already marked as complete')) {
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
          
          // User confirmed - try again with force=true
          response = await fetch('/api/admin/manual-entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...formData,
              top_20_finishers: validFinishers,
              force: true,
            }),
          });
          
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save stage');
          }
        } else {
          throw new Error(errorData.error || 'Failed to save stage');
        }
      }

      // Step 2: Process stage (calculate points)
      const processResponse = await fetch('/api/admin/process-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_number: formData.stage_number }),
      });

      if (!processResponse.ok) {
        const error = await processResponse.json();
        throw new Error(error.error || 'Failed to process stage');
      }

      setSuccessMessage(`Etappe ${formData.stage_number} succesvol opgeslagen en verwerkt!`);
      
      // Show success with refresh option
      setTimeout(async () => {
        setViewMode('list');
        setSuccessMessage('Data wordt vernieuwd...');
        
        // Refetch all data
        await queryClient.invalidateQueries();
        
        setSuccessMessage('✅ Data succesvol bijgewerkt!');
        
        // Clear success message after 2 more seconds
        setTimeout(() => setSuccessMessage(''), 2000);
      }, 2000);

    } catch (error: any) {
      console.error('Submit error:', error);
      setErrorMessage(error.message || 'Er is een fout opgetreden');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Etappe Beheer">
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  const nextStageNumber = getNextStageNumber();

  return (
    <Layout title="Etappe Beheer">
      <main>
        {viewMode === 'list' && (
          <>
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-tdf-primary">
              Etappes Overzicht
            </h2>

            {/* Success/Error messages */}
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
                  onClick={() => handleViewStage(stage.stage_number)}
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
                    <div className="text-tdf-primary">
                      →
                    </div>
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
                    onClick={() => handleOpenEntry(nextStageNumber)}
                    className="px-6 py-3 bg-tdf-accent text-white rounded-lg hover:bg-yellow-600 font-semibold"
                  >
                    Voer Data In
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {viewMode === 'view' && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={() => setViewMode('list')}
                className="text-tdf-primary hover:underline"
              >
                ← Terug naar overzicht
              </button>
              <button
                onClick={handleEditMode}
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
                {formData.top_20_finishers.filter(f => f.rider_name).map((finisher, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
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
                  <img src={yellowIcon} alt="Yellow" className="w-6 h-6" />
                  <span className="text-sm font-medium">{formData.jerseys.yellow || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <img src={greenIcon} alt="Green" className="w-6 h-6" />
                  <span className="text-sm font-medium">{formData.jerseys.green || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <img src={polkaDotIcon} alt="Polka" className="w-6 h-6" />
                  <span className="text-sm font-medium">{formData.jerseys.polka_dot || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <img src={whiteIcon} alt="White" className="w-6 h-6" />
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

            {/* Bottom edit button */}
            <div className="flex justify-between">
              <button
                onClick={() => setViewMode('list')}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Terug
              </button>
              <button
                onClick={handleEditMode}
                className="px-6 py-3 bg-tdf-accent text-white rounded-lg hover:bg-yellow-600 font-semibold"
              >
                Bewerk Etappe
              </button>
            </div>
          </>
        )}

        {viewMode === 'entry' && (
          <>
            <div className="mb-4 flex items-center gap-4">
              <button
                onClick={() => setViewMode('list')}
                className="text-tdf-primary hover:underline"
              >
                ← Terug naar overzicht
              </button>
              <h2 className="text-xl sm:text-2xl font-semibold text-tdf-primary">
                Etappe {formData.stage_number} Invoeren
              </h2>
            </div>

            {/* Warning for editing completed stage */}
            {stages.find(s => s.stage_number === formData.stage_number && s.is_complete) && (
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

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Stage metadata */}
              <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
                <h3 className="font-semibold text-lg">Etappe Informatie</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Datum *</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Afstand (km)</label>
                    <input
                      type="text"
                      value={formData.distance}
                      onChange={(e) => setFormData({ ...formData, distance: e.target.value })}
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
                      onChange={(e) => setFormData({ ...formData, departure_city: e.target.value })}
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
                      onChange={(e) => setFormData({ ...formData, arrival_city: e.target.value })}
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
                      onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="Flat">Flat</option>
                      <option value="Hills, flat finish">Hills, flat finish</option>
                      <option value="Hills, uphill finish">Hills, uphill finish</option>
                      <option value="Mountains, flat finish">Mountains, flat finish</option>
                      <option value="Mountains, uphill finish">Mountains, uphill finish</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Gewonnen door</label>
                    <input
                      type="text"
                      value={formData.won_how}
                      onChange={(e) => setFormData({ ...formData, won_how: e.target.value })}
                      placeholder="Sprint, Solo, Breakaway..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Top 20 finishers */}
              <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
                <h3 className="font-semibold text-lg">Top 20 Uitslag</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {formData.top_20_finishers.map((finisher, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-sm font-medium w-8">{index + 1}.</span>
                      <Autocomplete
                        options={riders}
                        value={finisher.rider_name}
                        onChange={(value: string) => handleUpdateFinisher(index, value)}
                        placeholder="Selecteer renner..."
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Jerseys */}
              <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
                <h3 className="font-semibold text-lg">Truien</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                      <img src={yellowIcon} alt="Yellow" className="w-5 h-5" />
                      Gele Trui *
                    </label>
                    <Autocomplete
                      options={riders}
                      value={formData.jerseys.yellow}
                      onChange={(value: string) => setFormData({ 
                        ...formData, 
                        jerseys: { ...formData.jerseys, yellow: value }
                      })}
                      placeholder="Selecteer renner..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                      <img src={greenIcon} alt="Green" className="w-5 h-5" />
                      Groene Trui *
                    </label>
                    <Autocomplete
                      options={riders}
                      value={formData.jerseys.green}
                      onChange={(value: string) => setFormData({ 
                        ...formData, 
                        jerseys: { ...formData.jerseys, green: value }
                      })}
                      placeholder="Selecteer renner..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                      <img src={polkaDotIcon} alt="Polka" className="w-5 h-5" />
                      Bolletjestrui *
                    </label>
                    <Autocomplete
                      options={riders}
                      value={formData.jerseys.polka_dot}
                      onChange={(value: string) => setFormData({ 
                        ...formData, 
                        jerseys: { ...formData.jerseys, polka_dot: value }
                      })}
                      placeholder="Selecteer renner..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                      <img src={whiteIcon} alt="White" className="w-5 h-5" />
                      Witte Trui *
                    </label>
                    <Autocomplete
                      options={riders}
                      value={formData.jerseys.white}
                      onChange={(value: string) => setFormData({ 
                        ...formData, 
                        jerseys: { ...formData.jerseys, white: value }
                      })}
                      placeholder="Selecteer renner..."
                    />
                  </div>
                </div>
              </div>

              {/* Combativity */}
              <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
                <h3 className="font-semibold text-lg">Strijdlust</h3>
                <div>
                  <label className="block text-sm font-medium mb-1">Strijdlustigste Renner</label>
                  <Autocomplete
                    options={riders}
                    value={formData.combativity}
                    onChange={(value: string) => setFormData({ ...formData, combativity: value })}
                    placeholder="Selecteer renner..."
                  />
                </div>
              </div>

              {/* DNF/DNS */}
              <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
                <h3 className="font-semibold text-lg">Uitvallers</h3>
                
                <div>
                  <label className="block text-sm font-medium mb-1">DNF (Did Not Finish)</label>
                  <MultiAutocomplete
                    options={riders}
                    selectedValues={formData.dnf_riders}
                    onChange={(values: string[]) => setFormData({ ...formData, dnf_riders: values })}
                    placeholder="Selecteer renners..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">DNS (Did Not Start)</label>
                  <MultiAutocomplete
                    options={riders}
                    selectedValues={formData.dns_riders}
                    onChange={(values: string[]) => setFormData({ ...formData, dns_riders: values })}
                    placeholder="Selecteer renners..."
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
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
        )}
      </main>
    </Layout>
  );
}

export default StageManagementPage;