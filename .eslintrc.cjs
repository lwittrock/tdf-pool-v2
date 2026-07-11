/**
 * ESLint configuration (WP-A0 tooling baseline).
 *
 * Non-type-aware on purpose: fast, and it runs over api/ + lib/ + src/ alike.
 * Rules the current codebase violates wholesale (no-explicit-any) are relaxed
 * rather than suppressed inline everywhere; tighten during WP-B8.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '*.cjs', 'coverage'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      files: ['api/**/*.ts', 'lib/**/*.ts', 'scripts/**/*.ts'],
      env: { node: true, browser: false },
    },
  ],
};
