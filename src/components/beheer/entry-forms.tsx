/**
 * The six sections of the stage entry form. Purely controlled: each renders
 * from StageFormData and reports changes up via onUpdate.
 */

import { useState } from 'react';
import { Autocomplete, MultiAutocomplete } from '../Autocomplete';
import { JERSEY_ICONS } from '../../../lib/constants';
import { parseResultsPaste } from '../../../lib/parse-results';
import { STAGE_TYPES, type StageFormData } from './stage-form';

interface FormSectionProps {
  formData: StageFormData;
  onUpdate: (data: StageFormData) => void;
}

interface RiderOption {
  id: string;
  name: string;
  team?: string;
}

export function StageMetadataForm({ formData, onUpdate }: FormSectionProps) {
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

export function StageFinishersForm({
  formData,
  riders,
  onUpdateFinisher,
  onUpdate,
}: FormSectionProps & {
  riders: RiderOption[];
  onUpdateFinisher: (index: number, riderName: string) => void;
}) {
  const [pasteText, setPasteText] = useState('');
  const [pasteFeedback, setPasteFeedback] = useState('');

  const handlePaste = () => {
    const { entries, unmatched, ignored } = parseResultsPaste(
      pasteText,
      riders.map((r) => r.name)
    );
    if (entries.length === 0) {
      setPasteFeedback('Geen renners gevonden in de geplakte tekst.');
      return;
    }
    const finishers = Array.from({ length: 20 }, (_, i) => ({
      rider_name: entries[i]?.rider_name ?? '',
      position: i + 1,
    }));
    onUpdate({ ...formData, top_20_finishers: finishers });
    setPasteFeedback(
      `${entries.filter((e) => e.matched).length} van 20 posities gevuld` +
        (ignored.length > 0 ? ` (${ignored.length} regels genegeerd: koppen/ploegen/tijden)` : '') +
        '.' +
        (unmatched.length > 0
          ? ` Niet herkend — controleer hieronder: ${unmatched.map((u) => `"${u}"`).join(', ')}`
          : '')
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
      <h3 className="font-semibold text-lg">Top 20 Uitslag</h3>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
        <label className="block text-sm font-medium">
          Plak de uitslag (één renner per regel — kale namen, genummerde regels of
          een gekopieerde ProCyclingStats-tabel werken allemaal)
        </label>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={4}
          placeholder={'1  POGAČAR Tadej  UAE Team Emirates - XRG\n2  VINGEGAARD Jonas  Team Visma | Lease a Bike\n…'}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs"
        />
        <button
          type="button"
          onClick={handlePaste}
          className="px-4 py-2 bg-tdf-primary text-white rounded-lg hover:opacity-90 text-sm font-medium"
        >
          Vul de 20 posities in
        </button>
        {pasteFeedback && <p className="text-sm text-gray-700">{pasteFeedback}</p>}
      </div>

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

export function StageJerseysForm({
  formData,
  riders,
  onUpdate,
}: FormSectionProps & { riders: RiderOption[] }) {
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

export function StageCombativityForm({
  formData,
  riders,
  onUpdate,
}: FormSectionProps & { riders: RiderOption[] }) {
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

export function StageDagploegForm({
  formData,
  riders,
  onUpdate,
}: FormSectionProps & { riders: RiderOption[] }) {
  const teams = [...new Set(riders.map((r) => r.team).filter((t): t is string => Boolean(t) && t !== 'ONBEKEND'))].sort();
  return (
    <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
      <h3 className="font-semibold text-lg">Dagploeg</h3>
      <div>
        <label className="block text-sm font-medium mb-1">
          Winnaar ploegen-dagklassement (+6 voor wie deze ploeg koos; leeg laten als er geen is)
        </label>
        <input
          type="text"
          list="dagploeg-teams"
          value={formData.dagploeg}
          onChange={(e) => onUpdate({ ...formData, dagploeg: e.target.value })}
          placeholder="Selecteer ploeg..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
        <datalist id="dagploeg-teams">
          {teams.map((team) => (
            <option key={team} value={team} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

export function StageDNFForm({
  formData,
  riders,
  onUpdate,
}: FormSectionProps & { riders: RiderOption[] }) {
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
