import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // TdF Yellow theme
        'tdf-primary': '#ca8a04',
        'tdf-accent': '#eab308',
        'tdf-score': '#ca8a04',
        
        // Backgrounds
        'tdf-bg': '#f9fafb',
        'tdf-card': '#ffffff',
        'tdf-card-hover': '#f3f4f6',
        'tdf-expanded': '#f9fafb',
        
        // Table
        'table-header': '#e5e7eb',
        'table-row-even': '#ffffff',
        'table-row-odd': '#f9fafb',
        
        // Text colors
        'tdf-text-primary': '#111827',
        'tdf-text-highlight': '#4b5563',
        'tdf-text-secondary': '#6b7280',
        'tdf-text-muted': '#9ca3af',
        
        // Button states
        'tdf-button-inactive': '#e5e7eb',
        'tdf-button-text': '#374151',
        
        // Status colors
        'tdf-green': '#16a34a',
        'tdf-red': '#dc2626',
      },
    },
  },
  plugins: [],
} satisfies Config
