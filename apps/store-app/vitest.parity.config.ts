import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Sync parity baseline gate — isolated from legacy tests and from src/test/setup IndexedDB stub */
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_PUBLIC_URL': JSON.stringify('http://localhost:5178'),
    'import.meta.env.PROD': JSON.stringify(false),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/sync-parity/setup.ts'],
    include: ['tests/sync-parity/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/legacy/**'],
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
