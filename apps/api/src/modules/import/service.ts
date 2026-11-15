import {
  DISK_RESERVE_BYTES,
  type ImportLessonResultDto,
  type ImportMediaDto,
  type ImportOutcomeKind,
  type ImportTokenDto,
  type IssuedImportTokenDto,
  type LessonManifest,
  type ManifestFile,
  type ManifestQuestion,
  type RevisionDetailDto,
  type RevisionQuestionDiffDto,
  type RevisionStatus,
  type RevisionSummaryDto,
  type UploadResultDto,
} from '@questclass/shared/import/manifest';
import type { QuestionContent } from '@questclass/shared/questions/schema';
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { mkdir } from 'node:fs/promises';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { importTokens, type ImportTokenRow } from '../../db/schema/importTokens';
import { media, type MediaKind, type MediaRole, type MediaRow } from '../../db/schema/media';
import { questions, type QuestionRow } from '../../db/schema/questions';
import {
  taskRevisions,
  type RevisionQuestionOutcome,
  type TaskRevisionRow,
} from '../../db/schema/taskRevisions';
import { tasks, type TaskRow } from '../../db/schema/tasks';
import { transcripts } from '../../db/schema/transcripts';
import { HttpError, badRequest, conflict, notFound } from '../../http/errors';
import type { TaskRecord, TaskTypePlugin, TaskTypeRegistry } from '../../task-types/registry';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';
import { randomToken, sha256Hex } from '../auth/crypto';
import type { MediaService } from '../media/service';
import type { QuestionsService } from '../questions/service';
import type { SettingsService } from '../settings/service';
import type { SubjectsService } from '../subjects/service';
import type { TasksService } from '../tasks/service';
import {
  createUploader,
  statfsFreeBytes,
  type CompletionInput,
  type FreeSpaceProbe,
} from './upload';

export const importTokenCreated = defineAuditAction(
  'import_token.created',
  z.object({ name: z.string() }),
);
export const importTokenRevoked = defineAuditAction(
  'import_token.revoked',
  z.object({ name: z.string() }),
);
export const lessonImported = defineAuditAction(
  'import.lesson',
  z.object({
    externalId: z.string(),
    outcome: z.string(),
    tokenId: z.number(),
    revisionId: z.number().nullable(),
  }),
);
export const revisionAccepted = defineAuditAction(
  'task_revision.accepted',
  z.object({ revisionId: z.number(), mediaId: z.number().nullable() }),
);
export const revisionRejected = defineAuditAction(
  'task_revision.rejected',
  z.object({ revisionId: z.number() }),
);

/** Prefix of issued tokens (recognisable in logs and config files). */
export const IMPORT_TOKEN_PREFIX = 'qci_';

export interface ImportService {
  listTokens(): ImportTokenDto[];
  /** The token is returned once; only its hash is kept. */
  createToken(name: string, actorId: number | null): IssuedImportTokenDto;
  /** Revoked tokens stay as history. */
  revokeToken(id: number, actorId: number | null): void;
  /** Id of an active token, or null. Read-only. */
  resolveToken(token: string): number | null;

  /** Upserts a lesson by `externalId`: a draft, a draft updated in place, or a revision. */
  importLesson(manifest: LessonManifest, tokenId: number): Promise<ImportLessonResultDto>;
  mediaStatus(mediaId: number): Promise<ImportMediaDto>;
  putChunk(
    mediaId: number,
    rawPath: string,
    offset: number,
    body: ReadableStream<Uint8Array> | null,
  ): Promise<UploadResultDto>;
  completeMedia(mediaId: number, input: CompletionInput): Promise<ImportMediaDto>;

  listRevisions(status?: RevisionStatus): RevisionSummaryDto[];
  getRevision(id: number): RevisionDetailDto;
  /** Atomically: pending versions → active, removed imports archived, the new media in config. */
  acceptRevision(id: number, actorId: number | null): RevisionSummaryDto;
  /** Pending versions are archived and the proposed media deleted. */
  rejectRevision(id: number, actorId: number | null): RevisionSummaryDto;
}

