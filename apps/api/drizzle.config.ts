import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` writes a new versioned migration from the schema diff.
// Migrations must be expand-only (new tables, nullable/default columns), see CLAUDE.md rule 2.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
