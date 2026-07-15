/**
 * Stage entry form model: the form's shape, defaults, and the helpers that
 * build form state from the route facts and existing stages.
 */

import route from '../../../data/2026/route.json';
import type { StageData, SubstitutionMade } from '../../../lib/types';

export interface StageFormData {
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
  dagploeg: string;
  dnf_riders: string[];
  dns_riders: string[];
}

/** Uitkomst van een verwerkte etappe — waarschuwingen blijven zichtbaar. */
export interface SubmitResult {
  winning_team: string;
  warnings: string[];
  dns_riders: string[];
  substitutions: SubstitutionMade[];
}

export const STAGE_TYPES = [
  'Flat',
  'Hills, flat finish',
  'Hills, uphill finish',
  'Mountains, flat finish',
  'Mountains, uphill finish',
] as const;

export const EMPTY_FORM_DATA: StageFormData = {
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
    position: i + 1,
  })),
  jerseys: { yellow: '', green: '', polka_dot: '', white: '' },
  combativity: '',
  dagploeg: '',
  dnf_riders: [],
  dns_riders: [],
};

export function getNextStageNumber(stages: StageData[]): number {
  if (stages.length === 0) return 1;
  const maxStage = Math.max(...stages.map(s => s.stage_number));
  return Math.min(maxStage + 1, 21);
}

/** Route facts known before the Tour (data/2026/route.json) — prefill. */
export function routePrefill(stageNumber: number): Partial<StageFormData> {
  const stage = route.stages.find(s => s.stage_number === stageNumber);
  if (!stage) return {};
  return {
    date: stage.date,
    distance: stage.distance,
    departure_city: stage.departure_city,
    arrival_city: stage.arrival_city,
    stage_type: stage.stage_type || '',
  };
}

function padFinishersTo20(finishers: Array<{ rider_name: string; position: number }>): Array<{ rider_name: string; position: number }> {
  const padded = [...finishers];
  while (padded.length < 20) {
    padded.push({ rider_name: '', position: padded.length + 1 });
  }
  return padded;
}

export function createFormDataFromStage(stage: StageData): StageFormData {
  const prefill = routePrefill(stage.stage_number);
  return {
    stage_number: stage.stage_number,
    date: stage.date || prefill.date || '',
    distance: stage.distance || prefill.distance || '',
    departure_city: stage.departure_city || prefill.departure_city || '',
    arrival_city: stage.arrival_city || prefill.arrival_city || '',
    stage_type: stage.stage_type || prefill.stage_type || '',
    difficulty: stage.difficulty || 'Flat',
    won_how: stage.won_how || '',
    top_20_finishers: padFinishersTo20(stage.top_20_finishers || []),
    jerseys: stage.jerseys || { yellow: '', green: '', polka_dot: '', white: '' },
    combativity: stage.combativity || '',
    dagploeg: stage.dagploeg || '',
    dnf_riders: stage.dnf_riders || [],
    dns_riders: stage.dns_riders || [],
  };
}
