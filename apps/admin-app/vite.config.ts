import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5176, // Different port from store app
    hmr: {
      port: 5176,
    },
  },
  plugins: [react()],
  optimizeDeps: {
    // Pre-bundle lucide-react so Vite serves it as a single chunk instead of
    // issuing one HTTP request per icon file (~1 500+ files in v0.540).
    include: ['lucide-react'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  define: {
    'import.meta.env.VITE_PUBLIC_URL': JSON.stringify(
      process.env.VITE_PUBLIC_URL || 
      (process.env.NODE_ENV === 'production' ? 'https://super.souq-trablous.com' : 'http://localhost:5176')
    ),
    'import.meta.env.PROD': JSON.stringify(process.env.NODE_ENV === 'production'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});

