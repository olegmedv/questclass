import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, parseConfig, resolveToken, type TokenInput } from '../src/config';

const dir = mkdtempSync(path.join(os.tmpdir(), 'qc-lesson-prep-config-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const piped = (text: string): TokenInput => ({
  isTTY: false,
  readAll: () => Promise.resolve(text),
  prompt: () => Promise.reject(new Error('no terminal')),
});

describe('settings file', () => {
  it('reads server and token, with defaults for the rest', () => {
    const file = path.join(dir, 'ok.json');
    writeFileSync(
      file,
      '\uFEFF' + JSON.stringify({ server: 'https://questclass.duckdns.org/', token: 'qci_x' }),
    );
    expect(loadConfig(file)).toEqual({
      server: 'https://questclass.duckdns.org',
      token: 'qci_x',
      ffmpeg: 'ffmpeg',
      ffprobe: 'ffprobe',
      encoder: 'auto',
    });
  });

  it('explains how to create a missing file', () => {
    const file = path.join(dir, 'missing.json');
    expect(() => loadConfig(file)).toThrow(ConfigError);
    expect(() => loadConfig(file)).toThrow(file);
  });

  it.each([
    [{}, 'server'],
    [{ server: 'ftp://x' }, 'https://'],
    [{ server: 'not a url' }, 'не URL'],
    [{ server: 'http://localhost:8090', encoder: 'gpu' }, 'encoder'],
    [{ server: 'http://localhost:8090', tokn: 'typo' }, 'tokn'],
    [{ server: 'http://localhost:8090', token: '' }, 'token'],
    [[], 'объект'],
  ])('refuses %j', (raw, message) => {
    expect(() => parseConfig(raw)).toThrow(message);
  });
});

describe('import token', () => {
  const base = parseConfig({ server: 'http://localhost:8090' });

  it('comes from the settings when present', async () => {
    expect(await resolveToken({ ...base, token: 'qci_from_file' }, piped('ignored'))).toBe(
      'qci_from_file',
    );
  });

  it('is read from piped stdin otherwise (first line, trimmed)', async () => {
    expect(await resolveToken(base, piped('  qci_piped \r\nrest'))).toBe('qci_piped');
  });

  it('is asked for in a terminal', async () => {
    const terminal: TokenInput = {
      isTTY: true,
      readAll: () => Promise.reject(new Error('not piped')),
      prompt: (question) => Promise.resolve(question.includes('Токен') ? 'qci_typed' : ''),
    };
    expect(await resolveToken(base, terminal)).toBe('qci_typed');
  });

  it('missing everywhere is an error', async () => {
    await expect(resolveToken(base, piped('\n'))).rejects.toThrow(ConfigError);
  });
});
