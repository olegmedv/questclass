import { parseQuestionImport, QuestionImportError } from '@questclass/shared/questions/importText';
import type {
  QuestionContent,
  QuestionDto,
  QuestionState,
  TranscriptCreateRequest,
  TranscriptDto,
} from '@questclass/shared/questions/schema';
import { and, asc, desc, eq, isNull, max } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { questions, type QuestionRow } from '../../db/schema/questions';
import { tasks } from '../../db/schema/tasks';
import { transcripts, type TranscriptRow } from '../../db/schema/transcripts';
import { badRequest, conflict, notFound } from '../../http/errors';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';

export const questionCreated = defineAuditAction(
  'question.created',
  z.object({ taskId: z.number(), key: z.string(), text: z.string() }),
);
export const questionUpdated = defineAuditAction(
  'question.updated',
  z.object({ taskId: z.number(), key: z.string(), version: z.number() }),
);
export const questionArchived = defineAuditAction(
  'question.archived',
  z.object({ taskId: z.number(), key: z.string(), version: z.number() }),
);
export const questionsImported = defineAuditAction(
  'question.imported',
  z.object({ taskId: z.number(), count: z.number(), replaced: z.number() }),
);
export const transcriptCreated = defineAuditAction(
  'transcript.created',
  z.object({ taskId: z.number(), lang: z.string(), source: z.string(), segments: z.number() }),
);

/** A question coming from lesson-prep, identified by its stable key. */
export interface ImportedQuestion extends QuestionContent {
  readonly key: string;
}

/** What an import did, key by key (FEAT-012 shows it in the revision). */
export interface ImportOutcome {
  readonly created: string[];
  readonly updated: string[];
  readonly unchanged: string[];
  /** Keys whose latest version is the admin's (edited or deleted by them): not overwritten. */
  readonly conflicts: string[];
  /** Imported questions of the task that the new import no longer contains. */
  readonly removed: string[];
}

export interface ImportOptions {
  /** `active` for a draft task; `pending` for a published one (accepted with its revision). */
  readonly state: QuestionState;
  readonly actorId?: number | null;
}

export interface QuestionsService {
  /** Live versions (one per key; a key may also have a pending version), in bank order. */
  list(taskId: number, options?: { includeArchived?: boolean }): QuestionDto[];
  versions(taskId: number, key: string): QuestionDto[];
  create(
    taskId: number,
    input: QuestionContent & { key?: string },
    actorId: number | null,
  ): QuestionDto;
  /** A new version of the latest live version; the edited one is archived. */
  update(taskId: number, key: string, input: QuestionContent, actorId: number | null): QuestionDto;
  /** Deleting a question archives its live versions. */
  archive(taskId: number, key: string, actorId: number | null): void;
  /** Admin import of text/JSON: new questions, replacing the live bank unless `append`. */
  importText(
    taskId: number,
    content: string,
    options: { append?: boolean },
    actorId: number | null,
  ): QuestionDto[];
  /** lesson-prep import by key; never overwrites a question the admin owns. */
  importVersions(
    taskId: number,
    incoming: readonly ImportedQuestion[],
    options: ImportOptions,
  ): ImportOutcome;
  /** The bank attempts draw from: live, active versions. Contains the answers (server only). */
  activeBank(taskId: number): QuestionDto[];
  countActive(taskId: number): number;
  transcripts(taskId: number): TranscriptDto[];
  addTranscript(
    taskId: number,
    input: TranscriptCreateRequest,
    actorId: number | null,
  ): TranscriptDto;
}

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

export function toQuestionDto(row: QuestionRow): QuestionDto {
  return {
    id: row.id,
    taskId: row.taskId,
    key: row.key,
    version: row.version,
    text: row.text,
    options: row.options,
    correct: row.correct,
    image: row.imageRef,
    evidence: row.evidence,
    state: row.state,
    source: row.source,
    position: row.position,
    createdAt: new Date(row.createdAt).toISOString(),
    archivedAt: iso(row.archivedAt),
  };
}

