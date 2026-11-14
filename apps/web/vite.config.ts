import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { replacedAssets } from './vite-replaced-assets';

/** The API during development (`pnpm dev`). */
const API = 'http://localhost:8080';

export default defineConfig({
  // Files the admin replaced in «Оформление» come from the API, as in production.
  plugins: [react(), replacedAssets()],
  build: {
    // Hashed bundles go to /_app/*, so the unhashed game assets keep the /assets/* namespace
    // (public/assets, see FEAT-026) and only /_app/* may be served as immutable.
    assetsDir: '_app',
  },
  server: {
    // During development the SPA talks to the API through the Vite proxy. The Host header is
    // kept (the string shorthand would rewrite it), otherwise the API's same-origin check
    // rejects every POST from the browser.
    proxy: { '/api': { target: API, changeOrigin: false } },
  },
});
