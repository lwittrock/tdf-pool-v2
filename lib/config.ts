/**
 * Application Configuration
 * Single source of truth for all app configuration
 */

/**
 * Environment flags
 */
export const config = {
  isProd: import.meta.env.PROD,
  isDev: import.meta.env.DEV,
  
  /**
   * API configuration
   */
  api: {
    getUrl: (path: string): string => {
      if (import.meta.env.PROD) {
        return path;
      }
      return `http://localhost:3000${path}`;
    },
  },
  
  /**
   * Data paths - points to static JSON files from Vercel Blob
   */
  data: {
    metadata: () => '/data/metadata.json',
    leaderboards: () => '/data/leaderboards.json',
    riders: () => '/data/riders.json',
    stages: () => '/data/stages_data.json',
    teamSelections: () => '/data/team_selections.json',
    riderRankings: () => '/data/rider_rankings.json',
  },
  
  /**
   * Asset paths
   */
  assets: {
    jersey: (type: 'yellow' | 'green' | 'polka_dot' | 'white') => 
      `/assets/jersey_${type}.svg`,
  },
} as const;

export default config;