function toTranscriptDto(row: TranscriptRow): TranscriptDto {
  return {
    id: row.id,
    taskId: row.taskId,
    mediaId: row.mediaId,
    lang: row.lang,
    source: row.source,
    segments: row.segments,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

/** The comparable content of a version (what an edit or an import may change). */
function contentOf(q: QuestionContent): string {
  return JSON.stringify({
    text: q.text,
    options: q.options.map((o) => ({ id: o.id, text: o.text, image: o.image ?? null })),
    correct: q.correct,
    image: q.image ?? null,
    evidence: q.evidence ?? null,
  });
}

function rowContent(row: QuestionRow): QuestionContent {
  return {
    text: row.text,
    options: row.options,
    correct: row.correct,
    image: row.imageRef,
    evidence: row.evidence,
  };
}

const generatedKey = (): string => `q-${randomBytes(4).toString('hex')}`;

export function createQuestionsService(
  db: Db,
  deps: { audit: AuditService; clock?: () => number },
): QuestionsService {
  const { audit, clock = Date.now } = deps;

  const requireTask = (taskId: number): void => {
    const row = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).get();
    if (!row) {
      throw notFound('Задание не найдено');
    }
  };

  const allVersions = (taskId: number, key: string): QuestionRow[] =>
    db
      .select()
      .from(questions)
      .where(and(eq(questions.taskId, taskId), eq(questions.key, key)))
      .orderBy(asc(questions.version))
      .all();

  const liveRows = (taskId: number): QuestionRow[] =>
    db
      .select()
      .from(questions)
      .where(and(eq(questions.taskId, taskId), isNull(questions.archivedAt)))
      .orderBy(asc(questions.position), asc(questions.key), asc(questions.version))
      .all();

  const nextPosition = (taskId: number): number =>
    (db
      .select({ value: max(questions.position) })
      .from(questions)
      .where(eq(questions.taskId, taskId))
      .get()?.value ?? 0) + 1;

  const insertVersion = (values: {
    taskId: number;
    key: string;
    version: number;
    content: QuestionContent;
    state: QuestionState;
    source: 'import' | 'admin';
    position: number;
    actorId: number | null;
  }): QuestionRow =>
    db
      .insert(questions)
      .values({
        taskId: values.taskId,
        key: values.key,
        version: values.version,
        text: values.content.text,
        options: values.content.options.map((o) => ({
          id: o.id,
          text: o.text,
          ...(o.image ? { image: o.image } : {}),
        })),
        correct: values.content.correct,
        imageRef: values.content.image ?? null,
        evidence: values.content.evidence ?? null,
        state: values.state,
        source: values.source,
        position: values.position,
        createdBy: values.actorId,
        createdAt: clock(),
      })
      .returning()
      .get();

  const archiveRow = (id: number, actorId: number | null): void => {
    db.update(questions)
      .set({ archivedAt: clock(), archivedBy: actorId })
      .where(eq(questions.id, id))
      .run();
  };

  /** Latest live version of a key (a pending one above an active one wins). */
  const latestLive = (taskId: number, key: string): QuestionRow | undefined =>
    db
      .select()
      .from(questions)
      .where(
        and(eq(questions.taskId, taskId), eq(questions.key, key), isNull(questions.archivedAt)),
      )
      .orderBy(desc(questions.version))
      .get();

  const create: QuestionsService['create'] = (taskId, input, actorId) =>
    db.transaction(() => {
      requireTask(taskId);
      const key = input.key ?? generatedKey();
      if (allVersions(taskId, key).length > 0) {
        throw conflict('question_key_taken', 'Вопрос с таким ключом уже есть');
      }
      const row = insertVersion({
        taskId,
        key,
        version: 1,
        content: input,
        state: 'active',
        source: 'admin',
        position: nextPosition(taskId),
        actorId,
      });
      const payload = auditPayload(questionCreated, { taskId, key, text: row.text });
      audit.record(actorId, questionCreated, 'question', row.id, payload);
      return toQuestionDto(row);
    });

  return {
    list(taskId, options = {}) {
      requireTask(taskId);
      if (!options.includeArchived) {
        return liveRows(taskId).map(toQuestionDto);
      }
      return db
        .select()
        .from(questions)
        .where(eq(questions.taskId, taskId))
        .orderBy(asc(questions.position), asc(questions.key), asc(questions.version))
        .all()
        .map(toQuestionDto);
    },

    versions(taskId, key) {
      requireTask(taskId);
      const rows = allVersions(taskId, key);
      if (rows.length === 0) {
        throw notFound('Вопрос не найден');
      }
      return rows.map(toQuestionDto);
    },

    create,

    update(taskId, key, input, actorId) {
      return db.transaction(() => {
        requireTask(taskId);
        const current = latestLive(taskId, key);
        if (!current) {
          throw notFound('Вопрос не найден');
        }
        const versions = allVersions(taskId, key);
        const version = (versions.at(-1)?.version ?? 0) + 1;
        archiveRow(current.id, actorId);
        const row = insertVersion({
          taskId,
          key,
          version,
          content: input,
          state: current.state,
          source: 'admin',
          position: current.position,
          actorId,
        });
        const payload = auditPayload(questionUpdated, { taskId, key, version });
        audit.record(actorId, questionUpdated, 'question', row.id, payload);
        return toQuestionDto(row);
      });
    },

    archive(taskId, key, actorId) {
      db.transaction(() => {
        requireTask(taskId);
        const live = allVersions(taskId, key).filter((row) => row.archivedAt === null);
        if (live.length === 0) {
          throw notFound('Вопрос не найден');
        }
        for (const row of live) {
          archiveRow(row.id, actorId);
          const payload = auditPayload(questionArchived, { taskId, key, version: row.version });
          audit.record(actorId, questionArchived, 'question', row.id, payload);
        }
      });
    },

    importText(taskId, content, options, actorId) {
      requireTask(taskId);
      let parsed: QuestionContent[];
      try {
        parsed = parseQuestionImport(content);
      } catch (err) {
        if (err instanceof QuestionImportError) {
          throw badRequest('import_failed', err.message);
        }
        throw err;
      }
      return db.transaction(() => {
        const replaced = options.append ? [] : liveRows(taskId);
        for (const row of replaced) {
          archiveRow(row.id, actorId);
        }
        const created = parsed.map((question) =>
          insertVersion({
            taskId,
            key: generatedKey(),
            version: 1,
            content: question,
            state: 'active',
            source: 'admin',
            position: nextPosition(taskId),
            actorId,
          }),
        );
        const payload = auditPayload(questionsImported, {
          taskId,
          count: created.length,
          replaced: replaced.length,
        });
        audit.record(actorId, questionsImported, 'task', taskId, payload);
        return created.map(toQuestionDto);
      });
    },

    importVersions(taskId, incoming, options) {
      const outcome: ImportOutcome = {
        created: [],
        updated: [],
        unchanged: [],
        conflicts: [],
        removed: [],
      };
      const actorId = options.actorId ?? null;
      return db.transaction(() => {
        requireTask(taskId);
        const incomingKeys = new Set(incoming.map((q) => q.key));
        if (incomingKeys.size !== incoming.length) {
          throw badRequest('duplicate_question_key', 'Ключи вопросов в импорте повторяются');
        }
        for (const question of incoming) {
          const versions = allVersions(taskId, question.key);
          const latest = versions.at(-1);
          if (!latest) {
            insertVersion({
              taskId,
              key: question.key,
              version: 1,
              content: question,
              state: options.state,
              source: 'import',
              position: nextPosition(taskId),
              actorId,
            });
            outcome.created.push(question.key);
            continue;
          }
          // The admin edited or deleted this question: their version wins.
          if (latest.source === 'admin' || latest.archivedBy !== null) {
            outcome.conflicts.push(question.key);
            continue;
          }
          if (latest.archivedAt === null && contentOf(rowContent(latest)) === contentOf(question)) {
            outcome.unchanged.push(question.key);
            continue;
          }
          if (latest.state === 'pending' && latest.archivedAt === null) {
            archiveRow(latest.id, null); // a newer pending import supersedes the older one
          } else if (options.state === 'active') {
            for (const row of versions.filter((v) => v.archivedAt === null)) {
              archiveRow(row.id, null);
            }
          }
          insertVersion({
            taskId,
            key: question.key,
            version: latest.version + 1,
            content: question,
            state: options.state,
            source: 'import',
            position: latest.position,
            actorId,
          });
          outcome.updated.push(question.key);
        }
        for (const row of liveRows(taskId)) {
          if (row.source !== 'import' || incomingKeys.has(row.key)) {
            continue;
          }
          if (!outcome.removed.includes(row.key)) {
            outcome.removed.push(row.key);
          }
          if (options.state === 'active') {
            archiveRow(row.id, null);
          }
        }
        return outcome;
      });
    },

    activeBank(taskId) {
      return liveRows(taskId)
        .filter((row) => row.state === 'active')
        .map(toQuestionDto);
    },

    countActive(taskId) {
      return liveRows(taskId).filter((row) => row.state === 'active').length;
    },

    transcripts(taskId) {
      requireTask(taskId);
      return db
        .select()
        .from(transcripts)
        .where(eq(transcripts.taskId, taskId))
        .orderBy(desc(transcripts.createdAt), desc(transcripts.id))
        .all()
        .map(toTranscriptDto);
    },

    addTranscript(taskId, input, actorId) {
      return db.transaction(() => {
        requireTask(taskId);
        const row = db
          .insert(transcripts)
          .values({
            taskId,
            mediaId: input.mediaId ?? null,
            lang: input.lang,
            source: input.source,
            segments: input.segments,
            createdBy: actorId,
            createdAt: clock(),
          })
          .returning()
          .get();
        const payload = auditPayload(transcriptCreated, {
          taskId,
          lang: row.lang,
          source: row.source,
          segments: row.segments.length,
        });
        audit.record(actorId, transcriptCreated, 'transcript', row.id, payload);
        return toTranscriptDto(row);
      });
    },
  };
}
