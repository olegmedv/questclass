import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../src/cli/index';
import { DB_FILENAME } from '../src/db/client';
import { ADMIN, seedAdmin } from './helpers/client';
import { createTempDir, createTestRuntime, removeDir, type TestRuntime } from './helpers/db';

let runtime: TestRuntime;
let out: string;

beforeEach(async () => {
  runtime = await createTestRuntime();
  await seedAdmin(runtime.ctx);
  out = createTempDir('qc-backup-');
});

afterEach(async () => {
  await runtime.close();
  removeDir(out);
});

function io(dataDir = runtime.dataDir) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const cli: CliIo = {
    env: { NODE_ENV: 'test', DATA_DIR: dataDir },
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    readStdin: () => Promise.resolve(null),
  };
  return { cli, stdout, stderr };
}

function loginsIn(file: string): string[] {
  const copy = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const rows = copy.prepare('SELECT login FROM users WHERE login IS NOT NULL').all();
    return (rows as { login: string }[]).map((r) => r.login);
  } finally {
    copy.close();
  }
}

describe('CLI backup', () => {
  it('copies the live database, including writes still in the WAL', async () => {
    const target = path.join(out, 'nightly.db');
    const { cli, stdout } = io();
    expect(await runCli(['backup', target], cli)).toBe(0);
    expect(stdout.join('\n')).toContain(target);
    expect(loginsIn(target)).toEqual([ADMIN.login]);
    expect(readdirSync(out)).toEqual(['nightly.db']);
    if (process.platform !== 'win32') {
      expect(statSync(target).mode & 0o777).toBe(0o600);
    }
    // The server keeps working on the original after the copy.
    await runtime.ctx.users.create({ role: 'learner', name: 'Саша', pin: '2468' }, null);
    expect(loginsIn(target)).toEqual([ADMIN.login]);
  });

  it('names the copy by time when given a directory', async () => {
    const { cli } = io();
    expect(await runCli(['backup', out], cli)).toBe(0);
    const files = readdirSync(out);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^questclass-\d{4}-\d{2}-\d{2}T[\d-]+Z\.db$/);
    expect(loginsIn(path.join(out, files[0] ?? ''))).toEqual([ADMIN.login]);
  });

  it('creates a directory given with a trailing slash', async () => {
    const { cli } = io();
    expect(await runCli(['backup', `${path.join(out, 'nightly')}/`], cli)).toBe(0);
    const files = readdirSync(path.join(out, 'nightly'));
    expect(files).toHaveLength(1);
    expect(loginsIn(path.join(out, 'nightly', files[0] ?? ''))).toEqual([ADMIN.login]);
  });

  it('never overwrites an existing file', async () => {
    const target = path.join(out, 'taken.db');
    writeFileSync(target, 'keep me');
    const { cli, stderr } = io();
    expect(await runCli(['backup', target], cli)).toBe(1);
    expect(stderr.join('\n')).toContain('already exists');
    expect(statSync(target).size).toBe('keep me'.length);
  });

  it('fails without a database instead of creating an empty one', async () => {
    const empty = createTempDir('qc-backup-empty-');
    try {
      const { cli, stderr } = io(empty);
      expect(await runCli(['backup', path.join(out, 'x.db')], cli)).toBe(1);
      expect(stderr.join('\n')).toContain('No database');
      expect(existsSync(path.join(empty, DB_FILENAME))).toBe(false);
      expect(existsSync(path.join(out, 'x.db'))).toBe(false);
    } finally {
      removeDir(empty);
    }
  });

  it('requires exactly one path', async () => {
    expect(await runCli(['backup'], io().cli)).toBe(2);
    expect(await runCli(['backup', 'a.db', 'b.db'], io().cli)).toBe(2);
  });
});
