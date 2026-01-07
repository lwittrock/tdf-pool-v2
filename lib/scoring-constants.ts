/**
 * Shared scoring constants for TdF Pool
 * 
 * This file contains all point values and rules used throughout the application.
 * Any changes to scoring rules should be made here to keep everything in sync.
 */

/**
 * Points awarded for stage finishing positions
 * Position 1 (winner) gets 25 points, position 20 gets 1 point
 */
export const POINTS_FOR_RANK: Record<number, number> = {
  1: 25,
  2: 19,
  3: 18,
  4: 17,
  5: 16,
  6: 15,
  7: 14,
  8: 13,
  9: 12,
  10: 11,
  11: 10,
  12: 9,
  13: 8,
  14: 7,
  15: 6,
  16: 5,
  17: 4,
  18: 3,
  19: 2,
  20: 1,
} as const;

/**
 * Points awarded for holding a jersey after a stage
 */
export const JERSEY_POINTS = {
  yellow: 15,      // General Classification (GC) leader
  green: 10,       // Points Classification leader
  polka_dot: 10,   // King of the Mountains leader
  white: 10,       // Best Young Rider leader
} as const;

/**
 * Points awarded for being the most combative rider of a stage
 */
export const COMBATIVITY_POINTS = 5;

/**
 * Number of top participants per directie whose scores count toward directie total
 * IMPORTANT: This is per-stage, not cumulative
 * e.g., For Stage 5, we take the top 5 participants by Stage 5 points only
 */
export const TOP_N_FOR_DIRECTIE = 5;

/**
 * Number of riders each participant can select
 */
export const TEAM_SIZE = {
  main: 10,      // Active riders
  backup: 1,     // Reserve rider (activates if a main rider DNS)
  total: 11,     // Total selections per participant
} as const;

/**
 * Helper function to get points for a given position
 * Returns 0 if position is outside the top 20
 */
export function getPointsForPosition(position: number): number {
  return POINTS_FOR_RANK[position] || 0;
}

/**
 * Helper function to get points for a jersey
 * Returns 0 if jersey type is invalid
 */
export function getPointsForJersey(
  jerseyType: 'yellow' | 'green' | 'polka_dot' | 'white'
): number {
  return JERSEY_POINTS[jerseyType] || 0;
}

/**
 * Type definitions for jersey types
 */
export type JerseyType = keyof typeof JERSEY_POINTS;

/**
 * All available jersey types as an array
 */
export const ALL_JERSEY_TYPES: JerseyType[] = [
  'yellow',
  'green', 
  'polka_dot',
  'white',
] as const;