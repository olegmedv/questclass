/**
 * Access matrix (CLAUDE.md rule 11): who may call which route.
 *
 * Every item that adds routes adds rows here. Rows for a learner's own data must point the URL
 * at learner A's resource and set `learnerOwned: true`; learner B must then get 404.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QuestionContent } from '@questclass/shared/questions/schema';
import { taskRevisions } from '../src/db/schema/taskRevisions';
import { ROLES } from '../src/http/route';
import { requestKey } from '../src/modules/ledger/service';
import { NOTE_TYPE, READY_NOTE, noteTaskType } from './fixtures/noteTaskType';
import {
  createTwoLearners,
  PERSONAS,
  type Persona,
  type TwoLearners,
} from './fixtures/twoLearners';

type Expectation = Readonly<Record<Persona, number>>;

/** Domain objects the rows address, created once per fixture by `prepare()`. */
interface MatrixData {
  readonly subjectId: number;
  /** A subject nothing refers to (deleted by its row). */
  readonly spareSubjectId: number;
  /** Published and assigned to learner A only. */
  readonly taskA: number;
  /** A draft nothing refers to (deleted by its row). */
  readonly spareTask: number;
  /** A draft assigned to learner B (the assignment is removed by its row). */
  readonly assignedToB: number;
  /** Quizzes assigned to learner A only. */
  readonly quiz: {
    /** Not started yet. */
    readonly fresh: number;
    /** An open attempt without answers, and one of its questions. */
    readonly openAttempt: number;
    readonly openQuestion: number;
    /** An open attempt with every question answered. */
    readonly answeredAttempt: number;
    /** Failed twice: the free retry is used up. */
    readonly failedTask: number;
  };
  /** A ready media of `taskA` (one playlist file on disk). */
  readonly mediaA: number;
  /** Published video lessons assigned to learner A only. */
  readonly video: {
    /** Not opened yet. */
    readonly fresh: number;
    /** Opened by learner A: the session accepts batches. */
    readonly watched: number;
    readonly session: number;
  };
  readonly imports: {
    /** A media waiting for its one declared file. */
    readonly uploading: number;
    /** A picture media whose file is on disk (ready to be completed). */
    readonly uploaded: number;
    /** An import token nobody uses (safe to revoke). */
    readonly spareToken: number;
    /** Pending revisions of published video lessons. */
    readonly toAccept: number;
    readonly toReject: number;
  };
  readonly rewards: {
    /** A seeded reward reason. */
    readonly reasonId: number;
    /** An award of learner A (cancelled by its row). */
    readonly awardA: number;
  };
  /** Published chores assigned to learner A only. */
  readonly chores: {
    /** Not reported yet. */
    readonly fresh: number;
    /** Pending reports of learner A. */
    readonly toApprove: number;
    readonly toReject: number;
  };
  /** A seeded shop item. */
  readonly catalogItem: number;
  /** A picture uploaded by the admin. */
  readonly upload: number;
  /** A ticket both learners can afford (each of them got coins). */
  readonly shopItem: { readonly id: number; readonly version: number };
  /** Learner A's group of two bought wish tickets. */
  readonly wishGroup: string;
}

const prepared = new WeakMap<TwoLearners, MatrixData>();

/** A small still picture of the bundled assets (for the upload rows). */
const SMALL_PICTURE = new URL(
  '../../web/public/assets/game/characters/rebound-boy-flight-poster.webp',
  import.meta.url,
);

const SAMPLE_QUESTION = {
  text: 'Сколько будет 2 + 2?',
  options: [
    { id: 'a', text: '3' },
    { id: 'b', text: '4' },
    { id: 'c', text: '5' },
    { id: 'd', text: '6' },
  ],
  correct: 'b',
} as const satisfies QuestionContent;

function data(f: TwoLearners): MatrixData {
  const found = prepared.get(f);
  if (!found) {
    throw new Error('Fixture was not prepared');
  }
  return found;
}

/** Quizzes assigned to learner A, in the states the attempt rows need. */
function prepareQuizzes(f: TwoLearners): MatrixData['quiz'] {
  const { ctx } = f.runtime;
  const learner = f.ids.learnerA;
  const quiz = (title: string): number => {
    const id = ctx.tasks.create({ type: 'quiz', title }, f.ids.admin).id;
    for (const key of ['m1', 'm2', 'm3']) {
      ctx.questions.create(id, { key, ...SAMPLE_QUESTION }, f.ids.admin);
    }
    ctx.tasks.update(id, { status: 'published' }, f.ids.admin);
    ctx.tasks.assign(id, learner, f.ids.admin);
    return id;
  };
  const answerAll = (attemptId: number, right: boolean): void => {
    for (const q of ctx.attempts.adminGet(attemptId).questions) {
      const optionId = right ? q.correct : q.correct === 'a' ? 'b' : 'a';
      ctx.attempts.answer(learner, attemptId, q.id, { optionId });
    }
  };

  const open = ctx.attempts.start(learner, quiz('Тест: открытая попытка')).attempt;
  const answered = ctx.attempts.start(learner, quiz('Тест: все ответы')).attempt;
  answerAll(answered.id, true);
  const failedTask = quiz('Тест: провален дважды');
  for (let i = 0; i < 2; i += 1) {
    const attempt = ctx.attempts.start(learner, failedTask).attempt;
    answerAll(attempt.id, false);
    ctx.attempts.finish(learner, attempt.id);
  }
  return {
    fresh: quiz('Тест: не начат'),
    openAttempt: open.id,
    openQuestion: open.questions[0]?.id ?? 0,
    answeredAttempt: answered.id,
    failedTask,
  };
}

