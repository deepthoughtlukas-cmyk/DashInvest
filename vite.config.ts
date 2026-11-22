import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    watch: {
      ignored: [
        '**/data/**',
        '**/server/**',
        '**/worker/**',
        '**/.wrangler/**',
        '**/public/static-api/**',
        '**/tests/**',
        '**/e2e/**',
        '**/test-results/**',
        '**/playwright-report/**',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
