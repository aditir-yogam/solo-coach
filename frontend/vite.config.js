import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development (npm run dev on port 5173) API and auth calls are proxied to
// the backend so everything stays same-origin, exactly like production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/auth': 'http://localhost:4000',
    },
  },
});
