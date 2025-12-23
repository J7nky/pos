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
    exclude: ['lucide-react'],
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
