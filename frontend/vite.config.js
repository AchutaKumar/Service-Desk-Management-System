import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev server proxies /api and /media to the Django backend so the frontend
// runs same-origin in development (no CORS setup needed, no hardcoded URLs).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Bind to 0.0.0.0 so devices on local Wi-Fi / LAN (like mobile phones) can connect
    host: '0.0.0.0',
    port: 5173,
    // Fail loudly if the port is taken instead of silently moving to 5174
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/media': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/ws': {
        target: 'http://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    // Split heavy vendor code so app updates don't re-download everything
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'axios', 'lucide-react'],
        },
      },
    },
  },
});