/** A published video lesson assigned to learner A, with a ready video and a bank. */
function publishedVideo(f: TwoLearners, title: string): number {
  const { ctx } = f.runtime;
  const admin = f.ids.admin;
  const id = ctx.tasks.create({ type: 'video_lesson', title }, admin).id;
  const media = ctx.media.create({ taskId: id, role: 'video', kind: 'hls' });
  writeFileSync(path.join(ctx.media.dirOf(media), 'master.m3u8'), '#EXTM3U');
  ctx.media.markReady(media.id, { sizeBytes: 7, durationSec: 60 });
  const config = {
    mediaId: media.id,
    watchMode: 'percent',
    shutter: { enabled: true, heightPct: 9 },
  };
  ctx.tasks.update(id, { config }, admin);
  for (const key of ['v1', 'v2', 'v3']) {
    ctx.questions.create(id, { key, ...SAMPLE_QUESTION }, admin);
  }
  ctx.tasks.update(id, { status: 'published' }, admin);
  ctx.tasks.assign(id, f.ids.learnerA, admin);
  return id;
}

/** Video lessons for the watching rows. */
function prepareVideos(f: TwoLearners): MatrixData['video'] {
  const watched = publishedVideo(f, 'Видео: открытая сессия');
  return {
    fresh: publishedVideo(f, 'Видео: не открыто'),
    watched,
    session: f.runtime.ctx.watch.startSession(f.ids.learnerA, watched).sessionId,
  };
}

const sha256 = (content: string) => createHash('sha256').update(content).digest('hex');
/** What the PUT row uploads (the matrix sends bodies as JSON). */
const CHUNK = 'chunk';
const CHUNK_BYTES = JSON.stringify(CHUNK);

/** A lesson package of the import tool (one playlist, three questions). */
function lessonManifest(externalId: string): unknown {
  return {
    externalId,
    subjectKey: 'math',
    title: 'Импортированный урок',
    questions: ['i1', 'i2', 'i3'].map((key) => ({ key, ...SAMPLE_QUESTION })),
    media: { kind: 'hls', files: [{ path: 'master.m3u8', size: 7, sha256: sha256('#EXTM3U') }] },
  };
}

/** Media for the upload rows and pending revisions of published video lessons. */
function prepareImports(f: TwoLearners): MatrixData['imports'] {
  const { ctx } = f.runtime;
  const uploading = ctx.media.create({
    taskId: null,
    role: 'video',
    kind: 'hls',
    files: [{ path: 'master.m3u8', sizeBytes: CHUNK_BYTES.length, sha256: sha256(CHUNK_BYTES) }],
  });
  const uploaded = ctx.media.create({
    taskId: null,
    role: 'question_image',
    kind: 'image',
    files: [{ path: 'q1.webp', sizeBytes: 4, sha256: sha256('RIFF') }],
  });
  writeFileSync(path.join(ctx.media.dirOf(uploaded), 'q1.webp'), 'RIFF');
  /** A revision proposing one new question (the video stays). */
  const revision = (title: string): number => {
    const taskId = publishedVideo(f, title);
    const outcome = ctx.questions.importVersions(taskId, [{ key: 'r1', ...SAMPLE_QUESTION }], {
      state: 'pending',
    });
    return ctx.db
      .insert(taskRevisions)
      .values({ taskId, questions: { ...outcome, proposals: {} }, createdAt: Date.now() })
      .returning()
      .get().id;
  };
  return {
    uploading: uploading.id,
    uploaded: uploaded.id,
    spareToken: ctx.imports.createToken('Запасной', f.ids.admin).id,
    toAccept: revision('Видео: ревизия'),
    toReject: revision('Видео: отклонить ревизию'),
  };
}

