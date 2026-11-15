import type { QuestionContent } from '@questclass/shared/questions/schema';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jobRuns } from '../src/db/schema/jobRuns';
import { HttpError } from '../src/http/errors';
import { RETENTION_JOB, retentionJob, runRetention } from '../src/jobs/retention';
import { createScheduler, runJob, STALE_RUN_MS, type Job } from '../src/jobs/scheduler';
import { quickAdmin, quickLearner } from './helpers/fastUsers';
import { createTestRuntime, type TestRuntime } from './helpers/db';

const DAY = 86_400_000;

let runtime: TestRuntime;
let adminId: number;
let anya: number;
let borya: number;

beforeEach(async () => {
  runtime = await createTestRuntime();
  adminId = await quickAdmin(runtime.ctx);
  anya = await quickLearner(runtime.ctx, 'Аня', '1111');
  borya = await quickLearner(runtime.ctx, 'Боря', '2222');
});

afterEach(async () => {
  await runtime.close();
});

const QUESTION = {
  text: 'Сколько будет 2 + 2?',
  options: [
    { id: 'a', text: '3' },
    { id: 'b', text: '4' },
    { id: 'c', text: '5' },
    { id: 'd', text: '6' },
  ],
  correct: 'b',
} as const satisfies QuestionContent;

/** A published video lesson with a ready video (one file on disk), questions and a transcript. */
function lesson(title: string, assignTo?: number) {
  const { ctx } = runtime;
  const taskId = ctx.tasks.create({ type: 'video_lesson', title }, adminId).id;
  const video = ctx.media.create({ taskId, role: 'video', kind: 'hls' });
  writeFileSync(path.join(ctx.media.dirOf(video), 'master.m3u8'), '#EXTM3U');
  ctx.media.markReady(video.id, { sizeBytes: 7, durationSec: 60 });
  const pictures = ctx.media.create({ taskId, role: 'question_image', kind: 'image' });
  ctx.media.markReady(pictures.id, { sizeBytes: 0 });
  ctx.tasks.update(
    taskId,
    {
      config: {
        mediaId: video.id,
        watchMode: 'percent',
        shutter: { enabled: true, heightPct: 9 },
      },
    },
    adminId,
  );
  for (const key of ['v1', 'v2', 'v3']) {
    ctx.questions.create(taskId, { key, ...QUESTION }, adminId);
  }
  ctx.questions.addTranscript(
    taskId,
    {
      mediaId: video.id,
      lang: 'ru',
      source: 'manual',
      segments: [{ start: 0, end: 1, text: 'Привет' }],
    },
    adminId,
  );
  ctx.tasks.update(taskId, { status: 'published' }, adminId);
  if (assignTo !== undefined) {
    ctx.tasks.assign(taskId, assignTo, adminId);
  }
  return { taskId, videoId: video.id, picturesId: pictures.id };
}

const done = (learnerId: number, taskId: number) =>
  runtime.ctx.progress.close(learnerId, taskId, { withReward: false }, adminId);
const status = (mediaId: number) => runtime.ctx.media.find(mediaId)?.status;
const deps = () => ({ ...runtime.ctx });
const retention = (now: number) => runRetention(deps(), now);

describe('retention', () => {
  it('deletes a video once everyone it is for finished it more than video.retentionDays ago', () => {
    const { taskId, videoId, picturesId } = lesson('Для всех');
    const now = Date.now();
    done(anya, taskId);
    // Borya has not finished yet: the video stays.
    expect(retention(now + 40 * DAY)).toMatchObject({ watched: 0 });
    done(borya, taskId);
    expect(retention(now + 29 * DAY)).toMatchObject({ watched: 0 });
    expect(status(videoId)).toBe('ready');

    const dir = runtime.ctx.media.dirOf(runtime.ctx.media.find(videoId) ?? (null as never));
    expect(retention(now + 31 * DAY)).toMatchObject({ watched: 1 });
    expect(status(videoId)).toBe('deleted');
    expect(existsSync(dir)).toBe(false);
    // Question pictures, questions and the transcript stay.
    expect(status(picturesId)).toBe('ready');
    expect(runtime.ctx.questions.countActive(taskId)).toBe(3);
    expect(runtime.ctx.questions.transcripts(taskId)).toHaveLength(1);
  });

  it('follows assignments, active learners and the setting', async () => {
    const now = Date.now();
    const forAnya = lesson('Только для Ани', anya);
    done(anya, forAnya.taskId);
    const forAll = lesson('Боря ушёл');
    done(anya, forAll.taskId);
    runtime.ctx.settings.set('video.retentionDays', 7, adminId);

    expect(retention(now + 8 * DAY)).toMatchObject({ watched: 1 });
    expect(status(forAnya.videoId)).toBe('deleted');
    // Borya has not finished the lesson for everyone…
    expect(status(forAll.videoId)).toBe('ready');
    // …but once he is deactivated, only active learners count.
    await runtime.ctx.users.update(borya, { active: false }, adminId);
    expect(retention(now + 8 * DAY)).toMatchObject({ watched: 1 });
    expect(status(forAll.videoId)).toBe('deleted');
  });

  it('keeps the video of a lesson someone has to do again after a reset', () => {
    const now = Date.now();
    const { taskId, videoId } = lesson('Сброс');
    done(anya, taskId);
    done(borya, taskId);
    runtime.ctx.progress.reset(borya, { taskId, requestId: 'reset-0000002' }, adminId);
    expect(retention(now + 40 * DAY)).toMatchObject({ watched: 0 });
    expect(status(videoId)).toBe('ready');
  });

  it('deletes videos replaced by a re-import when their time has come', () => {
    const { taskId, videoId } = lesson('Переимпорт');
    const old = runtime.ctx.media.create({ taskId, role: 'video', kind: 'hls' });
    runtime.ctx.media.markReady(old.id, { sizeBytes: 1 });
    const now = Date.now();
    runtime.ctx.media.scheduleDeletion(old.id, now + DAY);
    expect(retention(now)).toMatchObject({ replaced: 0 });
    expect(status(old.id)).toBe('ready');
    expect(retention(now + DAY)).toMatchObject({ replaced: 1 });
    expect(status(old.id)).toBe('deleted');
    expect(status(videoId)).toBe('ready');
  });

  it('once the video is gone, the quiz opens without watching', () => {
    const now = Date.now();
    const { taskId, videoId } = lesson('Без видео', anya);
    done(anya, taskId);
    runtime.ctx.progress.reopen(anya, taskId, adminId); // «Пройти с мамой»
    try {
      runtime.ctx.attempts.start(anya, taskId);
      throw new Error('expected 409');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).code).toBe('watch_required');
    }
    retention(now + 31 * DAY);
    expect(status(videoId)).toBe('deleted');
    expect(runtime.ctx.attempts.start(anya, taskId).created).toBe(true);
  });
});

