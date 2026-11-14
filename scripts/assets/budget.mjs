#!/usr/bin/env node
// Size budget of the committed MVP assets (FEAT-026): fails when apps/web/public/assets exceeds 90 MB.
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_ASSETS_DIR, isMainModule, listFiles } from './manifest.mjs';

export const BUDGET_BYTES = 90 * 1000 * 1000;

/** Group key for the report: `game/<folder>` or the top-level folder. */
const groupOf = (rel) => {
  const parts = rel.split('/');
  if (parts.length === 1) return '.';
  if (parts[0] === 'game' && parts.length > 2) return `game/${parts[1]}`;
  return parts[0];
};

/** Total size and per-folder breakdown of `dir`. */
export function measure(dir = DEFAULT_ASSETS_DIR) {
  const groups = {};
  let total = 0;
  let files = 0;
  for (const rel of listFiles(dir)) {
    const bytes = statSync(join(dir, rel)).size;
    const group = (groups[groupOf(rel)] ??= { files: 0, bytes: 0 });
    group.files += 1;
    group.bytes += bytes;
    total += bytes;
    files += 1;
  }
  return { total, files, groups, limit: BUDGET_BYTES, ok: total <= BUDGET_BYTES };
}

const mb = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;

export function formatReport(report) {
  const lines = Object.entries(report.groups)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(
      ([group, g]) =>
        `  ${group.padEnd(24)} ${String(g.files).padStart(4)} files ${mb(g.bytes).padStart(12)}`,
    );
  lines.push(
    `  ${'total'.padEnd(24)} ${String(report.files).padStart(4)} files ${mb(report.total).padStart(12)}` +
      ` (budget ${mb(report.limit)})`,
  );
  return lines.join('\n');
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { dir: { type: 'string', default: DEFAULT_ASSETS_DIR } },
  });
  const report = measure(resolve(values.dir));
  console.log(formatReport(report));
  if (!report.ok) {
    console.error(`asset budget exceeded: ${mb(report.total)} > ${mb(report.limit)}`);
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) main();