/** A seeded reason and an award of learner A. */
function prepareRewards(f: TwoLearners): MatrixData['rewards'] {
  const { ctx } = f.runtime;
  const reasonId = ctx.rewards.listReasons()[0]?.id ?? 0;
  const award = ctx.rewards.grant(
    f.ids.learnerA,
    {
      reasonId,
      title: 'Матрица',
      date: '2026-11-14',
      xp: 5,
      coins: 5,
      requestId: 'matrix-prep-0001',
    },
    f.ids.admin,
  ).award;
  return { reasonId, awardA: award.id };
}

/** Chores of learner A: one not reported yet and two pending reports. */
function prepareChores(f: TwoLearners): MatrixData['chores'] {
  const { ctx } = f.runtime;
  const choreOfA = (title: string): number => {
    const id = ctx.tasks.create({ type: 'chore', title }, f.ids.admin).id;
    ctx.tasks.update(id, { status: 'published' }, f.ids.admin);
    ctx.tasks.assign(id, f.ids.learnerA, f.ids.admin);
    return id;
  };
  const reported = (title: string): number =>
    ctx.chores.report(f.ids.learnerA, choreOfA(title)).completion.id;
  return {
    fresh: choreOfA('Дело: не сдано'),
    toApprove: reported('Дело: одобрить'),
    toReject: reported('Дело: отклонить'),
  };
}

/** Coins for both learners and an item they can buy. */
function prepareShop(f: TwoLearners): MatrixData['shopItem'] {
  const { ctx } = f.runtime;
  for (const learner of [f.ids.learnerA, f.ids.learnerB]) {
    ctx.ledger.post({
      learnerId: learner,
      coins: 500,
      sourceType: 'award',
      idemKey: requestKey('award', learner, 'matrix-coins-gift'),
    });
  }
  // A ticket: the catalog rows edit an outfit (its version changes).
  const item = ctx.catalog.items({ kind: 'ticket', activeOnly: true })[0];
  return { id: item?.id ?? 0, version: item?.version ?? 0 };
}

/** A wish ticket of its own, bought twice by learner A (the shop rows buy another one). */
function prepareWishes(f: TwoLearners): string {
  const { ctx } = f.runtime;
  const wish = ctx.catalog.create(
    {
      kind: 'ticket',
      title: 'Матрица: желание',
      price: 1,
      imageKey: 'game/wishes.webp',
      rewardType: 'wish',
    },
    f.ids.admin,
  );
  for (const requestId of ['matrix-wish-0001', 'matrix-wish-0002']) {
    ctx.shop.purchase(f.ids.learnerA, { itemId: wish.id, version: wish.version, requestId });
  }
  const group = ctx.wishes.view(f.ids.learnerA).groups.find((g) => g.rewardType === 'wish');
  return group?.groupKey ?? '';
}

/** Adds the domain data rows need (task types beyond the built-ins come from fixtures). */
function prepare(f: TwoLearners): TwoLearners {
  const { ctx } = f.runtime;
  const admin = f.ids.admin;
  ctx.taskTypes.register(noteTaskType);
  const subjectId = ctx.subjects.findByKey('math')?.id ?? 0;
  const spareSubjectId = ctx.subjects.create({ key: 'spare', name: 'Запасной' }, admin).id;
  const task = (title: string) =>
    ctx.tasks.create({ type: NOTE_TYPE, title, subjectId, config: READY_NOTE }, admin).id;
  const taskA = task('Для Ани');
  ctx.tasks.update(taskA, { status: 'published' }, admin);
  ctx.tasks.assign(taskA, f.ids.learnerA, admin);
  const assignedToB = task('Для Бори');
  ctx.tasks.assign(assignedToB, f.ids.learnerB, admin);
  // Learner B has started the draft assigned to them (the reopening row needs a result).
  ctx.progress.markStarted(f.ids.learnerB, assignedToB);
  for (const key of ['q1', 'q-spare']) {
    ctx.questions.create(taskA, { key, ...SAMPLE_QUESTION }, admin);
  }
  const mediaA = ctx.media.create({ taskId: taskA, role: 'video', kind: 'hls' });
  writeFileSync(path.join(ctx.media.dirOf(mediaA), 'master.m3u8'), '#EXTM3U');
  ctx.media.markReady(mediaA.id, { sizeBytes: 7 });
  prepared.set(f, {
    subjectId,
    spareSubjectId,
    taskA,
    spareTask: task('Лишнее'),
    assignedToB,
    quiz: prepareQuizzes(f),
    mediaA: mediaA.id,
    video: prepareVideos(f),
    imports: prepareImports(f),
    rewards: prepareRewards(f),
    chores: prepareChores(f),
    catalogItem: ctx.catalog.items({ kind: 'outfit', activeOnly: true })[0]?.id ?? 0,
    upload: ctx.uploads.create(readFileSync(SMALL_PICTURE), admin).id,
    shopItem: prepareShop(f),
    wishGroup: prepareWishes(f),
  });
  return f;
}

