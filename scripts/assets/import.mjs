#!/usr/bin/env node
// Imports the MVP assets of the original app (FEAT-026).
//
//   pnpm assets:import -- --source <path to QuestClass-Source/public>
//
// Takes exactly the files selected by mvp-assets.txt, converts them (see the list header), writes
// them to apps/web/public/assets, removes stale files there, regenerates
// packages/shared/src/assets/manifest.json and enforces the size budget. The output is
// deterministic: the same source and tool versions give byte-identical files.
// Dev-only: sharp (devDependency) and ffmpeg on PATH; nothing here runs on the server.
import { execFile, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { formatReport, measure } from './budget.mjs';
import {
  buildManifest,
  DEFAULT_ASSETS_DIR,
  DEFAULT_MANIFEST,
  isMainModule,
  listFiles,
  writeManifest,
} from './manifest.mjs';

const execFileAsync = promisify(execFile);
export const DEFAULT_LIST = join(dirname(fileURLToPath(import.meta.url)), 'mvp-assets.txt');

// Conversion settings. Changing any of them changes the output: re-run the import and commit it.
const WEBP_LOSSLESS = { lossless: true, effort: 6 };
// Streak clip (768x1168, 24 fps, 10 s): same size, 12 fps, lossy q70, endless loop (the player
// stops it after `durationMs`). Compression level 4: ~6 MB in ~7 s; level 6 saves 4% but takes ~110 s.
const VIDEO_WEBP = ['-vf', 'fps=12', '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', '70'];
const VIDEO_WEBP_TAIL = ['-compression_level', '4', '-loop', '0'];
const MP3 = ['-c:a', 'libmp3lame', '-q:a', '4', '-id3v2_version', '0', '-write_id3v1', '0'];
const OGG = ['-c:a', 'libvorbis', '-q:a', '4'];
const FFMPEG_BITEXACT = ['-map_metadata', '-1', '-fflags', '+bitexact', '-flags', '+bitexact'];

const MODES = new Set(['auto', 'keep']);
const COPY_AS_IS = new Set(['webp', 'svg', 'ttf', 'woff2', 'txt']);

const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const extOf = (rel) => rel.slice(rel.lastIndexOf('.') + 1).toLowerCase();
const stemOf = (rel) => rel.slice(0, rel.lastIndexOf('.'));

/** Glob -> RegExp: `**\/` any folders, `*` within one segment, `?` one character. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:[^/]+/)*';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Parses mvp-assets.txt into ordered rules. */
export function parseList(text) {
  const rules = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const [pattern, mode = 'auto', ...rest] = line.split(/\s+/);
    const where = `mvp-assets.txt:${index + 1}`;
    if (rest.length || !MODES.has(mode)) throw new Error(`${where}: expected "<glob> [auto|keep]"`);
    const exclude = pattern.startsWith('!');
    const glob = exclude ? pattern.slice(1) : pattern;
    if (!glob || glob.startsWith('/') || glob.split('/').includes('..')) {
      throw new Error(`${where}: glob must be relative to public/`);
    }
    if (exclude && mode !== 'auto') throw new Error(`${where}: an exclude has no mode`);
    // Folders to walk: everything up to the first segment with a wildcard.
    const segments = glob.split('/');
    const firstWild = segments.findIndex((s) => /[*?]/.test(s));
    const base = firstWild === -1 ? segments.slice(0, -1) : segments.slice(0, firstWild);
    rules.push({ where, exclude, glob, mode, regex: globToRegExp(glob), base: base.join('/') });
  });
  return rules;
}

/** Applies the rules to the source tree: Map(path -> mode); the last matching rule wins. */
export function selectFiles(source, rules) {
  const candidates = new Set();
  const walked = new Map();
  for (const rule of rules.filter((r) => !r.exclude)) {
    let files = walked.get(rule.base);
    if (!files) {
      const dir = join(source, rule.base);
      files = existsSync(dir) && statSync(dir).isDirectory() ? listFiles(dir) : [];
      files = files.map((rel) => (rule.base ? `${rule.base}/${rel}` : rel));
      walked.set(rule.base, files);
    }
    const matched = files.filter((rel) => rule.regex.test(rel));
    if (!matched.length)
      throw new Error(`${rule.where}: "${rule.glob}" matches no file in ${source}`);
    matched.forEach((rel) => candidates.add(rel));
  }
  const selected = new Map();
  const used = new Set();
  for (const rel of [...candidates].sort(byCodePoint)) {
    let decision;
    for (const rule of rules) if (rule.regex.test(rel)) decision = rule;
    used.add(decision);
    if (!decision.exclude) selected.set(rel, decision.mode);
  }
  const stale = rules.find((r) => r.exclude && !used.has(r));
  if (stale) throw new Error(`${stale.where}: exclude "${stale.glob}" matches nothing`);
  return selected;
}

function hasAudio(file) {
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=index',
      '-of',
      'csv=p=0',
      file,
    ],
    { encoding: 'utf8' },
  );
  if (probe.error || probe.status !== 0)
    throw new Error(`ffprobe failed on ${file}: ${probe.stderr ?? probe.error}`);
  return probe.stdout.trim() !== '';
}

