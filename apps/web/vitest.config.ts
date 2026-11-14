import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Node is the default environment (asset and script tests need real file URLs); component
// tests opt into the DOM with a `// @vitest-environment jsdom` docblock.
export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ['./test/setup.ts'],
    unstubGlobals: true,
    unstubEnvs: true,
  },
});
