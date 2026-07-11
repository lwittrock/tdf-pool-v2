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
   * Data source (WP-A1: versioned snapshots + pointer).
   * The pointer lives on the public Blob store; its base URL comes from the
   * build-time env VITE_DATA_BASE_URL. When unset (local dev) the pointer is
   * fetched from the dev origin at /data/current.json.
   * Snapshot file URLs come out of the pointer itself, never from config.
   */
  data: {
    pointer: () =>
      `${(import.meta.env.VITE_DATA_BASE_URL ?? '').replace(/\/+$/, '')}/data/current.json`,
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
