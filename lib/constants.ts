/**
 * Application Constants
 * 
 * All magic strings, numbers, and configuration in one place.
 * Note: Scoring-related constants (points, medals) are in scoring-constants.ts
 */

import { config } from './config';

// ============================================================================
// Jersey Configuration
// ============================================================================

export const JERSEY_ICONS = {
  yellow: config.assets.jersey('yellow'),
  green: config.assets.jersey('green'),
  polka_dot: config.assets.jersey('polka_dot'),
  white: config.assets.jersey('white'),
} as const;

export const JERSEY_LABELS = {
  yellow: 'Gele Trui',
  green: 'Groene Trui',
  polka_dot: 'Bolletjestrui',
  white: 'Witte Trui',
} as const;

// ============================================================================
// UI Labels (Dutch)
// ============================================================================

export const LABELS = {
  // Pages
  KLASSEMENT: 'Klassement',
  RENNER_PUNTEN: 'Renner Punten',
  TEAM_SELECTIE: 'Team Selecties',
  ETAPPE_BEHEER: 'Etappe Beheer',
  OVER_DEZE_POULE: 'Over deze Poule',

  // Leaderboard
  STAGE_INDIVIDUAL: 'Etappe',
  STANDINGS_INDIVIDUAL: 'Algemeen',
  STANDINGS_DIRECTIE: 'Directie',
  
  // Common
  POSITION: 'Positie',
  PARTICIPANT: 'Deelnemer',
  DIRECTIE: 'Directie',
  TOTAL_POINTS: 'Totaal Punten',
  STAGE_MEDALS: 'Etappe Medailles',
  RANK_CHANGE: '+/-',
  SEARCH_PLACEHOLDER: 'Zoek deelnemer of directie...',
  SEARCH_TEAM_PLACEHOLDER: 'Toon team van deelnemer...',
  
  // Riders
  RIDER: 'Renner',
  TEAM: 'Team',
  POINTS_PER_STAGE: 'Punten per Etappe',
  SELECTED: 'Geselecteerd',
  
  // Messages
  LOADING: 'Laden...',
  ERROR: 'Fout',
  NO_DATA: 'Geen gegevens beschikbaar',
  NO_RESULTS: 'Geen resultaten gevonden',
} as const;

// ============================================================================
// Rank Display Configuration
// ============================================================================

export const RANK_COLORS = {
  UP: 'text-green-600',
  DOWN: 'text-red-600',
  SAME: 'text-gray-400',
} as const;

export const RANK_ARROWS = {
  UP: '↑',
  DOWN: '↓',
  SAME: '—',
} as const;

// ============================================================================
// Selection Stats Configuration
// ============================================================================

export const SELECTION_ICONS = {
  POPULAR_TOP_10: '⭐', // Top 10 rider selected by 50%+
  RARE_TOP_10: '💎',   // Top 10 rider selected by <50%
} as const;

export const SELECTION_THRESHOLDS = {
  POPULAR: 50, // percentage
  TOP_RIDER_RANK: 10,
} as const;

// ============================================================================
// Table Configuration
// ============================================================================

export const TABLE_CLASSES = {
  HEADER: 'bg-table-header',
  ROW_EVEN: 'bg-white',
  ROW_ODD: 'bg-tdf-bg',
  ROW_HOVER: 'hover:bg-gray-100',
  EXPANDED: 'bg-gray-100',
} as const;

// ============================================================================
// Breakpoints (matching Tailwind)
// ============================================================================

export const BREAKPOINTS = {
  SM: 640,
  MD: 768,
  LG: 1024,
  XL: 1280,
} as const;

// ============================================================================
// Data Fetch Configuration
// ============================================================================

export const DATA_PATHS = {
  METADATA: config.data.metadata(),
  LEADERBOARDS: config.data.leaderboards(),
  RIDERS: config.data.riders(),
  STAGES: config.data.stages(),
  TEAM_SELECTIONS: config.data.teamSelections(),
  RIDER_RANKINGS: config.data.riderRankings(),
} as const;

// ============================================================================
// Cache Configuration
// ============================================================================

export const CACHE_CONFIG = {
  STALE_TIME: Infinity,
  GC_TIME: Infinity,
  REFETCH_ON_WINDOW_FOCUS: false,
  REFETCH_ON_MOUNT: false,
  REFETCH_ON_RECONNECT: false,
  RETRY: 1,
} as const;