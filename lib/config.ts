/**
 * Centralized Application Configuration
 * 
 * Single source of truth for all app configuration.
 * Handles both development and production environments.
 */

// Base path for GitHub Pages deployment
// This MUST match vite.config.ts base setting
const BASE_PATH = '/tdf-pool-v2';

/**
 * Get base URL
 * 
 * Uses Vite's BASE_URL which automatically handles dev vs prod:
 * - Development: Vite sets this based on vite.config.ts
 * - Production: Same value from vite.config.ts
 */
export const getBaseUrl = () => {
  // Use Vite's built-in BASE_URL - it handles everything!
  return import.meta.env.BASE_URL || BASE_PATH;
};

/**
 * Main configuration object
 */
export const config = {
  /**
   * Base path for the application
   */
  basePath: getBaseUrl(),
  
  /**
   * Environment flags
   */
  isProd: import.meta.env.PROD,
  isDev: import.meta.env.DEV,
  
  /**
   * API configuration
   */
  api: {
    /**
     * Get full API URL for a given path
     */
    getUrl: (path: string): string => {
      // In production, use relative URLs (same domain)
      if (import.meta.env.PROD) {
        return path;
      }
      
      // In development, use localhost
      return `http://localhost:3000${path}`;
    },
  },
  
  /**
   * Data paths - points to static JSON files
   */
  data: {
    metadata: () => `${getBaseUrl()}/data/metadata.json`,
    leaderboards: () => `${getBaseUrl()}/data/leaderboards.json`,
    riders: () => `${getBaseUrl()}/data/riders.json`,
    stages: () => `${getBaseUrl()}/data/stages_data.json`,
    teamSelections: () => `${getBaseUrl()}/data/team_selections.json`,
    riderRankings: () => `${getBaseUrl()}/data/rider_rankings.json`,
  },
  
  /**
   * Asset paths
   */
  assets: {
    jersey: (type: 'yellow' | 'green' | 'polka_dot' | 'white') => 
      `${getBaseUrl()}/assets/jersey_${type}.svg`,
  },
} as const;

/**
 * Helper for API routes (server-side)
 */
export const getServerApiUrl = (path: string): string => {
  // Check if we're in Vercel
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}${path}`;
  }
  
  // Development
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:3000${path}`;
  }
  
  // Fallback to relative URL
  return path;
};

export default config;