describe('job runs', () => {
  const runs = () => runtime.ctx.db.select().from(jobRuns).all();

  it('records every run with its counters', () => {
    const outcome = runtime.ctx.scheduler.runNow(RETENTION_JOB);
    expect(outcome.status).toBe('ok');
    expect(runs()).toEqual([
      expect.objectContaining({
        job: RETENTION_JOB,
        status: 'ok',
        result: { replaced: 0, watched: 0, checked: 0 },
        error: null,
      }),
    ]);
    expect(runs()[0]?.finishedAt).not.toBeNull();
  });

  it('never overlaps: a run that has not finished blocks the next one', () => {
    let inner: string | undefined;
    const job: Job = {
      name: 'reentrant',
      intervalMs: 1000,
      run: (now) => {
        inner = runJob(runtime.ctx.db, job, now).status;
        return {};
      },
    };
    expect(runJob(runtime.ctx.db, job, Date.now()).status).toBe('ok');
    expect(inner).toBe('skipped');
    expect(runs().filter((r) => r.job === 'reentrant')).toHaveLength(1);

    // Another process holds the lock (an unfinished row): skipped, unless it is stale.
    const now = Date.now();
    runtime.ctx.db
      .insert(jobRuns)
      .values({ job: RETENTION_JOB, startedAt: now - 1000 })
      .run();
    expect(runJob(runtime.ctx.db, retentionJob(deps()), now).status).toBe('skipped');
    expect(runJob(runtime.ctx.db, retentionJob(deps()), now + STALE_RUN_MS).status).toBe('ok');
    expect(
      runs()
        .filter((r) => r.job === RETENTION_JOB)
        .map((r) => [r.status, r.error]),
    ).toEqual([
      ['failed', 'interrupted'],
      ['ok', null],
    ]);
  });

  it('a failing job is recorded as failed and the next run goes ahead', () => {
    let fail = true;
    const job: Job = {
      name: 'flaky',
      intervalMs: 1000,
      run: () => {
        if (fail) throw new Error('disk is gone');
        return { n: 1 };
      },
    };
    expect(runJob(runtime.ctx.db, job, Date.now()).status).toBe('failed');
    fail = false;
    expect(runJob(runtime.ctx.db, job, Date.now()).status).toBe('ok');
    expect(runs().map((r) => [r.status, r.error])).toEqual([
      ['failed', 'disk is gone'],
      ['ok', null],
    ]);
  });

  it('the scheduler runs each job on its interval until stopped', () => {
    const pending: { fn: () => void; ms: number }[] = [];
    let ran = 0;
    const job: Job = {
      name: 'tick',
      intervalMs: 3_600_000,
      firstDelayMs: 300_000,
      run: () => {
        ran += 1;
        return { ran };
      },
    };
    const scheduler = createScheduler(runtime.ctx.db, [job], {
      timers: {
        setTimeout: (fn, ms) => pending.push({ fn, ms }),
        clearTimeout: () => {
          pending.length = 0;
        },
      },
    });
    scheduler.start();
    expect(pending.map((p) => p.ms)).toEqual([300_000]);
    pending.shift()?.fn();
    expect(ran).toBe(1);
    expect(pending.map((p) => p.ms)).toEqual([3_600_000]);
    pending.shift()?.fn();
    expect(ran).toBe(2);
    scheduler.stop();
    expect(pending).toHaveLength(0);
  });
});
