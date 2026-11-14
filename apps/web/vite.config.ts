import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // During development the SPA talks to the API through the Vite proxy.
    proxy: { '/api': 'http://localhost:8080' },
  },
});
