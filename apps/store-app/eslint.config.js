import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // sync modules: dynamic Supabase/Dexie shapes; explicit-any kept local to these files (no file-level directive)
  {
    files: [
      'src/services/syncService.ts',
      'src/services/syncConfig.ts',
      'src/services/syncUpload.ts',
      'src/services/syncDownload.ts',
      'src/services/syncDeletionDetection.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // UI layer: pages, components, layouts must not import supabase, db, or repositories
  {
    files: [
      'src/pages/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      'src/layouts/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*lib/supabase*', '*lib/supabase'],
              message:
                'UI must not import supabase. Use hooks, services, or contexts (e.g. useOfflineData, publicStatementService).',
            },
            {
              group: ['*lib/db*', '*lib/db'],
              message:
                'UI must not import db or getDB. Use hooks, services, or contexts (e.g. useOfflineData).',
            },
            {
              group: ['*repositories*'],
              message:
                'UI must not import repositories. Use hooks, services, or contexts.',
            },
          ],
        },
      ],
    },
  }
);