interface MatrixRow {
  /** `METHOD /path` exactly as declared with route(). */
  readonly route: string;
  /** Concrete URL (default: the declared path). */
  readonly url?: (f: TwoLearners) => string;
  readonly body?: (f: TwoLearners, persona: Persona) => unknown;
  /** The request changes state other rows rely on: run it on a fixture of its own. */
  readonly fresh?: boolean;
  /** The URL addresses learner A's data: learner B must get 404. */
  readonly learnerOwned?: boolean;
  readonly expect: Expectation;
}

const everyone = (status: number): Expectation => ({
  anon: status,
  import: status,
  learnerA: status,
  learnerB: status,
  admin: status,
});
// The import token is a valid credential of role `import`: any other route answers it 403.
const adminOnly = (ok: number): Expectation => ({
  anon: 401,
  import: 403,
  learnerA: 403,
  learnerB: 403,
  admin: ok,
});
/** Routes about the caller's own learner data (`/api/me/...`). */
const learnerOnly = (ok: number): Expectation => ({
  anon: 401,
  import: 403,
  learnerA: ok,
  learnerB: ok,
  admin: 403,
});
/** A learner-only route addressing learner A's data: learner B must not learn it exists. */
const ownedByA = (ok: number): Expectation => ({
  anon: 401,
  import: 403,
  learnerA: ok,
  learnerB: 404,
  admin: 403,
});
const signedIn = (ok: number): Expectation => ({
  anon: 401,
  import: 403,
  learnerA: ok,
  learnerB: ok,
  admin: ok,
});

/** lesson-prep with its import token: `/api/import/*` only. */
const importOnly = (ok: number): Expectation => ({
  anon: 401,
  import: ok,
  learnerA: 403,
  learnerB: 403,
  admin: 403,
});