/** Conversion tasks for the selected files: [{src, out, op}], outputs unique. */
export function planTasks(source, selected) {
  const tasks = [];
  for (const [rel, mode] of selected) {
    const src = join(source, rel);
    const ext = extOf(rel);
    const stem = stemOf(rel);
    const add = (out, op) => tasks.push({ rel, src, out, op });
    if (mode === 'keep' || COPY_AS_IS.has(ext)) add(rel, 'copy');
    else if (ext === 'png') add(`${stem}.webp`, 'png-webp');
    else if (ext === 'ogg') {
      add(rel, 'copy');
      add(`${stem}.mp3`, 'mp3');
    } else if (ext === 'mp3') {
      add(rel, 'copy');
      add(`${stem}.ogg`, 'ogg');
    } else if (ext === 'mp4') {
      add(`${stem}.webp`, 'video-webp');
      if (hasAudio(src)) {
        add(`${stem}.ogg`, 'ogg');
        add(`${stem}.mp3`, 'mp3');
      }
    } else
      throw new Error(`${rel}: no conversion for .${ext}; add a rule to import.mjs or use "keep"`);
  }
  const owners = new Map();
  for (const task of tasks) {
    const other = owners.get(task.out);
    if (other) throw new Error(`${task.rel} and ${other} both produce ${task.out}`);
    owners.set(task.out, task.rel);
  }
  return tasks;
}

const ffmpeg = (src, args, out) =>
  execFileAsync(
    'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      src,
      ...args,
      ...FFMPEG_BITEXACT,
      out,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );

async function runTask(task, outDir, sharp) {
  const out = join(outDir, task.out);
  mkdirSync(dirname(out), { recursive: true });
  switch (task.op) {
    case 'copy':
      copyFileSync(task.src, out);
      return;
    case 'png-webp': {
      const input = await sharp(task.src).metadata();
      const info = await sharp(task.src).webp(WEBP_LOSSLESS).toFile(out);
      if (info.width !== input.width || info.height !== input.height) {
        throw new Error(`${task.rel}: size changed during conversion`);
      }
      return;
    }
    case 'mp3':
      await ffmpeg(task.src, ['-map', '0:a:0', '-vn', ...MP3], out);
      return;
    case 'ogg':
      await ffmpeg(task.src, ['-map', '0:a:0', '-vn', ...OGG], out);
      return;
    case 'video-webp':
      await ffmpeg(task.src, ['-map', '0:v:0', '-an', ...VIDEO_WEBP, ...VIDEO_WEBP_TAIL], out);
      return;
    default:
      throw new Error(`unknown op ${task.op}`);
  }
}

async function runPool(items, jobs, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, items.length)) }, worker));
}

/** Removes files in `outDir` that the import did not produce, then empty folders. */
function prune(outDir, keep) {
  for (const rel of listFiles(outDir)) if (!keep.has(rel)) unlinkSync(join(outDir, rel));
  const removeEmpty = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) removeEmpty(join(dir, entry.name));
    }
    if (dir !== outDir && readdirSync(dir).length === 0) rmdirSync(dir);
  };
  removeEmpty(outDir);
}

/** Accepts either the original's root or its public/ folder. */
export function resolveSource(dir) {
  const root = resolve(dir);
  const publicDir = existsSync(join(root, 'public', 'game')) ? join(root, 'public') : root;
  if (!existsSync(join(publicDir, 'game'))) {
    throw new Error(`${dir} is not the original's public/ folder (no game/ inside)`);
  }
  return publicDir;
}

export async function importAssets({
  source,
  out = DEFAULT_ASSETS_DIR,
  manifest = DEFAULT_MANIFEST,
  list = DEFAULT_LIST,
  jobs = availableParallelism(),
}) {
  const sourceDir = resolveSource(source);
  const outDir = resolve(out);
  // Stale files are deleted, so refuse anything that does not look like an assets folder.
  if (basename(outDir) !== 'assets')
    throw new Error(`--out must be a folder named "assets": ${outDir}`);
  const rules = parseList(readFileSync(list, 'utf8'));
  const selected = selectFiles(sourceDir, rules);
  const tasks = planTasks(sourceDir, selected);
  if (tasks.some((t) => t.op !== 'copy' && t.op !== 'png-webp')) {
    const probe = spawnSync('ffmpeg', ['-version']);
    if (probe.error || probe.status !== 0)
      throw new Error('ffmpeg is required on PATH for audio and video');
  }
  const { default: sharp } = await import('sharp');
  mkdirSync(outDir, { recursive: true });
  // The clip takes longest: start it first.
  const ordered = [...tasks].sort(
    (a, b) => Number(b.op === 'video-webp') - Number(a.op === 'video-webp'),
  );
  await runPool(ordered, jobs, (task) => runTask(task, outDir, sharp));
  prune(outDir, new Set(tasks.map((t) => t.out)));
  const result = buildManifest(outDir);
  mkdirSync(dirname(resolve(manifest)), { recursive: true });
  writeManifest(result, resolve(manifest));
  const ops = {};
  for (const task of tasks) ops[task.op] = (ops[task.op] ?? 0) + 1;
  return { sources: selected.size, ops, manifest: result, budget: measure(outDir) };
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      source: { type: 'string' },
      out: { type: 'string', default: DEFAULT_ASSETS_DIR },
      manifest: { type: 'string', default: DEFAULT_MANIFEST },
      list: { type: 'string', default: DEFAULT_LIST },
      jobs: { type: 'string' },
    },
  });
  if (!values.source) {
    console.error(
      'usage: pnpm assets:import -- --source <QuestClass-Source/public> [--out dir] [--manifest file]',
    );
    process.exit(2);
  }
  const started = Date.now();
  const report = await importAssets({
    ...values,
    jobs: values.jobs ? Number(values.jobs) : availableParallelism(),
  });
  console.log(
    `imported ${report.sources} source files in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
  console.log(
    `  ${Object.entries(report.ops)
      .map(([op, n]) => `${op}: ${n}`)
      .join(', ')}`,
  );
  console.log(formatReport(report.budget));
  if (!report.budget.ok) {
    console.error('asset budget exceeded (scripts/assets/budget.mjs)');
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
