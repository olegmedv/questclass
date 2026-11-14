// Bundles the API into dist/. Workspace packages (shared) are inlined;
// native modules stay external and are resolved from node_modules at runtime.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

const external = ['better-sqlite3'];

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: { index: 'src/index.ts', cli: 'src/cli/index.ts' },
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

// Versioned SQL migrations are read at startup from dist/migrations.
if (existsSync('src/db/migrations')) {
  cpSync('src/db/migrations', 'dist/migrations', { recursive: true });
}
