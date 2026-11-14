#!/usr/bin/env node
// Starts the built API (apps/api/dist/index.js) on a temporary DATA_DIR, waits until it is
// healthy and idle, then reports the resident set size of the server process.
//
//   node scripts/measure-rss.mjs [--max-mb 80] [--idle-ms 3000]
//
// Exits 1 if RSS exceeds --max-mb. Requires `pnpm build` first.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    'max-mb': { type: 'string', default: '80' },
    'idle-ms': { type: 'string', default: '3000' },
  },
});
const maxMb = Number(values['max-mb']);
const idleMs = Number(values['idle-ms']);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'apps', 'api', 'dist', 'index.js');
if (!existsSync(entry)) {
  console.error(`Not built: ${entry}. Run "pnpm build" first.`);
  process.exit(2);
}

/** RSS of a process in MiB (Linux: /proc, macOS: ps, Windows: working set via tasklist). */
function rssMb(pid) {
  if (process.platform === 'linux') {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const kb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1]);
    return kb / 1024;
  }
  if (process.platform === 'win32') {
    const csv = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
    });
    const memField = csv.trim().split('","').at(-1) ?? '';
    const kb = Number(memField.replace(/[^\d]/g, ''));
    return kb / 1024;
  }
  const kb = Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }));
  return kb / 1024;
}

async function waitForPort(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Server did not start:\n${output}`)), 15_000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with code ${code}:\n${output}`));
    });
  });
}

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'qc-rss-'));
const child = spawn(process.execPath, [entry], {
  cwd: path.dirname(entry),
  env: { PORT: '0', DATA_DIR: dataDir, NODE_ENV: 'production', PATH: process.env.PATH },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let exitCode;
try {
  const port = await waitForPort(child);
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  if (health.status !== 200) {
    throw new Error(`Health check failed: ${health.status}`);
  }
  await new Promise((resolve) => setTimeout(resolve, idleMs));
  const rss = rssMb(child.pid);
  const verdict = rss < maxMb ? 'OK' : 'TOO HIGH';
  console.info(`Idle RSS: ${rss.toFixed(1)} MiB (limit ${maxMb} MiB) — ${verdict}`);
  exitCode = rss < maxMb ? 0 : 1;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  exitCode = 1;
} finally {
  if (child.exitCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  rmSync(dataDir, { recursive: true, force: true });
}
process.exit(exitCode);
