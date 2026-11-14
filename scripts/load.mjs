#!/usr/bin/env node
// Load test of a running QuestClass with the server's memory sampled throughout (FEAT-044).
// Default profile: 10 parallel video streams + 50 API requests/s for 2 minutes.
//
//   docker run -d --name qc-load -p 127.0.0.1:18090:8080 -v qc-load-data:/data questclass:local
//   node scripts/load.mjs --url http://127.0.0.1:18090 --container qc-load
//
// It needs a FRESH installation: the family is created through the public API like a real one.
// setup token (from `docker logs` or --setup-token) → admin → learner + trusted device → import
// token → a generated lesson (ffmpeg testsrc) imported with lesson-prep (HLS 360p/480p, chunked
// upload with offsets) → published. Then:
//   1. warm-up: the SPA, every API endpoint of the mix and one pass over the video; idle → RSS;
//   2. load: --streams viewers fetch HLS segments back to back (worse than real players, which
//      fetch at playback speed) + --rps open-loop API/static requests (learner screens, admin
//      lists, SPA files, game art) for --duration seconds; RSS sampled every 2 s;
//   3. idle again → RSS.
// Memory: VmRSS and VmHWM (the kernel's peak RSS) of the server process from /proc/<pid>/status
// — inside the container with --container, or of a local Linux process with --pid.
// Exits 1 if idle RSS after warm-up ≥ --max-idle-mb or the peak ≥ --max-load-mb.
// Requires ffmpeg on PATH and `pnpm build` (tools/lesson-prep/dist).
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lessonPrep = path.join(root, 'tools', 'lesson-prep', 'dist', 'cli.js');

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    container: { type: 'string' },
    pid: { type: 'string' },
    'setup-token': { type: 'string' },
    duration: { type: 'string', default: '120' },
    streams: { type: 'string', default: '10' },
    rps: { type: 'string', default: '50' },
    'video-seconds': { type: 'string', default: '60' },
    'idle-ms': { type: 'string', default: '10000' },
    'max-idle-mb': { type: 'string', default: '150' },
    'max-load-mb': { type: 'string', default: '200' },
  },
});
if (!values.url || (!values.container && !values.pid)) {
  console.error('Usage: node scripts/load.mjs --url <base URL> (--container <name> | --pid <pid>)');
  process.exit(2);
}
const base = values.url.replace(/\/+$/, '');
const durationMs = Number(values.duration) * 1000;
const streams = Number(values.streams);
const rps = Number(values.rps);
const idleMs = Number(values['idle-ms']);
const maxIdleMb = Number(values['max-idle-mb']);
const maxLoadMb = Number(values['max-load-mb']);
if (!existsSync(lessonPrep)) {
  console.error(`Not built: ${lessonPrep}. Run "pnpm build" first.`);
  process.exit(2);
}

