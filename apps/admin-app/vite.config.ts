import { defineConfig } from 'vite';
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
    exclude: ['lucide-react'],
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
});

