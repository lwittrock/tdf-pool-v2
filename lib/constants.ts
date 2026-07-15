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
  POULE: 'Poule',
  ETAPPES: 'Etappes',
  RENNERPUNTEN: 'Rennerpunten',
  PLOEGEN: 'Ploegen',
  SPELREGELS: 'Spelregels',
  ETAPPE_BEHEER: 'Etappe Beheer',

  // Leaderboard
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
  POINTS_PER_STAGE: 'Punten per Etappe',
  SELECTED: 'Geselecteerd',
  
  // Messages
  LOADING: 'Laden...',
  ERROR: 'Fout',
  RETRY: 'Opnieuw proberen',
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
// Data Fetch Configuration (WP-A1)
// ============================================================================

/** How often the public site polls the snapshot pointer (only while visible). */
export const POINTER_POLL_INTERVAL_MS = 60_000;