const log = (line) => console.info(`[load] ${line}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mb = (kb) => kb / 1024;

// ---------------------------------------------------------------------------------- memory ---

let serverPid = values.pid;
async function procStatus() {
  if (values.container) {
    serverPid ??= (
      await run('docker', ['exec', values.container, 'cat', '/proc/1/task/1/children'])
    ).stdout
      .trim()
      .split(/\s+/)[0];
    return (await run('docker', ['exec', values.container, 'cat', `/proc/${serverPid}/status`]))
      .stdout;
  }
  return readFileSync(`/proc/${serverPid}/status`, 'utf8');
}

/** `{rss, hwm}` of the server in MiB (VmHWM = highest RSS since the process started). */
async function memory() {
  const status = await procStatus();
  const field = (name) => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(status)?.[1] ?? NaN);
  return { rss: mb(field('VmRSS')), hwm: mb(field('VmHWM')) };
}

/** cgroup memory of the container as Docker reports it (what mem_limit is checked against). */
async function dockerMem() {
  if (!values.container) return null;
  const { stdout } = await run('docker', [
    'stats',
    '--no-stream',
    '--format',
    '{{.MemUsage}}',
    values.container,
  ]);
  return stdout.trim();
}

/** Samples RSS every `everyMs` until stopped; keeps the highest value seen. */
function sampler(everyMs = 2000) {
  let peak = 0;
  let last = 0;
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      try {
        const { rss } = await memory();
        last = rss;
        peak = Math.max(peak, rss);
      } catch {
        // the container may be busy; the next sample will do
      }
      await sleep(everyMs);
    }
  })();
  return {
    async stop() {
      stopped = true;
      await loop;
      return { peak, last };
    },
  };
}

// ------------------------------------------------------------------------------------ http ---

class Jar {
  cookies = new Map();
  store(res) {
    for (const header of res.headers.getSetCookie()) {
      const [pair = ''] = header.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '' || /max-age=0/i.test(header)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  only(...names) {
    const copy = new Jar();
    for (const name of names)
      if (this.cookies.has(name)) copy.cookies.set(name, this.cookies.get(name));
    return copy;
  }
}

async function call(jar, method, urlPath, json) {
  const headers = { accept: 'application/json' };
  if (jar?.cookies.size) headers.cookie = jar.header();
  if (json !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + urlPath, {
    method,
    headers,
    ...(json !== undefined && { body: JSON.stringify(json) }),
  });
  jar?.store(res);
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : undefined;
}

/** GET that drains the body; returns bytes read. Throws on HTTP errors. */
async function drain(jar, url) {
  const res = await fetch(url.startsWith('http') ? url : base + url, {
    headers: jar?.cookies.size ? { cookie: jar.header() } : {},
  });
  jar?.store(res);
  let bytes = 0;
  for await (const chunk of res.body ?? []) bytes += chunk.length;
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return bytes;
}

// ------------------------------------------------------------------------------- preparing ---

async function setupToken() {
  if (values['setup-token']) return values['setup-token'];
  if (!values.container) throw new Error('--setup-token is required without --container');
  const { stdout, stderr } = await run('docker', ['logs', values.container]);
  const token = /setup token: (\S+)/.exec(stdout + stderr)?.[1];
  if (!token) throw new Error('No setup token in the container log: the installation is not fresh');
  return token;
}

function ffmpeg(args, cwd) {
  return run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd });
}

/** A lesson package (lesson.json + video.mp4) in a temporary folder. */
async function makeLesson(dir, seconds) {
  const s = String(seconds);
  await ffmpeg(
    [
      ...['-f', 'lavfi', '-i', `testsrc2=duration=${s}:size=854x480:rate=25`],
      ...['-f', 'lavfi', '-i', `sine=frequency=440:duration=${s}`],
      ...['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-b:v', '1500k'],
      ...['-c:a', 'aac', '-b:a', '96k', '-shortest', 'video.mp4'],
    ],
    dir,
  );
  const question = (n) => ({
    key: `q${n}`,
    text: `Вопрос ${n}?`,
    options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `Ответ ${id}${n}` })),
    correct: 'a',
  });
  const lesson = {
    externalId: `load-${Date.now()}`,
    subjectKey: 'math',
    title: 'Нагрузочный урок',
    xp: 10,
    coins: 10,
    video: 'video.mp4',
    questions: [1, 2, 3, 4, 5].map(question),
  };
  writeFileSync(path.join(dir, 'lesson.json'), JSON.stringify(lesson, null, 2), 'utf8');
  return lesson.externalId;
}

/** Runs `lesson-prep import` (the real chunked upload); the token goes through stdin. */
function importLesson(dir, token) {
  const config = path.join(dir, 'lesson-prep.json');
  writeFileSync(config, JSON.stringify({ server: base, encoder: 'x264' }), 'utf8');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [lessonPrep, 'import', dir, '--config', config], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const forward = (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) log(`  ${line}`);
    };
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.stdin.end(`${token}\n`);
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`lesson-prep import exited with ${code}`)),
    );
  });
}

async function prepare() {
  const login = `load-${Date.now().toString(36)}`;
  const password = `Load-${Math.random().toString(36).slice(2)}-pass`;
  const admin = new Jar();
  await call(admin, 'POST', '/api/setup', {
    token: await setupToken(),
    login,
    password,
    name: 'Нагрузка',
  });
  const learner = await call(admin, 'POST', '/api/admin/users', {
    role: 'learner',
    name: 'Ученик',
    pin: '2468',
  });
  const trusted = admin.only('qc_session', 'qc_act');
  await call(trusted, 'POST', '/api/auth/devices', { name: 'Нагрузочный планшет' });
  const child = trusted.only('qc_device');
  await call(child, 'POST', '/api/auth/learner-login', { userId: learner.id, pin: '2468' });
  log(`family: admin ${login}, learner #${learner.id}, trusted device`);

  const { token } = await call(admin, 'POST', '/api/admin/import-tokens', { name: 'load' });
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qc-load-'));
  try {
    const externalId = await makeLesson(dir, Number(values['video-seconds']));
    const upload = sampler(1000);
    const started = Date.now();
    await importLesson(dir, token);
    const { peak } = await upload.stop();
    log(
      `lesson imported in ${((Date.now() - started) / 1000).toFixed(1)} s, peak RSS during upload ${peak.toFixed(1)} MiB`,
    );
    const tasks = await call(admin, 'GET', '/api/admin/tasks');
    const list = Array.isArray(tasks) ? tasks : (tasks.items ?? []);
    const task = list.find((t) => t.externalId === externalId);
    if (!task) throw new Error(`Imported task ${externalId} not found`);
    await call(admin, 'PATCH', `/api/admin/tasks/${task.id}`, { status: 'published' });
    const session = await call(child, 'POST', `/api/watch/${task.id}/sessions`);
    log(`task #${task.id} published; learner plays ${session.media.src}`);
    return { admin, learner: child, taskId: task.id, src: session.media.src, uploadPeak: peak };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------------------------ load ---

/** Segment URLs of one rendition of an HLS master playlist, like a player would pick. */
async function segmentsOf(jar, src, rendition) {
  const lines = (text) =>
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  const masterUrl = new URL(src, base);
  const masterText = await (await fetch(masterUrl, { headers: { cookie: jar.header() } })).text();
  const variants = lines(masterText);
  const variantUrl = new URL(variants[rendition % variants.length], masterUrl);
  const playlist = await (await fetch(variantUrl, { headers: { cookie: jar.header() } })).text();
  return [variantUrl.href, ...lines(playlist).map((s) => new URL(s, variantUrl).href)];
}

function stats() {
  return { ok: 0, failed: 0, bytes: 0, latencies: [], errors: new Map(), slow: new Map() };
}

function record(s, started, error, url) {
  const ms = performance.now() - started;
  s.latencies.push(ms);
  if (url !== undefined && ms > 1000) {
    const key = url.replace(/\/\d+(?=\/|$)/g, '/:id');
    s.slow.set(key, (s.slow.get(key) ?? 0) + 1);
  }
  if (error) {
    s.failed += 1;
    const cause = error.cause ? ` (${error.cause.code ?? error.cause.message ?? error.cause})` : '';
    const key = `${String(error.message ?? error).slice(0, 120)}${cause}${url ? ` ${url}` : ''}`;
    s.errors.set(key, (s.errors.get(key) ?? 0) + 1);
  } else {
    s.ok += 1;
  }
}

function percentile(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
}

function summary(name, s, seconds) {
  const sorted = [...s.latencies].sort((a, b) => a - b);
  const line =
    `${name}: ${s.ok} ok, ${s.failed} failed, ${(s.ok / seconds).toFixed(1)}/s, ` +
    `p50 ${percentile(sorted, 0.5).toFixed(0)} ms, p95 ${percentile(sorted, 0.95).toFixed(0)} ms` +
    (s.bytes ? `, ${(s.bytes / 1024 / 1024 / seconds).toFixed(1)} MiB/s` : '');
  log(line);
  for (const [error, count] of s.errors) log(`  ${count} × ${error}`);
  const slow = [...s.slow].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (slow.length) log(`  slower than 1 s: ${slow.map(([u, n]) => `${u} ×${n}`).join(', ')}`);
}

async function viewer(jar, segments, until, s) {
  while (Date.now() < until) {
    for (const url of segments) {
      if (Date.now() >= until) return;
      const started = performance.now();
      try {
        const bytes = await drain(jar, url);
        s.bytes += bytes;
        record(s, started);
      } catch (err) {
        record(s, started, err);
      }
    }
  }
}

/** Open-loop requests: one every 1000/rps ms regardless of how fast answers come back. */
async function apiTraffic(targets, until, s, perSecond) {
  const interval = 1000 / perSecond;
  const inFlight = new Set();
  let next = performance.now();
  let i = 0;
  while (Date.now() < until) {
    const { jar, url } = targets[i++ % targets.length];
    const started = performance.now();
    const p = drain(jar, url)
      .then((bytes) => {
        s.bytes += bytes;
        record(s, started, undefined, url);
      })
      .catch((err) => record(s, started, err, url))
      .finally(() => inFlight.delete(p));
    inFlight.add(p);
    next += interval;
    await sleep(Math.max(0, next - performance.now()));
  }
  await Promise.all(inFlight);
}

async function trafficTargets(ctx) {
  const { learner, admin, taskId } = ctx;
  const index = await (await fetch(`${base}/`)).text();
  const appFiles = [...index.matchAll(/(?:src|href)="(\/_app\/[^"]+)"/g)].map((m) => m[1]);
  const learnerUrls = [
    '/api/auth/me',
    '/api/tasks',
    `/api/tasks/${taskId}`,
    '/api/me/wallet',
    '/api/me/progress',
    '/api/me/streak',
    '/api/shop',
    '/api/me/character',
    '/api/me/awards',
    '/api/me/wishes',
    '/api/me/ledger',
  ];
  // Game art the learner's screens show, taken from the catalog answers.
  const art = new Set();
  for (const url of ['/api/shop', '/api/me/character']) {
    const text = await (await fetch(base + url, { headers: { cookie: learner.header() } })).text();
    for (const m of text.matchAll(/(\/?assets\/[^"\s]+?\.(?:webp|png|ogg|mp3))/g)) {
      art.add(m[1].startsWith('/') ? m[1] : `/${m[1]}`);
    }
  }
  return [
    ...learnerUrls.map((url) => ({ jar: learner, url })),
    ...['/api/admin/users', '/api/admin/tasks'].map((url) => ({ jar: admin, url })),
    { jar: null, url: '/api/health' },
    { jar: null, url: '/' },
    ...appFiles.map((url) => ({ jar: null, url })),
    ...[...art].slice(0, 40).map((url) => ({ jar: null, url })),
  ];
}

// ------------------------------------------------------------------------------------ main ---

async function idleMemory(label) {
  await sleep(idleMs);
  const { rss, hwm } = await memory();
  const cgroup = await dockerMem();
  log(
    `${label}: RSS ${rss.toFixed(1)} MiB (peak so far ${hwm.toFixed(1)} MiB)${cgroup ? `, docker stats ${cgroup}` : ''}`,
  );
  return rss;
}

async function main() {
  const fresh = await memory();
  log(`server pid ${serverPid}: RSS at start ${fresh.rss.toFixed(1)} MiB`);
  const ctx = await prepare();
  const targets = await trafficTargets(ctx);
  log(`traffic mix: ${targets.length} URLs (learner/admin API, SPA files, game art)`);

  // Warm-up: every URL of the mix a few times and one pass over each rendition.
  const warm = stats();
  for (let round = 0; round < 3; round += 1) {
    for (const t of targets) {
      const started = performance.now();
      await drain(t.jar, t.url).then(
        () => record(warm, started),
        (err) => record(warm, started, err),
      );
    }
  }
  for (const rendition of [0, 1]) {
    for (const url of await segmentsOf(ctx.learner, ctx.src, rendition))
      await drain(ctx.learner, url);
  }
  if (warm.failed) summary('warm-up', warm, 1);
  const idleAfterWarmup = await idleMemory('idle after warm-up');

  log(`load: ${streams} video streams + ${rps} requests/s for ${durationMs / 1000} s`);
  const until = Date.now() + durationMs;
  const video = stats();
  const api = stats();
  const samples = sampler(2000);
  const segmentLists = await Promise.all(
    Array.from({ length: streams }, (_, i) => segmentsOf(ctx.learner, ctx.src, i)),
  );
  await Promise.all([
    ...segmentLists.map((segments) => viewer(ctx.learner, segments, until, video)),
    apiTraffic(targets, until, api, rps),
  ]);
  const { peak: sampledPeak, last } = await samples.stop();
  const underLoad = await memory();
  const cgroup = await dockerMem();
  const seconds = durationMs / 1000;
  summary('video segments', video, seconds);
  summary('api + static', api, seconds);
  log(
    `under load: RSS last ${last.toFixed(1)} MiB, sampled peak ${sampledPeak.toFixed(1)} MiB, ` +
      `VmHWM ${underLoad.hwm.toFixed(1)} MiB${cgroup ? `, docker stats ${cgroup}` : ''}`,
  );
  const idleAfterLoad = await idleMemory('idle after load');

  const peak = Math.max(underLoad.hwm, sampledPeak);
  const okIdle = idleAfterWarmup < maxIdleMb;
  const okLoad = peak < maxLoadMb;
  log('—'.repeat(60));
  log(
    `RSS idle after warm-up ${idleAfterWarmup.toFixed(1)} MiB (limit ${maxIdleMb}) — ${okIdle ? 'OK' : 'TOO HIGH'}`,
  );
  log(
    `RSS peak (VmHWM, incl. upload) ${peak.toFixed(1)} MiB (limit ${maxLoadMb}) — ${okLoad ? 'OK' : 'TOO HIGH'}`,
  );
  log(
    `RSS idle after load ${idleAfterLoad.toFixed(1)} MiB; upload peak ${ctx.uploadPeak.toFixed(1)} MiB`,
  );
  const failures = video.failed + api.failed;
  if (failures) log(`${failures} requests failed (see above)`);
  return okIdle && okLoad && failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
