import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  server: {
    host: true,
    port: 5175,
    hmr: {
      port: 5175,
    },
  },
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  define: {
    // Set the public URL for QR code generation - always use production URL for QR codes
    'import.meta.env.VITE_PUBLIC_URL': JSON.stringify(process.env.VITE_PUBLIC_URL || 'https://souq-trablous.com'),
  },
});
