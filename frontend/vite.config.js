import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev server proxies /api and /media to the Django backend so the frontend
// runs same-origin in development (no CORS setup needed, no hardcoded URLs).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Bind IPv4 explicitly. Without this, Vite binds only the IPv6 loopback on
    // some Windows machines, so browsers that resolve `localhost` to 127.0.0.1
    // get a connection error even though the terminal shows a URL.
    host: '127.0.0.1',
    port: 5173,
    // Fail loudly if the port is taken instead of silently moving to 5174
    // (a moved port would leave the user staring at a stale tab).
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/media': { target: 'http://127.0.0.1:8000', changeOrigin: true },
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