const MATRIX: readonly MatrixRow[] = [
  // health
  { route: 'GET /api/health', expect: everyone(200) },

  // setup: an admin already exists, so it is closed for everybody
  { route: 'GET /api/setup', expect: everyone(200) },
  {
    route: 'POST /api/setup',
    body: () => ({ token: 'wrong', login: 'intruder', password: 'long-enough-pass' }),
    expect: everyone(409),
  },

  // auth
  {
    route: 'POST /api/auth/login',
    body: (_f, persona) => ({ login: `nobody-${persona}`, password: 'wrong-password' }),
    expect: everyone(401),
  },
  {
    route: 'POST /api/auth/learner-login',
    body: (f) => ({ userId: f.ids.learnerA, pin: '0000' }),
    // Only browsers on the trusted tablet may even try a PIN.
    expect: { anon: 403, import: 403, learnerA: 401, learnerB: 401, admin: 403 },
  },
  { route: 'POST /api/auth/logout', fresh: true, expect: signedIn(204) },
  { route: 'GET /api/auth/me', expect: signedIn(200) },
  {
    route: 'GET /api/auth/profiles',
    expect: { anon: 403, import: 403, learnerA: 200, learnerB: 200, admin: 403 },
  },
  { route: 'GET /api/auth/devices', expect: adminOnly(200) },
  {
    route: 'POST /api/auth/devices',
    body: () => ({ name: 'Ещё планшет' }),
    expect: adminOnly(201),
  },
  {
    route: 'DELETE /api/auth/devices/:id',
    url: (f) => `/api/auth/devices/${f.ids.spareDevice}`,
    expect: adminOnly(200),
  },

  // users
  { route: 'GET /api/admin/users', expect: adminOnly(200) },
  {
    route: 'POST /api/admin/users',
    body: () => ({ role: 'learner', name: 'Новичок', pin: '4321' }),
    expect: adminOnly(201),
  },
  {
    route: 'GET /api/admin/users/:id',
    url: (f) => `/api/admin/users/${f.ids.learnerA}`,
    expect: adminOnly(200),
  },
  {
    route: 'PATCH /api/admin/users/:id',
    url: (f) => `/api/admin/users/${f.ids.learnerA}`,
    body: () => ({ name: 'Аня' }),
    expect: adminOnly(200),
  },

  // audit
  { route: 'GET /api/admin/audit', expect: adminOnly(200) },

  // settings and secrets
  { route: 'GET /api/admin/settings', expect: adminOnly(200) },
  {
    route: 'PUT /api/admin/settings',
    body: () => ({ 'session.learnerDays': 180 }),
    expect: adminOnly(200),
  },
  { route: 'GET /api/admin/secrets', expect: adminOnly(200) },
  // The core registry has no secrets yet, so even the admin gets 404 for this key.
  {
    route: 'PUT /api/admin/secrets/:key',
    url: () => '/api/admin/secrets/not.registered',
    body: () => ({ value: 'x' }),
    expect: adminOnly(404),
  },
  {
    route: 'DELETE /api/admin/secrets/:key',
    url: () => '/api/admin/secrets/not.registered',
    expect: adminOnly(404),
  },

  // ledger
  { route: 'GET /api/me/wallet', expect: learnerOnly(200) },
  { route: 'GET /api/me/ledger', expect: learnerOnly(200) },
  {
    route: 'GET /api/admin/learners/:id/ledger',
    url: (f) => `/api/admin/learners/${f.ids.learnerA}/ledger`,
    expect: adminOnly(200),
  },

  // subjects
  { route: 'GET /api/subjects', expect: signedIn(200) },
  { route: 'GET /api/admin/subjects', expect: adminOnly(200) },
  {
    route: 'POST /api/admin/subjects',
    body: () => ({ name: 'Музыка' }),
    expect: adminOnly(201),
  },
  {
    route: 'PATCH /api/admin/subjects/:id',
    url: (f) => `/api/admin/subjects/${data(f).subjectId}`,
    body: () => ({ sort: 30 }),
    expect: adminOnly(200),
  },
  {
    route: 'DELETE /api/admin/subjects/:id',
    url: (f) => `/api/admin/subjects/${data(f).spareSubjectId}`,
    expect: adminOnly(204),
  },

  // tasks
  { route: 'GET /api/tasks', expect: learnerOnly(200) },
  {
    route: 'GET /api/tasks/:id',
    url: (f) => `/api/tasks/${data(f).taskA}`,
    learnerOwned: true,
    expect: ownedByA(200),
  },
  { route: 'GET /api/admin/tasks', expect: adminOnly(200) },
  {
    route: 'POST /api/admin/tasks',
    body: () => ({ type: NOTE_TYPE, title: 'Новое', config: READY_NOTE }),
    expect: adminOnly(201),
  },
  {
    route: 'GET /api/admin/tasks/:id',
    url: (f) => `/api/admin/tasks/${data(f).taskA}`,
    expect: adminOnly(200),
  },
  {
    route: 'PATCH /api/admin/tasks/:id',
    url: (f) => `/api/admin/tasks/${data(f).taskA}`,
    body: () => ({ title: 'Для Ани' }),
    expect: adminOnly(200),
  },
  {
    route: 'DELETE /api/admin/tasks/:id',
    url: (f) => `/api/admin/tasks/${data(f).spareTask}`,
    expect: adminOnly(204),
  },
  {
    route: 'POST /api/admin/tasks/:id/assignments',
    url: (f) => `/api/admin/tasks/${data(f).taskA}/assignments`,
    body: (f) => ({ learnerId: f.ids.learnerA }),
    // Already assigned: the repeat is answered with the unchanged task.
    expect: adminOnly(200),
  },
  {
    route: 'DELETE /api/admin/tasks/:id/assignments/:learnerId',
    url: (f) => `/api/admin/tasks/${data(f).assignedToB}/assignments/${f.ids.learnerB}`,
    expect: adminOnly(204),
  },

  // questions and transcripts
  {
    route: 'GET /api/admin/tasks/:taskId/questions',
    url: (f) => `/api/admin/tasks/${data(f).taskA}/questions`,
    expect: adminOnly(200),
  },
  {
    route: 'POST /api/admin/tasks/:taskId/questions',
    url: (f) => `/api/admin/tasks/${data(f).taskA}/questions`,
    body: () => SAMPLE_QUESTION,
    expect: adminOnly(201),
  },
  {
    route: 'GET /api/admin/tasks/:taskId/questions/:key/versions',
    url: (f) => `/api/admin/tasks/${data(f).taskA}/questions/q1/versions`,
    expect: adminOnly(200),
  },
  {
    route: 'PUT /api/admin/tasks/:taskId/questions/:key',
    url: (f) => `/api/admin/tasks/${data(f).taskA}/questions/q1`,
    body: () => SAMPLE_QUESTION,
    expect: adminOnly(200),
  },
  {
    route: 'DELETE /api/admin/tasks/:taskId/questions/:key',
    url: (f) => `/api/admin/tasks/${data(f).taskA}/questions/q-spare`,
    expect: adminOnly(204),
  },
  {
    route: 'POST /api/admin/tasks/:taskId/question-imports',
    url: (f) => `/api/admin/tasks/${data(f).taskA}/question-imports`,
    body: () => ({
      content: JSON.stringify([SAMPLE_QUESTION, SAMPLE_QUESTION, SAMPLE_QUESTION]),
      append: true, // keep q1 and q-spare for the other rows
    }),
    expect: adminOnly(201),
  },
  {
    route: 'GET /api/admin/tasks/:taskId/transcripts',
    url: (f) => `/api/admin/tasks/${data(f).taskA}/transcripts`,
    expect: adminOnly(200),
  },
  {
    route: 'POST /api/admin/tasks/:taskId/transcripts',
    url: (f) => `/api/admin/tasks/${data(f).taskA}/transcripts`,
    body: () => ({
      lang: 'ru',
      source: 'manual',
      segments: [{ start: 0, end: 1, text: 'Привет' }],
    }),
    expect: adminOnly(201),
  },

  // progress and manual control
  { route: 'GET /api/me/progress', expect: learnerOnly(200) },
  {
    route: 'GET /api/admin/learners/:id/progress',
    url: (f) => `/api/admin/learners/${f.ids.learnerA}/progress`,
    expect: adminOnly(200),
  },
  {
    route: 'POST /api/admin/learners/:id/progress/:taskId/closure',
    url: (f) => `/api/admin/learners/${f.ids.learnerA}/progress/${data(f).taskA}/closure`,
    body: () => ({ withReward: false }),
    expect: adminOnly(201),
  },
  {
    route: 'POST /api/admin/learners/:id/progress/:taskId/reopening',
    url: (f) => `/api/admin/learners/${f.ids.learnerB}/progress/${data(f).assignedToB}/reopening`,
    expect: adminOnly(201),
  },
  {
    route: 'POST /api/admin/learners/:id/progress-resets',
    url: (f) => `/api/admin/learners/${f.ids.learnerB}/progress-resets`,
    body: () => ({ requestId: 'matrix-reset-0001' }),
    expect: adminOnly(201),
  },
  {
    route: 'POST /api/admin/learners/:id/coins-resets',
    url: (f) => `/api/admin/learners/${f.ids.learnerA}/coins-resets`,
    body: () => ({ requestId: 'matrix-coins-0001' }),
    expect: adminOnly(201),
  },

  // streak
  { route: 'GET /api/me/streak', expect: learnerOnly(200) },
  {
    route: 'GET /api/admin/learners/:id/streak',
    url: (f) => `/api/admin/learners/${f.ids.learnerA}/streak`,
    expect: adminOnly(200),
  },

  // attempts and retries
  {
    route: 'POST /api/tasks/:taskId/attempts',
    url: (f) => `/api/tasks/${data(f).quiz.fresh}/attempts`,
    learnerOwned: true,
    expect: ownedByA(201),
  },
  {
    route: 'GET /api/attempts/:id',
    url: (f) => `/api/attempts/${data(f).quiz.openAttempt}`,
    learnerOwned: true,
    expect: ownedByA(200),
  },
  {
    route: 'PUT /api/attempts/:id/answers/:questionId',
    url: (f) => `/api/attempts/${data(f).quiz.openAttempt}/answers/${data(f).quiz.openQuestion}`,
    body: () => ({ optionId: 'a' }),
    learnerOwned: true,
    expect: ownedByA(200),
  },
  {
    route: 'POST /api/attempts/:id/completion',
    url: (f) => `/api/attempts/${data(f).quiz.answeredAttempt}/completion`,
    learnerOwned: true,
    expect: ownedByA(200),
  },
  {
    route: 'POST /api/tasks/:taskId/retry-requests',
    url: (f) => `/api/tasks/${data(f).quiz.failedTask}/retry-requests`,
    learnerOwned: true,
    expect: ownedByA(201),
  },
  {
    route: 'GET /api/admin/attempts/:id',
    url: (f) => `/api/admin/attempts/${data(f).quiz.openAttempt}`,
    expect: adminOnly(200),
  },
  {
    route: 'GET /api/admin/learners/:id/attempts',
    url: (f) => `/api/admin/learners/${f.ids.learnerA}/attempts`,
    expect: adminOnly(200),
  },
  { route: 'GET /api/admin/retry-requests', expect: adminOnly(200) },
  {
    route: 'POST /api/admin/retry-grants',
    body: (f) => ({ learnerId: f.ids.learnerA, taskId: data(f).quiz.failedTask }),
    expect: adminOnly(201),
  },

  // media
  {
    route: 'GET /api/media/:id/*',
    url: (f) => `/api/media/${data(f).mediaA}/master.m3u8`,
    learnerOwned: true,
    expect: { anon: 401, import: 403, learnerA: 200, learnerB: 404, admin: 200 },
  },

  // video lessons: watching
  {
    route: 'POST /api/watch/:taskId/sessions',
    url: (f) => `/api/watch/${data(f).video.fresh}/sessions`,
    learnerOwned: true,
    expect: ownedByA(201),
  },
  {
    route: 'POST /api/watch/:taskId/sessions/:id/intervals',
    url: (f) => `/api/watch/${data(f).video.watched}/sessions/${data(f).video.session}/intervals`,
    body: () => ({ intervals: [], position: 1 }),
    learnerOwned: true,
    expect: ownedByA(200),
  },
  {
    route: 'POST /api/admin/learners/:id/watch/:taskId/confirmation',
    url: (f) => `/api/admin/learners/${f.ids.learnerA}/watch/${data(f).video.fresh}/confirmation`,
    expect: adminOnly(201),
  },

  // import tokens, lesson packages, uploads
  { route: 'GET /api/admin/import-tokens', expect: adminOnly(200) },
  {
    route: 'POST /api/admin/import-tokens',
    body: () => ({ name: 'Ноутбук' }),
    expect: adminOnly(201),
  },
  {
    route: 'DELETE /api/admin/import-tokens/:id',
    url: (f) => `/api/admin/import-tokens/${data(f).imports.spareToken}`,
    expect: adminOnly(204),
  },
  {
    route: 'POST /api/import/lessons',
    body: () => lessonManifest('matrix-lesson-1'),
    expect: importOnly(201),
  },
  {
    route: 'GET /api/import/media/:id',
    url: (f) => `/api/import/media/${data(f).imports.uploading}`,
    expect: importOnly(200),
  },
  {
    route: 'PUT /api/import/media/:id/files/*',
    url: (f) => `/api/import/media/${data(f).imports.uploading}/files/master.m3u8?offset=0`,
    body: () => CHUNK,
    expect: importOnly(200),
  },
  {
    route: 'POST /api/import/media/:id/completion',
    url: (f) => `/api/import/media/${data(f).imports.uploaded}/completion`,
    body: () => ({}),
    expect: importOnly(200),
  },

  // revisions of published tasks
  { route: 'GET /api/admin/task-revisions', expect: adminOnly(200) },
  {
    route: 'GET /api/admin/task-revisions/:id',
    url: (f) => `/api/admin/task-revisions/${data(f).imports.toAccept}`,
    expect: adminOnly(200),
  },
  {
    route: 'POST /api/admin/task-revisions/:id/acceptance',
    url: (f) => `/api/admin/task-revisions/${data(f).imports.toAccept}/acceptance`,
    expect: adminOnly(200),
  },
  {
    route: 'POST /api/admin/task-revisions/:id/rejection',
    url: (f) => `/api/admin/task-revisions/${data(f).imports.toReject}/rejection`,
    expect: adminOnly(200),
  },

  // reward reasons and manual awards
  { route: 'GET /api/admin/reward-reasons', expect: adminOnly(200) },
  {
    route: 'POST /api/admin/reward-reasons',
    body: () => ({ name: 'Матричная причина', xp: 5, coins: 5 }),
    expect: adminOnly(201),
  },
  {
    route: 'PATCH /api/admin/reward-reasons/:id',
    url: (f) => `/api/admin/reward-reasons/${data(f).rewards.reasonId}`,
    body: () => ({ xp: 60 }),
    expect: adminOnly(200),
  },
  {
    route: 'GET /api/admin/learners/:id/awards',
    url: (f) => `/api/admin/learners/${f.ids.learnerA}/awards`,
    expect: adminOnly(200),
  },
  {
    route: 'POST /api/admin/learners/:id/awards',
    url: (f) => `/api/admin/learners/${f.ids.learnerA}/awards`,
    body: () => ({
      reasonId: 'custom',
      title: 'Матрица: начисление',
      date: '2026-11-14',
      xp: 1,
      coins: 1,
      requestId: 'matrix-award-0001',
    }),
    expect: adminOnly(201),
  },
  {
    route: 'POST /api/admin/learners/:id/awards/:awardId/cancellation',
    url: (f) =>
      `/api/admin/learners/${f.ids.learnerA}/awards/${data(f).rewards.awardA}/cancellation`,
    expect: adminOnly(201),
  },
  { route: 'GET /api/me/awards', expect: learnerOnly(200) },

  // chores
  {
    route: 'GET /api/tasks/:taskId/chore-completions',
    url: (f) => `/api/tasks/${data(f).chores.fresh}/chore-completions`,
    learnerOwned: true,
    expect: ownedByA(200),
  },
  {
    route: 'POST /api/tasks/:taskId/chore-completions',
    url: (f) => `/api/tasks/${data(f).chores.fresh}/chore-completions`,
    learnerOwned: true,
    expect: ownedByA(201),
  },
  { route: 'GET /api/admin/chores/reviews', expect: adminOnly(200) },
  {
    route: 'POST /api/admin/chores/reviews/:id/approval',
    url: (f) => `/api/admin/chores/reviews/${data(f).chores.toApprove}/approval`,
    expect: adminOnly(201),
  },
  {
    route: 'POST /api/admin/chores/reviews/:id/rejection',
    url: (f) => `/api/admin/chores/reviews/${data(f).chores.toReject}/rejection`,
    body: () => ({ comment: 'Ещё не готово' }),
    expect: adminOnly(201),
  },

  // catalog
  { route: 'GET /api/admin/catalog/library', expect: adminOnly(200) },
  { route: 'GET /api/admin/catalog/items', expect: adminOnly(200) },
  {
    route: 'POST /api/admin/catalog/items',
    body: () => ({ kind: 'outfit', title: 'Матрица', price: 40, characterKey: 'space' }),
    expect: adminOnly(201),
  },
  {
    route: 'GET /api/admin/catalog/items/:id',
    url: (f) => `/api/admin/catalog/items/${data(f).catalogItem}`,
    expect: adminOnly(200),
  },
  {
    route: 'PATCH /api/admin/catalog/items/:id',
    url: (f) => `/api/admin/catalog/items/${data(f).catalogItem}`,
    body: () => ({ price: 45 }),
    expect: adminOnly(200),
  },

  // uploads: a JSON body is no picture, so even the admin gets 415 here
  { route: 'POST /api/admin/uploads', body: () => 'not a picture', expect: adminOnly(415) },
  { route: 'GET /api/admin/uploads', expect: adminOnly(200) },
  {
    route: 'GET /api/uploads/:id',
    url: (f) => `/api/uploads/${data(f).upload}`,
    expect: signedIn(200),
  },

  // shop: each learner buys their own copy under their own key
  { route: 'GET /api/shop', expect: learnerOnly(200) },
  {
    route: 'POST /api/shop/purchases',
    body: (f) => ({
      itemId: data(f).shopItem.id,
      version: data(f).shopItem.version,
      requestId: 'matrix-purchase-1',
    }),
    expect: learnerOnly(201),
  },

  // wishes and Robux
  { route: 'GET /api/me/wishes', expect: learnerOnly(200) },
  {
    route: 'POST /api/me/wish-requests',
    body: (f) => ({ groupKey: data(f).wishGroup }),
    learnerOwned: true,
    expect: ownedByA(201),
  },
  { route: 'GET /api/admin/wishes', expect: adminOnly(200) },
  {
    route: 'POST /api/admin/learners/:id/fulfillments',
    url: (f) => `/api/admin/learners/${f.ids.learnerA}/fulfillments`,
    body: (f) => ({
      groupKey: data(f).wishGroup,
      amount: 1,
      expectedRemaining: 2,
      requestId: 'matrix-fulfil-0001',
    }),
    expect: adminOnly(201),
  },
];

