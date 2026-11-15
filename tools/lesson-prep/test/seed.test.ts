import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lessonManifestSchema } from '@questclass/shared/import/manifest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../apps/api/src/app';
import type { AppEnv } from '../../../apps/api/src/http/route';
import { createTestRuntime, type TestRuntime } from '../../../apps/api/test/helpers/db';
import { quickAdmin } from '../../../apps/api/test/helpers/fastUsers';
import { fetchVideos, FetchError, YT_FORMAT } from '../src/commands/fetch';
import { importLesson } from '../src/commands/import';
import {
  buildSeed,
  externalIdOf,
  findSeedDir,
  loadSeed,
  picturesOf,
  videoFileOf,
} from '../src/commands/seed';
import { spawnRunner, type Runner, type Tools } from '../src/hls';
import type { Fetch } from '../src/upload';
import { fakeFfmpeg } from './fakeFfmpeg';

const SEED_IDS = ['9rj3EcFE3eQ', 'AYusQ1cUPLg', '2dIuk82WpX4', 'JRvhRLBz4-I', 'uilgFrGZlsU'];
const work = mkdtempSync(path.join(os.tmpdir(), 'qc-lesson-prep-seed-'));

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('seed fixtures (committed, no QuestClass-Source needed)', () => {
  it('5 lessons, one per subject, 8 questions with evidence each, 53 pictures', async () => {
    const lessons = await loadSeed();
    expect(lessons.map((l) => [l.videoId, l.subjectKey])).toEqual([
      ['9rj3EcFE3eQ', 'math'],
      ['AYusQ1cUPLg', 'art'],
      ['2dIuk82WpX4', 'world'],
      ['JRvhRLBz4-I', 'russian'],
      ['uilgFrGZlsU', 'reading'],
    ]);
    const seedDir = findSeedDir();
    let pictures = 0;
    for (const lesson of lessons) {
      expect(lesson.questions, lesson.videoId).toHaveLength(8);
      for (const q of lesson.questions) {
        expect(q.evidence, `${lesson.videoId} ${q.key}`).toMatchObject({
          start: expect.any(Number) as number,
          end: expect.any(Number) as number,
        });
        for (const name of picturesOf(q)) {
          const file = path.join(seedDir, 'images', lesson.videoId, name);
          const head = readFileSync(file).subarray(0, 12).toString('latin1');
          expect(head.startsWith('RIFF') && head.endsWith('WEBP'), file).toBe(true);
          pictures += 1;
        }
      }
      // Each lesson is a valid import package apart from the video.
      const names = [...new Set(lesson.questions.flatMap(picturesOf))];
      const placeholder = { size: 1, sha256: '0'.repeat(64) };
      const check = lessonManifestSchema.safeParse({
        externalId: externalIdOf(lesson.videoId),
        subjectKey: lesson.subjectKey,
        title: lesson.title,
        lessonDate: lesson.lessonDate,
        questions: lesson.questions,
        media: { kind: 'hls', files: [{ path: 'master.m3u8', ...placeholder }] },
        ...(names.length > 0 && {
          images: { files: names.map((p) => ({ path: p, ...placeholder })) },
        }),
      });
      expect(check.success, JSON.stringify(check.error?.issues)).toBe(true);
    }
    expect(pictures).toBe(53);
  });
});

describe('lesson-prep seed', () => {
  it('builds packages for the videos present and names the missing ones with a command', async () => {
    const videos = path.join(work, 'some-videos');
    mkdirSync(videos, { recursive: true });
    writeFileSync(videoFileOf(videos, '9rj3EcFE3eQ'), 'video');
    writeFileSync(videoFileOf(videos, 'uilgFrGZlsU'), 'video');
    const lines: string[] = [];
    const out = path.join(work, 'some-packages');
    const result = await buildSeed({ videos, out, log: (l) => lines.push(l) });
    expect(result.packages.map((p) => path.basename(p))).toEqual(['9rj3EcFE3eQ', 'uilgFrGZlsU']);
    expect(result.missing).toEqual(['AYusQ1cUPLg', '2dIuk82WpX4', 'JRvhRLBz4-I']);
    expect(lines.join('\n')).toContain(
      `lesson-prep fetch AYusQ1cUPLg 2dIuk82WpX4 JRvhRLBz4-I --out "${videos}"`,
    );

    const lesson = JSON.parse(
      readFileSync(path.join(out, '9rj3EcFE3eQ', 'lesson.json'), 'utf8'),
    ) as { externalId: string; video: string; questions: { image?: string }[] };
    expect(lesson.externalId).toBe('yt-9rj3EcFE3eQ');
    expect(lesson.video).toBe(path.resolve(videoFileOf(videos, '9rj3EcFE3eQ')));
    expect(lesson.questions[0]?.image).toBe('images/q1.webp');
    expect(existsSync(path.join(out, '9rj3EcFE3eQ', 'images', 'q1-a.webp'))).toBe(true);
    // No pictures for the reading lesson: an empty images folder.
    expect(existsSync(path.join(out, 'uilgFrGZlsU', 'video.mp4'))).toBe(false);
  });
});

const ffmpegAvailable =
  spawnSync('ffmpeg', ['-hide_banner', '-version'], { windowsHide: true }).status === 0;

