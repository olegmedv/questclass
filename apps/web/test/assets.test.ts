// FEAT-026: the committed MVP assets match their manifest, stay within budget and re-import identically.
import { execFile, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

interface ManifestEntry {
  kind: 'image' | 'audio' | 'font' | 'text';
  bytes: number;
  w?: number;
  h?: number;
  animated?: boolean;
  frames?: number;
  durationMs?: number;
}
type Manifest = Record<string, ManifestEntry>;
interface ManifestModule {
  DEFAULT_ASSETS_DIR: string;
  DEFAULT_MANIFEST: string;
  buildManifest(dir: string): Manifest;
  hashTree(dir: string): Record<string, string>;
}
interface BudgetModule {
  BUDGET_BYTES: number;
  measure(dir: string): { total: number; files: number; ok: boolean };
}

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const scripts = join(repo, 'scripts/assets');
const load = async <T>(file: string) =>
  (await import(pathToFileURL(join(scripts, file)).href)) as T;
const manifestModule = await load<ManifestModule>('manifest.mjs');
const budget = await load<BudgetModule>('budget.mjs');
const assetsDir = manifestModule.DEFAULT_ASSETS_DIR;
const manifestFile = manifestModule.DEFAULT_MANIFEST;
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as Manifest;
const paths = Object.keys(manifest);

describe('MVP assets', () => {
  it('manifest lists exactly the files in apps/web/public/assets with their sizes', () => {
    expect(paths.length).toBeGreaterThan(0);
    expect(manifestModule.buildManifest(assetsDir)).toEqual(manifest);
  });

  it('images keep their dimensions and animations keep their frames', () => {
    for (const [path, entry] of Object.entries(manifest)) {
      if (entry.kind !== 'image') continue;
      expect(entry.w, path).toBeGreaterThan(0);
      expect(entry.h, path).toBeGreaterThan(0);
      if (entry.animated) {
        expect(entry.frames, path).toBeGreaterThan(1);
        expect(entry.durationMs, path).toBeGreaterThan(0);
      }
    }
    expect(manifest['celebrations/streak-five-v1.webp']).toMatchObject({ animated: true });
  });

  it('ships every sound as OGG with an MP3 fallback', () => {
    const audio = paths.filter((p) => manifest[p]?.kind === 'audio');
    expect(audio.length).toBeGreaterThan(0);
    for (const path of audio) {
      const stem = path.slice(0, path.lastIndexOf('.'));
      expect(manifest[`${stem}.ogg`], `${stem}.ogg`).toBeDefined();
      expect(manifest[`${stem}.mp3`], `${stem}.mp3`).toBeDefined();
    }
  });

  it('converts images to WebP: PNG only for platform icons, no MP4 or JPEG', () => {
    expect(paths.filter((p) => /\.(mp4|jpe?g)$/i.test(p))).toEqual([]);
    expect(paths.filter((p) => p.endsWith('.png') && !p.startsWith('icons/'))).toEqual([]);
  });

  it('fits the 90 MB budget', () => {
    const report = budget.measure(assetsDir);
    const manifestBytes = Object.values(manifest).reduce((sum, entry) => sum + entry.bytes, 0);
    expect(report.total).toBe(manifestBytes);
    expect(report.total).toBeLessThanOrEqual(budget.BUDGET_BYTES);
    expect(report.ok).toBe(true);
  });
});

// Re-import needs the original (not in git) and ffmpeg, so CI skips it.
function findSource(): string | undefined {
  const candidates = [process.env.QUESTCLASS_SOURCE, join(repo, 'QuestClass-Source')];
  for (const dir of candidates) {
    if (!dir) continue;
    if (existsSync(join(dir, 'public', 'game'))) return join(dir, 'public');
    if (existsSync(join(dir, 'game'))) return dir;
  }
  return undefined;
}
const source = findSource();
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const skipReason = !source
  ? 'QuestClass-Source/ not found'
  : !hasFfmpeg
    ? 'ffmpeg not on PATH'
    : '';

describe('MVP asset import', () => {
  it.skipIf(skipReason !== '')(
    `re-import gives byte-identical files and manifest${skipReason ? ` (skipped: ${skipReason})` : ''}`,
    async () => {
      const tmp = mkdtempSync(join(tmpdir(), 'qc-assets-'));
      try {
        const out = join(tmp, 'assets');
        const tmpManifest = join(tmp, 'manifest.json');
        await promisify(execFile)(
          process.execPath,
          [
            join(scripts, 'import.mjs'),
            '--source',
            source ?? '',
            '--out',
            out,
            '--manifest',
            tmpManifest,
          ],
          { maxBuffer: 16 * 1024 * 1024 },
        );
        expect(readFileSync(tmpManifest, 'utf8')).toBe(readFileSync(manifestFile, 'utf8'));
        expect(manifestModule.hashTree(out)).toEqual(manifestModule.hashTree(assetsDir));
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
    600_000,
  );
});