function splitRoute(key: string): { method: string; path: string } {
  const [method = '', path = ''] = key.split(' ');
  return { method, path };
}

describe('access matrix', () => {
  let shared: TwoLearners;

  beforeAll(async () => {
    shared = prepare(await createTwoLearners());
  }, 30_000);

  afterAll(async () => {
    await shared.close();
  });

  it('every registered route declares at least one known role', () => {
    expect(shared.routes.length).toBeGreaterThan(0);
    for (const def of shared.routes) {
      expect(def.roles.length, `${def.method} ${def.path}`).toBeGreaterThan(0);
      expect(def.roles.every((role) => (ROLES as readonly string[]).includes(role))).toBe(true);
    }
  });

  it('nothing is mounted around the route() registry', () => {
    const declared = new Set(shared.routes.map((r) => `${r.method} ${r.path}`));
    const mounted = new Set(
      shared.app.routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path}`),
    );
    expect([...mounted].sort()).toEqual([...declared].sort());
  });

  it('has exactly one row per registered route', () => {
    const declared = shared.routes.map((r) => `${r.method} ${r.path}`).sort();
    const covered = MATRIX.map((row) => row.route).sort();
    expect(covered).toEqual(declared);
  });

  it('rows for a learner’s own data expect 404 for the other learner', () => {
    for (const row of MATRIX.filter((r) => r.learnerOwned)) {
      expect(row.expect.learnerB, row.route).toBe(404);
    }
  });

  it('the fixture signs each learner in as themselves', async () => {
    const meA = (await (await shared.as('learnerA').get('/api/auth/me')).json()) as { id: number };
    const meB = (await (await shared.as('learnerB').get('/api/auth/me')).json()) as { id: number };
    expect(meA.id).toBe(shared.ids.learnerA);
    expect(meB.id).toBe(shared.ids.learnerB);
  });

  for (const row of MATRIX) {
    it(
      row.route,
      async () => {
        const fixture = row.fresh ? prepare(await createTwoLearners()) : shared;
        try {
          const { method, path } = splitRoute(row.route);
          const url = row.url?.(fixture) ?? path;
          const actual: Partial<Record<Persona, number>> = {};
          for (const persona of PERSONAS) {
            const body = row.body?.(fixture, persona);
            const res = await fixture
              .as(persona)
              .request(method, url, body === undefined ? {} : { json: body });
            actual[persona] = res.status;
          }
          expect(actual).toEqual(row.expect);
        } finally {
          if (row.fresh) {
            await fixture.close();
          }
        }
      },
      30_000,
    );
  }
});