describe('seed + import into a test API', () => {
  const ENV = {
    incoming: { socket: { remoteAddress: '127.0.0.1' } },
  } as unknown as AppEnv['Bindings'];
  let runtime: TestRuntime;
  let token: string;

  beforeAll(async () => {
    runtime = await createTestRuntime();
    token = runtime.ctx.imports.createToken('seed', await quickAdmin(runtime.ctx)).token;
  }, 30_000);

  afterAll(async () => {
    await runtime.close();
  });

  it('gives 5 drafts with 8 questions each, their pictures, evidence and a ready video', async () => {
    const videos = path.join(work, 'videos');
    mkdirSync(videos, { recursive: true });
    // A small sample video (real ffmpeg when installed, otherwise ffmpeg is mocked).
    const sample = path.join(work, 'sample.mp4');
    let tools: Tools;
    if (ffmpegAvailable) {
      const made = spawnSync(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=854x480:rate=25:duration=3',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=330:duration=3',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-shortest',
          sample,
        ],
        { windowsHide: true },
      );
      expect(made.status).toBe(0);
      tools = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', run: spawnRunner };
    } else {
      writeFileSync(sample, 'sample video');
      tools = fakeFfmpeg().tools;
    }
    for (const id of SEED_IDS) {
      copyFileSync(sample, videoFileOf(videos, id));
    }
    const { packages, missing } = await buildSeed({ videos, out: path.join(work, 'packages') });
    expect(missing).toEqual([]);

    const fetch: Fetch = (url, init) => {
      const { pathname, search } = new URL(url);
      return Promise.resolve(createApp(runtime.ctx).app.request(`${pathname}${search}`, init, ENV));
    };
    const client = {
      server: 'http://questclass.test',
      token,
      fetch,
      sleep: () => Promise.resolve(),
    };
    for (const folder of packages) {
      await importLesson(folder, { client, tools, encoder: 'auto' });
    }

    const { ctx } = runtime;
    const lessons = await loadSeed();
    const tasks = ctx.tasks.list().filter((t) => t.externalId?.startsWith('yt-'));
    expect(tasks).toHaveLength(5);
    let pictures = 0;
    for (const lesson of lessons) {
      const task = tasks.find((t) => t.externalId === externalIdOf(lesson.videoId));
      expect(task, lesson.videoId).toMatchObject({
        status: 'draft',
        type: 'video_lesson',
        title: lesson.title,
        lessonDate: lesson.lessonDate,
        subjectId: ctx.subjects.findByKey(lesson.subjectKey)?.id,
      });
      const bank = ctx.questions.activeBank(task?.id ?? 0);
      expect(bank, lesson.videoId).toHaveLength(8);
      expect(bank.every((q) => q.evidence !== null)).toBe(true);
      for (const q of bank) {
        const refs = [q.image, ...q.options.map((o) => o.image)].filter(
          (ref): ref is string => typeof ref === 'string',
        );
        for (const ref of refs) {
          expect(ref).toMatch(/^media\/\d+\/q\d(-[a-d])?\.webp$/);
          pictures += 1;
        }
      }
      const mediaId = (task?.config as { mediaId: number }).mediaId;
      expect(ctx.media.find(mediaId)).toMatchObject({ status: 'ready', kind: 'hls' });
    }
    expect(pictures).toBe(53);
  }, 120_000);
});

describe('lesson-prep fetch', () => {
  it('asks the installed yt-dlp for 480p MP4 and skips what is already there', async () => {
    const out = path.join(work, 'fetched');
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, 'uilgFrGZlsU.mp4'), 'already here');
    const calls: string[][] = [];
    const run: Runner = (command, args) => {
      calls.push([command, ...args]);
      return Promise.resolve({ code: 0, stdout: '', stderr: '' });
    };
    const result = await fetchVideos(['9rj3EcFE3eQ', 'uilgFrGZlsU'], { out, run });
    expect(result).toEqual({ downloaded: ['9rj3EcFE3eQ'], skipped: ['uilgFrGZlsU'] });
    expect(calls).toEqual([
      [
        'yt-dlp',
        '--no-playlist',
        '-f',
        YT_FORMAT,
        '--merge-output-format',
        'mp4',
        '-o',
        path.join(out, '%(id)s.%(ext)s'),
        'https://www.youtube.com/watch?v=9rj3EcFE3eQ',
      ],
    ]);
    expect(YT_FORMAT).toContain('height<=480');
  });

  it('explains a missing yt-dlp, a failed download and a wrong id', async () => {
    const out = path.join(work, 'fetch-errors');
    const missing: Runner = () => Promise.reject(new Error('spawn yt-dlp ENOENT'));
    await expect(fetchVideos(['9rj3EcFE3eQ'], { out, run: missing })).rejects.toThrow('yt-dlp');
    const failing: Runner = () => Promise.resolve({ code: 1, stdout: '', stderr: 'ERROR' });
    await expect(fetchVideos(['9rj3EcFE3eQ'], { out, run: failing })).rejects.toThrow(FetchError);
    await expect(fetchVideos(['not-an-id'], { out, run: failing })).rejects.toThrow('not-an-id');
  });
});
