/// <reference types="vite/client" />

/**
 * Vite Environment Variables Type Definitions
 * 
 * This tells TypeScript about Vite's import.meta.env properties
 */

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
  // Add custom env variables here if needed
  // readonly VITE_CUSTOM_VAR: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}