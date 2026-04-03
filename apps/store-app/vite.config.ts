import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5178,
    hmr: {
      port: 5178,
    },
  },
  plugins: [react()],
  optimizeDeps: {
    // Pre-bundle lucide-react so Vite serves it as a single chunk instead of
    // issuing one HTTP request per icon file (~1 500+ files in v0.540).
    // Excluding it was causing ~2 000 individual icon requests in dev mode.
    include: ['lucide-react'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove all console statements in production
        drop_debugger: true, // Remove debugger statements
      },
    },
  },
  define: {
    // Set the public URL for QR code generation
    'import.meta.env.VITE_PUBLIC_URL': JSON.stringify(process.env.VITE_PUBLIC_URL || (process.env.NODE_ENV === 'production' ? 'https://souq-trablous.netlify.app' : 'http://localhost:5178')),
    // Define production mode flag
    'import.meta.env.PROD': JSON.stringify(process.env.NODE_ENV === 'production'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/legacy/**',
      '**/integration/**',
      /** Parity gate only — uses vitest.parity.config.ts + fake-indexeddb */
      'tests/sync-parity/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
      ],
    },
  },
});
