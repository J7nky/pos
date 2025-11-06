import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5175,
    hmr: {
      port: 5175,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@pos-platform/shared': path.resolve(__dirname, '../../packages/shared/dist'),
    },
  },
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
    'import.meta.env.VITE_PUBLIC_URL': JSON.stringify(process.env.VITE_PUBLIC_URL || (process.env.NODE_ENV === 'production' ? 'https://souq-trablous.netlify.app' : 'http://localhost:5175')),
    // Define production mode flag
    'import.meta.env.PROD': JSON.stringify(process.env.NODE_ENV === 'production'),
  },
});
