// FEAT-055: «Что нужно сделать?» — `GET /api/admin/inbox` counts every queue of the parent
// (chores to review, retry requests, wishes and Robux asked for, import revisions, watching to
// confirm) and writes nothing.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AdminInboxDto } from '@questclass/shared/inbox/dto';
import type { QuestionContent } from '@questclass/shared/questions/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { taskRevisions } from '../src/db/schema/taskRevisions';
import { requestKey } from '../src/modules/ledger/service';
import { createTwoLearners, type TwoLearners } from './fixtures/twoLearners';

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

let f: TwoLearners;

beforeEach(async () => {
  f = await createTwoLearners();
});

afterEach(async () => {
  await f.close();
});

async function inbox(): Promise<AdminInboxDto> {
  const res = await f.as('admin').get('/api/admin/inbox');
  expect(res.status).toBe(200);
  return (await res.json()) as AdminInboxDto;
}

function totalChanges(): number {
  const db = f.runtime.ctx.db.$client;
  return (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
}

/** A published video lesson of learner A in the given watch mode. */
function videoLesson(title: string, watchMode: 'percent' | 'manual'): number {
  const { ctx } = f.runtime;
  const admin = f.ids.admin;
  const id = ctx.tasks.create({ type: 'video_lesson', title }, admin).id;
  const media = ctx.media.create({ taskId: id, role: 'video', kind: 'hls' });
  writeFileSync(path.join(ctx.media.dirOf(media), 'master.m3u8'), '#EXTM3U');
  ctx.media.markReady(media.id, { sizeBytes: 7, durationSec: 60 });
  ctx.tasks.update(
    id,
    { config: { mediaId: media.id, watchMode, shutter: { enabled: true, heightPct: 9 } } },
    admin,
  );
  for (const key of ['v1', 'v2', 'v3']) {
    ctx.questions.create(id, { key, ...QUESTION }, admin);
  }
  ctx.tasks.update(id, { status: 'published' }, admin);
  ctx.tasks.assign(id, f.ids.learnerA, admin);
  return id;
}

describe('GET /api/admin/inbox', () => {
  it('is empty on a quiet installation', async () => {
    expect(await inbox()).toEqual({
      choreReviews: 0,
      retryRequests: 0,
      wishRequests: 0,
      robuxRequested: 0,
      importRevisions: 0,
      watchConfirmations: 0,
    });
  });

  it('counts every queue and writes nothing', async () => {
    const { ctx } = f.runtime;
    const admin = f.ids.admin;
    const learner = f.ids.learnerA;

    // A chore reported «Я сделал».
    const chore = ctx.tasks.create({ type: 'chore', title: 'Убрать игрушки' }, admin).id;
    ctx.tasks.update(chore, { status: 'published' }, admin);
    ctx.chores.report(learner, chore);

    // A test failed twice, then a retry asked.
    const quiz = ctx.tasks.create({ type: 'quiz', title: 'Сложение' }, admin).id;
    for (const key of ['q1', 'q2', 'q3']) ctx.questions.create(quiz, { key, ...QUESTION }, admin);
    ctx.tasks.update(quiz, { status: 'published' }, admin);
    ctx.tasks.assign(quiz, learner, admin);
    for (let i = 0; i < 2; i += 1) {
      const attempt = ctx.attempts.start(learner, quiz).attempt;
      for (const q of ctx.attempts.adminGet(attempt.id).questions) {
        ctx.attempts.answer(learner, attempt.id, q.id, { optionId: 'a' });
      }
      ctx.attempts.finish(learner, attempt.id);
    }
    ctx.attempts.requestRetry(learner, quiz);

    // A Robux ticket and a wish bought and asked for.
    ctx.ledger.post({
      learnerId: learner,
      coins: 5000,
      sourceType: 'award',
      idemKey: requestKey('award', learner, 'inbox-coins'),
    });
    const robux = ctx.catalog.create(
      {
        kind: 'ticket',
        title: '300 Robux',
        price: 1,
        imageKey: 'game/wishes.webp',
        rewardType: 'robux',
        rewardAmount: 300,
      },
      admin,
    );
    const wish = ctx.catalog.create(
      { kind: 'ticket', title: 'Кино', price: 1, imageKey: 'game/wishes.webp', rewardType: 'wish' },
      admin,
    );
    for (const [item, requestId] of [
      [robux, 'inbox-buy-robux'],
      [wish, 'inbox-buy-wish1'],
    ] as const) {
      ctx.shop.purchase(learner, { itemId: item.id, version: item.version, requestId });
    }
    for (const group of ctx.wishes.view(learner).groups) {
      ctx.wishes.request(learner, group.groupKey);
    }

    // An import revision of a published lesson.
    const revised = videoLesson('Ревизия', 'percent');
    const outcome = ctx.questions.importVersions(revised, [{ key: 'r1', ...QUESTION }], {
      state: 'pending',
    });
    ctx.db
      .insert(taskRevisions)
      .values({ taskId: revised, questions: { ...outcome, proposals: {} }, createdAt: Date.now() })
      .run();

    // A «подтверждает родитель» lesson opened by the learner; a percent one does not count.
    const manual = videoLesson('Ручной просмотр', 'manual');
    ctx.watch.startSession(learner, manual);
    ctx.watch.startSession(learner, videoLesson('По проценту', 'percent'));

    const before = totalChanges();
    expect(await inbox()).toEqual({
      choreReviews: 1,
      retryRequests: 1,
      wishRequests: 2,
      robuxRequested: 300,
      importRevisions: 1,
      watchConfirmations: 1,
    });
    expect(totalChanges()).toBe(before);

    // Answered queues drop out.
    ctx.watch.confirm(learner, manual, admin);
    const pending = ctx.chores.reviews({ status: 'pending' })[0];
    if (pending) ctx.chores.approve(pending.id, admin);
    ctx.attempts.grantRetry(learner, quiz, admin);
    const after = await inbox();
    expect(after).toMatchObject({ choreReviews: 0, retryRequests: 0, watchConfirmations: 0 });
  });

  it('does not count a switched-off learner’s watching', async () => {
    const { ctx } = f.runtime;
    const manual = videoLesson('Ручной просмотр', 'manual');
    ctx.watch.startSession(f.ids.learnerA, manual);
    expect((await inbox()).watchConfirmations).toBe(1);
    await ctx.users.update(f.ids.learnerA, { active: false }, f.ids.admin);
    expect((await inbox()).watchConfirmations).toBe(0);
  });
});