export interface ImportDeps {
  readonly audit: AuditService;
  readonly settings: SettingsService;
  readonly tasks: TasksService;
  readonly subjects: SubjectsService;
  readonly questions: QuestionsService;
  readonly media: MediaService;
  readonly taskTypes: TaskTypeRegistry;
  /** Free space probe (tests simulate a full disk). */
  readonly freeBytes?: FreeSpaceProbe;
  readonly clock?: () => number;
}

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

const tokenDto = (row: ImportTokenRow): ImportTokenDto => ({
  id: row.id,
  name: row.name,
  createdAt: new Date(row.createdAt).toISOString(),
  revokedAt: iso(row.revokedAt),
});

/** Equal declared file sets (path, size, sha256). */
function sameFiles(
  a: readonly { path: string; sizeBytes: number; sha256: string }[],
  b: readonly ManifestFile[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const key = (path: string, size: number, sha: string) => `${path}\u0000${size}\u0000${sha}`;
  const left = new Set(a.map((f) => key(f.path, f.sizeBytes, f.sha256)));
  return b.every((f) => left.has(key(f.path, f.size, f.sha256)));
}

const contentOf = (row: QuestionRow): QuestionContent & { version: number } => ({
  version: row.version,
  text: row.text,
  options: row.options,
  correct: row.correct,
  image: row.imageRef,
  evidence: row.evidence,
});

const cannotPublish = (errors: string[]) =>
  new HttpError(422, 'cannot_publish', 'После ревизии задание нельзя оставить опубликованным', {
    errors,
  });

export function createImportService(db: Db, deps: ImportDeps): ImportService {
  const { audit, settings, tasks: tasksService, subjects, questions: questionsService } = deps;
  const mediaService = deps.media;
  const now = deps.clock ?? (() => Date.now());
  const freeBytes = deps.freeBytes ?? statfsFreeBytes;
  const uploader = createUploader({ media: mediaService, freeBytes });

  // ---- helpers -------------------------------------------------------------------------------

  const importablePlugin = (type: string): TaskTypePlugin => {
    const plugin = deps.taskTypes.get(type);
    if (!plugin?.fromImport) {
      throw badRequest('type_not_importable', `Тип задания ${type} не поддерживает импорт`);
    }
    return plugin;
  };

  const requireRecord = (taskId: number): TaskRecord => {
    const record = tasksService.record(taskId);
    if (!record) {
      throw conflict('invalid_task', 'Задание нельзя обновить: неизвестный тип или настройки');
    }
    return record;
  };

  /** A media of the task with exactly these files that can still be used. */
  const reusable = (
    taskId: number,
    role: MediaRole,
    kind: MediaKind,
    files: readonly ManifestFile[],
  ): MediaRow | undefined =>
    db
      .select()
      .from(media)
      .where(
        and(
          eq(media.taskId, taskId),
          eq(media.role, role),
          eq(media.kind, kind),
          ne(media.status, 'deleted'),
          isNull(media.deleteAfter),
        ),
      )
      .orderBy(desc(media.id))
      .all()
      .find((row) => sameFiles(mediaService.files(row.id), files));

  const createMedia = (
    taskId: number,
    role: MediaRole,
    kind: MediaKind,
    files: readonly ManifestFile[],
  ): MediaRow =>
    mediaService.create({
      taskId,
      role,
      kind,
      files: files.map((f) => ({ path: f.path, sizeBytes: f.size, sha256: f.sha256 })),
    });

  /** Question pictures point into the images media: `media/<id>/<path>`. */
  const withImageRefs = (
    list: readonly ManifestQuestion[],
    imagesId: number | null,
  ): ManifestQuestion[] => {
    const ref = (value: string | null | undefined) =>
      value && imagesId !== null ? `media/${imagesId}/${value}` : null;
    return list.map((q) => ({
      ...q,
      image: ref(q.image),
      options: q.options.map((o) => ({ ...o, image: ref(o.image) })),
    }));
  };

  /** Adds the transcript unless the task already has the same one for this video. */
  const addTranscript = (taskId: number, mediaId: number, manifest: LessonManifest): void => {
    const input = manifest.transcript;
    if (!input) {
      return;
    }
    const latest = db
      .select()
      .from(transcripts)
      .where(and(eq(transcripts.taskId, taskId), eq(transcripts.mediaId, mediaId)))
      .orderBy(desc(transcripts.id))
      .get();
    const same =
      latest?.lang === input.lang &&
      latest.source === input.source &&
      JSON.stringify(latest.segments) === JSON.stringify(input.segments);
    if (!same) {
      questionsService.addTranscript(taskId, { ...input, mediaId }, null);
    }
  };

  /** Older videos of a draft are replaced: retention (FEAT-022) deletes them. */
  const retireOtherVideos = (taskId: number, keep: number): void => {
    const others = db
      .select()
      .from(media)
      .where(
        and(
          eq(media.taskId, taskId),
          eq(media.role, 'video'),
          ne(media.id, keep),
          ne(media.status, 'deleted'),
          isNull(media.deleteAfter),
        ),
      )
      .all();
    for (const row of others) {
      mediaService.scheduleDeletion(row.id, now());
    }
  };

  const livePending = (taskId: number): QuestionRow[] =>
    db
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.taskId, taskId),
          isNull(questions.archivedAt),
          eq(questions.state, 'pending'),
        ),
      )
      .all();

  const liveOfKey = (taskId: number, key: string): QuestionRow[] =>
    db
      .select()
      .from(questions)
      .where(
        and(eq(questions.taskId, taskId), eq(questions.key, key), isNull(questions.archivedAt)),
      )
      .orderBy(asc(questions.version))
      .all();

  /** Archived because the import replaced it, not by an admin (`archived_by` stays null). */
  const archiveQuestion = (id: number, at: number): void => {
    db.update(questions).set({ archivedAt: at }).where(eq(questions.id, id)).run();
  };

  const findRevision = (id: number): TaskRevisionRow => {
    const row = db.select().from(taskRevisions).where(eq(taskRevisions.id, id)).get();
    if (!row) {
      throw notFound('Ревизия не найдена');
    }
    return row;
  };

  const pendingRevision = (taskId: number): TaskRevisionRow | undefined =>
    db
      .select()
      .from(taskRevisions)
      .where(and(eq(taskRevisions.taskId, taskId), eq(taskRevisions.status, 'pending')))
      .get();

  const proposedMedia = (row: TaskRevisionRow): number[] =>
    [row.mediaId, row.imagesMediaId].filter((id): id is number => id !== null);

  const close = (
    row: TaskRevisionRow,
    status: RevisionStatus,
    actorId: number | null,
  ): TaskRevisionRow =>
    db
      .update(taskRevisions)
      .set({ status, decidedAt: now(), decidedBy: actorId })
      .where(eq(taskRevisions.id, row.id))
      .returning()
      .get() ?? row;

  const summary = (row: TaskRevisionRow, title?: string): RevisionSummaryDto => {
    const ids = proposedMedia(row);
    const ready =
      ids.length === 0 ||
      db
        .select({ status: media.status })
        .from(media)
        .where(inArray(media.id, ids))
        .all()
        .every((m) => m.status === 'ready');
    const { proposals: _proposals, ...outcome } = row.questions;
    return {
      id: row.id,
      taskId: row.taskId,
      taskTitle: title ?? tasksService.get(row.taskId).title,
      status: row.status,
      mediaId: row.mediaId,
      imagesMediaId: row.imagesMediaId,
      mediaReady: ready,
      questions: outcome,
      createdAt: new Date(row.createdAt).toISOString(),
      decidedAt: iso(row.decidedAt),
    };
  };

  // ---- the three ways of an import ----------------------------------------------------------

  interface Imported {
    readonly taskId: number;
    readonly outcome: ImportOutcomeKind;
    readonly revisionId: number | null;
    readonly questions: RevisionQuestionOutcome;
    readonly media: MediaRow[];
  }

  const withoutProposals = (outcome: {
    created: string[];
    updated: string[];
    unchanged: string[];
    conflicts: string[];
    removed: string[];
  }): RevisionQuestionOutcome => ({ ...outcome, proposals: {} });

  const createDraft = (
    manifest: LessonManifest,
    plugin: TaskTypePlugin,
    subjectId: number,
  ): Imported => {
    const task = tasksService.create(
      {
        type: manifest.type,
        title: manifest.title,
        subjectId,
        ...(manifest.description !== undefined && { description: manifest.description }),
        ...(manifest.xp !== undefined && { xp: manifest.xp }),
        ...(manifest.coins !== undefined && { coins: manifest.coins }),
        ...(manifest.lessonDate !== undefined && { lessonDate: manifest.lessonDate }),
      },
      null,
    );
    db.update(tasks).set({ externalId: manifest.externalId }).where(eq(tasks.id, task.id)).run();
    const video = createMedia(task.id, 'video', manifest.media.kind, manifest.media.files);
    const images = manifest.images
      ? createMedia(task.id, 'question_image', 'image', manifest.images.files)
      : null;
    const config = plugin.fromImport?.({ ...manifest, mediaId: video.id });
    tasksService.update(task.id, { config }, null);
    const outcome = questionsService.importVersions(
      task.id,
      withImageRefs(manifest.questions, images?.id ?? null),
      { state: 'active' },
    );
    addTranscript(task.id, video.id, manifest);
    return {
      taskId: task.id,
      outcome: 'created',
      revisionId: null,
      questions: withoutProposals(outcome),
      media: images ? [video, images] : [video],
    };
  };

  const updateDraft = (
    manifest: LessonManifest,
    plugin: TaskTypePlugin,
    subjectId: number,
    row: TaskRow,
  ): Imported => {
    const current = tasksService.record(row.id)?.config;
    const video =
      reusable(row.id, 'video', manifest.media.kind, manifest.media.files) ??
      createMedia(row.id, 'video', manifest.media.kind, manifest.media.files);
    const images = manifest.images
      ? (reusable(row.id, 'question_image', 'image', manifest.images.files) ??
        createMedia(row.id, 'question_image', 'image', manifest.images.files))
      : null;
    const config = plugin.fromImport?.({ ...manifest, mediaId: video.id, current });
    tasksService.update(
      row.id,
      {
        title: manifest.title,
        subjectId,
        config,
        ...(manifest.description !== undefined && { description: manifest.description }),
        ...(manifest.xp !== undefined && { xp: manifest.xp }),
        ...(manifest.coins !== undefined && { coins: manifest.coins }),
        ...(manifest.lessonDate !== undefined && { lessonDate: manifest.lessonDate }),
      },
      null,
    );
    retireOtherVideos(row.id, video.id);
    const outcome = questionsService.importVersions(
      row.id,
      withImageRefs(manifest.questions, images?.id ?? null),
      { state: 'active' },
    );
    addTranscript(row.id, video.id, manifest);
    return {
      taskId: row.id,
      outcome: 'updated',
      revisionId: null,
      questions: withoutProposals(outcome),
      media: images ? [video, images] : [video],
    };
  };

  const revise = (
    manifest: LessonManifest,
    plugin: TaskTypePlugin,
    row: TaskRow,
    tokenId: number,
  ): Imported => {
    const record = requireRecord(row.id);
    // The video is unchanged when the type would build the very same config from it.
    const sameVideo = reusable(row.id, 'video', manifest.media.kind, manifest.media.files);
    const unchangedVideo =
      sameVideo !== undefined &&
      JSON.stringify(plugin.fromImport?.({ mediaId: sameVideo.id, current: record.config })) ===
        JSON.stringify(record.config);
    const video =
      sameVideo ?? createMedia(row.id, 'video', manifest.media.kind, manifest.media.files);
    const sameImages = manifest.images
      ? reusable(row.id, 'question_image', 'image', manifest.images.files)
      : undefined;
    const images = manifest.images
      ? (sameImages ?? createMedia(row.id, 'question_image', 'image', manifest.images.files))
      : null;
    const proposedVideo = unchangedVideo ? null : video.id;
    const proposedImages = images && images.status !== 'ready' ? images.id : null;

    // A newer import supersedes the pending revision; its media are dropped unless reused.
    const previous = pendingRevision(row.id);
    if (previous) {
      close(previous, 'superseded', null);
      for (const id of proposedMedia(previous)) {
        if (id !== video.id && id !== images?.id) {
          mediaService.markDeleted(id);
        }
      }
    }

    const outcome = questionsService.importVersions(
      row.id,
      withImageRefs(manifest.questions, images?.id ?? null),
      { state: 'pending' },
    );
    addTranscript(row.id, video.id, manifest);
    const proposals = Object.fromEntries(
      manifest.questions.filter((q) => outcome.conflicts.includes(q.key)).map((q) => [q.key, q]),
    );
    const questionsOutcome: RevisionQuestionOutcome = { ...outcome, proposals };
    const changed =
      proposedVideo !== null ||
      proposedImages !== null ||
      outcome.created.length + outcome.updated.length + outcome.removed.length > 0;
    if (!changed) {
      return {
        taskId: row.id,
        outcome: 'unchanged',
        revisionId: null,
        questions: questionsOutcome,
        media: images ? [video, images] : [video],
      };
    }
    const revision = db
      .insert(taskRevisions)
      .values({
        taskId: row.id,
        status: 'pending',
        mediaId: proposedVideo,
        imagesMediaId: proposedImages,
        questions: questionsOutcome,
        tokenId,
        createdAt: now(),
      })
      .returning()
      .get();
    return {
      taskId: row.id,
      outcome: 'revision',
      revisionId: revision.id,
      questions: questionsOutcome,
      media: images ? [video, images] : [video],
    };
  };

  return {
    listTokens: () =>
      db.select().from(importTokens).orderBy(asc(importTokens.id)).all().map(tokenDto),

    createToken(name, actorId) {
      const token = `${IMPORT_TOKEN_PREFIX}${randomToken()}`;
      return db.transaction(() => {
        const row = db
          .insert(importTokens)
          .values({ name, tokenHash: sha256Hex(token), createdBy: actorId, createdAt: now() })
          .returning()
          .get();
        const payload = auditPayload(importTokenCreated, { name });
        audit.record(actorId, importTokenCreated, 'import_token', row.id, payload);
        return { ...tokenDto(row), token };
      });
    },

    revokeToken(id, actorId) {
      db.transaction(() => {
        const row = db.select().from(importTokens).where(eq(importTokens.id, id)).get();
        if (!row) {
          throw notFound('Токен не найден');
        }
        if (row.revokedAt !== null) {
          return;
        }
        db.update(importTokens)
          .set({ revokedAt: now(), revokedBy: actorId })
          .where(eq(importTokens.id, id))
          .run();
        const payload = auditPayload(importTokenRevoked, { name: row.name });
        audit.record(actorId, importTokenRevoked, 'import_token', id, payload);
      });
    },

    resolveToken(token) {
      if (!token.startsWith(IMPORT_TOKEN_PREFIX)) {
        return null;
      }
      const row = db
        .select({ id: importTokens.id })
        .from(importTokens)
        .where(and(eq(importTokens.tokenHash, sha256Hex(token)), isNull(importTokens.revokedAt)))
        .get();
      return row?.id ?? null;
    },

    async importLesson(manifest, tokenId) {
      const plugin = importablePlugin(manifest.type);
      const subject = subjects.findByKey(manifest.subjectKey);
      if (!subject || subject.archivedAt !== null) {
        throw new HttpError(422, 'unknown_subject', `Нет предмета с ключом ${manifest.subjectKey}`);
      }
      const declared = [...manifest.media.files, ...(manifest.images?.files ?? [])].reduce(
        (sum, f) => sum + f.size,
        0,
      );
      await mkdir(mediaService.root, { recursive: true });
      const free = await freeBytes(mediaService.root);
      if (free < declared + DISK_RESERVE_BYTES) {
        throw new HttpError(507, 'insufficient_storage', 'На сервере мало места', {
          freeBytes: free,
          neededBytes: declared + DISK_RESERVE_BYTES,
        });
      }
      const result = db.transaction((): Imported => {
        const existing = db
          .select()
          .from(tasks)
          .where(eq(tasks.externalId, manifest.externalId))
          .get();
        let imported: Imported;
        if (!existing) {
          imported = createDraft(manifest, plugin, subject.id);
        } else if (existing.type !== manifest.type) {
          throw conflict('type_mismatch', 'Урок с этим externalId другого типа');
        } else if (existing.status === 'archived') {
          throw conflict('task_archived', 'Урок в архиве: верните его из архива, чтобы обновить');
        } else if (existing.status === 'draft') {
          imported = updateDraft(manifest, plugin, subject.id, existing);
        } else {
          imported = revise(manifest, plugin, existing, tokenId);
        }
        const payload = auditPayload(lessonImported, {
          externalId: manifest.externalId,
          outcome: imported.outcome,
          tokenId,
          revisionId: imported.revisionId,
        });
        audit.record(null, lessonImported, 'task', imported.taskId, payload);
        return imported;
      });
      const { proposals: _proposals, ...questionOutcome } = result.questions;
      return {
        taskId: result.taskId,
        outcome: result.outcome,
        revisionId: result.revisionId,
        questions: questionOutcome,
        media: await Promise.all(result.media.map((row) => uploader.mediaDto(row))),
      };
    },

    async mediaStatus(mediaId) {
      const row = mediaService.find(mediaId);
      if (!row || row.role === 'upload') {
        throw notFound('Медиа не найдено');
      }
      return uploader.mediaDto(row);
    },

    putChunk: (mediaId, rawPath, offset, body) => uploader.putChunk(mediaId, rawPath, offset, body),

    completeMedia: (mediaId, input) => uploader.complete(mediaId, input),

    listRevisions(status) {
      const rows = db
        .select({ revision: taskRevisions, title: tasks.title })
        .from(taskRevisions)
        .innerJoin(tasks, eq(tasks.id, taskRevisions.taskId))
        .where(status === undefined ? undefined : eq(taskRevisions.status, status))
        .orderBy(desc(taskRevisions.createdAt), desc(taskRevisions.id))
        .all();
      return rows.map(({ revision, title }) => summary(revision, title));
    },

    getRevision(id) {
      const row = findRevision(id);
      const task = tasksService.get(row.taskId);
      const latestOf = (key: string): QuestionRow | undefined =>
        db
          .select()
          .from(questions)
          .where(and(eq(questions.taskId, row.taskId), eq(questions.key, key)))
          .orderBy(desc(questions.version))
          .get();
      const live = (key: string) => liveOfKey(row.taskId, key);
      const activeOf = (key: string) => live(key).find((q) => q.state === 'active');
      const pendingOf = (key: string) => live(key).find((q) => q.state === 'pending');
      const toContent = (q: QuestionRow | undefined) => (q ? contentOf(q) : null);
      const outcome = row.questions;
      const diff: RevisionQuestionDiffDto[] = [
        ...outcome.created.map((key) => ({
          key,
          change: 'created' as const,
          current: null,
          proposed: toContent(pendingOf(key)),
        })),
        ...outcome.updated.map((key) => ({
          key,
          change: 'updated' as const,
          current: toContent(activeOf(key)),
          proposed: toContent(pendingOf(key)),
        })),
        ...outcome.removed.map((key) => ({
          key,
          change: 'removed' as const,
          current: toContent(activeOf(key)),
          proposed: null,
        })),
        ...outcome.conflicts.map((key) => {
          const latest = latestOf(key);
          const proposal = outcome.proposals[key];
          return {
            key,
            change: 'conflict' as const,
            current: latest && latest.archivedAt === null ? contentOf(latest) : null,
            proposed: proposal ? { ...proposal, version: 0 } : null,
          };
        }),
      ];
      const record = tasksService.record(row.taskId);
      const config = record?.config as { mediaId?: unknown } | undefined;
      return {
        ...summary(row, task.title),
        currentMediaId: typeof config?.mediaId === 'number' ? config.mediaId : null,
        diff,
      };
    },

    acceptRevision(id, actorId) {
      return db.transaction(() => {
        const row = findRevision(id);
        if (row.status !== 'pending') {
          throw conflict('revision_closed', 'Ревизия уже рассмотрена');
        }
        for (const mediaId of proposedMedia(row)) {
          if (mediaService.find(mediaId)?.status !== 'ready') {
            throw conflict('media_not_ready', 'Новое видео или картинки ещё не загружены');
          }
        }
        const at = now();
        // Questions: pending versions replace the live ones of their keys.
        for (const pending of livePending(row.taskId)) {
          for (const other of liveOfKey(row.taskId, pending.key)) {
            if (other.id !== pending.id) {
              archiveQuestion(other.id, at);
            }
          }
          db.update(questions).set({ state: 'active' }).where(eq(questions.id, pending.id)).run();
        }
        for (const key of row.questions.removed) {
          for (const other of liveOfKey(row.taskId, key)) {
            if (other.source === 'import') {
              archiveQuestion(other.id, at);
            }
          }
        }
        // The video: the type builds the new config; the old video goes to retention.
        const record = requireRecord(row.taskId);
        const plugin = importablePlugin(record.type);
        if (row.mediaId !== null) {
          const config = plugin.fromImport?.({ mediaId: row.mediaId, current: record.config });
          tasksService.update(row.taskId, { config }, actorId);
          retireOtherVideos(row.taskId, row.mediaId);
        }
        // A published task must stay publishable (e.g. enough questions after removals).
        const updated = requireRecord(row.taskId);
        if (updated.status === 'published') {
          const errors = [
            ...plugin.contract.canPublish(updated),
            ...(plugin.publishChecks?.(updated, { db, settings }) ?? []),
          ];
          if (errors.length > 0) {
            throw cannotPublish(errors);
          }
        }
        const closed = close(row, 'accepted', actorId);
        const payload = auditPayload(revisionAccepted, { revisionId: id, mediaId: row.mediaId });
        audit.record(actorId, revisionAccepted, 'task', row.taskId, payload);
        return summary(closed);
      });
    },

    rejectRevision(id, actorId) {
      return db.transaction(() => {
        const row = findRevision(id);
        if (row.status !== 'pending') {
          throw conflict('revision_closed', 'Ревизия уже рассмотрена');
        }
        const at = now();
        for (const pending of livePending(row.taskId)) {
          archiveQuestion(pending.id, at);
        }
        const closed = close(row, 'rejected', actorId);
        const payload = auditPayload(revisionRejected, { revisionId: id });
        audit.record(actorId, revisionRejected, 'task', row.taskId, payload);
        // Files last: nothing else can fail after them.
        for (const mediaId of proposedMedia(row)) {
          mediaService.markDeleted(mediaId);
        }
        return summary(closed);
      });
    },
  };
}
