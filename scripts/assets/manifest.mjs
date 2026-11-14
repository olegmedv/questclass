#!/usr/bin/env node
// Asset manifest (FEAT-026): published path -> {kind, w, h, bytes, animated, frames?, durationMs?}.
// Reads file headers only (WebP, PNG, SVG), no native dependencies, so CI can verify the manifest
// against the committed files without sharp or ffmpeg.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULT_ASSETS_DIR = join(repoRoot, 'apps/web/public/assets');
export const DEFAULT_MANIFEST = join(repoRoot, 'packages/shared/src/assets/manifest.json');

const KIND_BY_EXT = {
  webp: 'image',
  png: 'image',
  svg: 'image',
  ogg: 'audio',
  mp3: 'audio',
  ttf: 'font',
  woff2: 'font',
  txt: 'text',
};

/** Code-point order, independent of locale. */
const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** All files under `dir` as sorted POSIX paths relative to it. */
export function listFiles(dir) {
  const out = [];
  const walk = (abs, rel) => {
    const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
      byCodePoint(a.name, b.name),
    );
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(abs, entry.name), childRel);
      else if (entry.isFile()) out.push(childRel);
    }
  };
  walk(dir, '');
  return out.sort(byCodePoint);
}

const u24 = (buf, at) => buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16);

function describeWebp(buf, rel) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') {
    throw new Error(`${rel}: not a WebP file`);
  }
  let w = 0;
  let h = 0;
  let animated = false;
  let frames = 0;
  let durationMs = 0;
  for (let at = 12; at + 8 <= buf.length;) {
    const fourcc = buf.toString('latin1', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    const data = at + 8;
    if (fourcc === 'VP8X') {
      animated = (buf[data] & 0x02) !== 0;
      w = u24(buf, data + 4) + 1;
      h = u24(buf, data + 7) + 1;
    } else if (fourcc === 'ANMF') {
      frames += 1;
      durationMs += u24(buf, data + 12);
    } else if (fourcc === 'VP8 ' && !w) {
      w = buf.readUInt16LE(data + 6) & 0x3fff;
      h = buf.readUInt16LE(data + 8) & 0x3fff;
    } else if (fourcc === 'VP8L' && !w) {
      const bits = buf.readUInt32LE(data + 1);
      w = (bits & 0x3fff) + 1;
      h = ((bits >> 14) & 0x3fff) + 1;
    }
    at = data + size + (size & 1);
  }
  if (!w || !h) throw new Error(`${rel}: WebP without dimensions`);
  if (animated && frames === 0) throw new Error(`${rel}: animated WebP without frames`);
  return animated ? { w, h, animated, frames, durationMs } : { w, h, animated };
}

function describePng(buf, rel) {
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error(`${rel}: not a PNG file`);
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  // An APNG declares acTL before the first IDAT.
  for (let at = 8; at + 8 <= buf.length;) {
    const size = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    if (type === 'acTL') return { w, h, animated: true, frames: buf.readUInt32BE(at + 8) };
    if (type === 'IDAT') break;
    at += 12 + size;
  }
  return { w, h, animated: false };
}

function describeSvg(buf, rel) {
  const root = /<svg\b[^>]*>/.exec(buf.toString('utf8'))?.[0];
  if (!root) throw new Error(`${rel}: no <svg> root element`);
  const attr = (name) => new RegExp(`\\s${name}="([^"]*)"`).exec(root)?.[1];
  const viewBox = attr('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const w = Number.parseFloat(attr('width') ?? '') || viewBox?.[2] || 0;
  const h = Number.parseFloat(attr('height') ?? '') || viewBox?.[3] || 0;
  if (!w || !h) throw new Error(`${rel}: SVG without size`);
  return { w, h, animated: false };
}

/** Manifest entry for one file. */
export function describeFile(buf, rel) {
  const ext = rel.slice(rel.lastIndexOf('.') + 1).toLowerCase();
  const kind = KIND_BY_EXT[ext];
  if (!kind) throw new Error(`${rel}: unsupported asset type .${ext}`);
  if (kind !== 'image') return { kind, bytes: buf.length };
  const image =
    ext === 'webp'
      ? describeWebp(buf, rel)
      : ext === 'png'
        ? describePng(buf, rel)
        : describeSvg(buf, rel);
  const { w, h, animated, ...rest } = image;
  return { kind, w, h, bytes: buf.length, animated, ...rest };
}

/** Manifest of every file under `dir`, keys in code-point order. */
export function buildManifest(dir = DEFAULT_ASSETS_DIR) {
  const manifest = {};
  for (const rel of listFiles(dir)) manifest[rel] = describeFile(readFileSync(join(dir, rel)), rel);
  return manifest;
}

/** sha256 of every file under `dir` (for the determinism check). */
export function hashTree(dir) {
  const hashes = {};
  for (const rel of listFiles(dir)) {
    hashes[rel] = createHash('sha256')
      .update(readFileSync(join(dir, rel)))
      .digest('hex');
  }
  return hashes;
}

/** True when the module at `url` is the script node was started with. */
export function isMainModule(url) {
  if (!process.argv[1]) return false;
  const a = resolve(process.argv[1]);
  const b = fileURLToPath(url);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export const serializeManifest = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

export function writeManifest(manifest, file = DEFAULT_MANIFEST) {
  writeFileSync(file, serializeManifest(manifest));
}

/** Differences between a committed manifest and the files on disk. */
export function compareManifest(expected, actual) {
  const missing = Object.keys(expected).filter((rel) => !(rel in actual));
  const extra = Object.keys(actual).filter((rel) => !(rel in expected));
  const changed = Object.keys(expected).filter(
    (rel) => rel in actual && JSON.stringify(expected[rel]) !== JSON.stringify(actual[rel]),
  );
  return { missing, extra, changed };
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      dir: { type: 'string', default: DEFAULT_ASSETS_DIR },
      manifest: { type: 'string', default: DEFAULT_MANIFEST },
      check: { type: 'boolean', default: false },
    },
  });
  const actual = buildManifest(resolve(values.dir));
  if (!values.check) {
    writeManifest(actual, resolve(values.manifest));
    console.log(`manifest: ${Object.keys(actual).length} files -> ${values.manifest}`);
    return;
  }
  const expected = JSON.parse(readFileSync(resolve(values.manifest), 'utf8'));
  const diff = compareManifest(expected, actual);
  const problems = diff.missing.length + diff.extra.length + diff.changed.length;
  if (problems) {
    console.error(JSON.stringify(diff, null, 2));
    process.exit(1);
  }
  console.log(`manifest: ${Object.keys(actual).length} files match`);
}

if (isMainModule(import.meta.url)) main();
