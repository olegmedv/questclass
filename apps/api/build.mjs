// Bundles the API into dist/. Workspace packages (shared) are inlined;
// native modules stay external and are resolved from node_modules at runtime.
import { build } from 'esbuild';

const external = ['better-sqlite3'];

await build({
  entryPoints: { index: 'src/index.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external,
  banner: {
    // Bundled CommonJS dependencies may call require(); give them a real one.
    js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
