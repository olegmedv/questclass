import { z } from 'zod';
import {
  questionContentSchema,
  questionKeySchema,
  transcriptCreateSchema,
  type QuestionContent,
} from '../questions/schema';
import { MEDIA_ENTRY } from '../task-types/video_lesson/contract';
import { lessonDateSchema, subjectKeySchema } from '../tasks/dto';

/** Largest chunk of one `PUT /api/import/media/:id/files/<path>` request. */
export const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
/** Upload is refused unless this much disk stays free after the file (1 GiB). */
export const DISK_RESERVE_BYTES = 1024 * 1024 * 1024;
export const MAX_FILE_BYTES = 8 * 1024 * 1024 * 1024;
export const MAX_MEDIA_FILES = 5000;
export const MAX_IMAGES = 300;
export const MAX_IMPORT_QUESTIONS = 30;

/**
 * A relative path inside a media directory: `[a-z0-9_-]` segments (up to 4) and a whitelisted
 * extension (the server checks it again with `safePath()`).
 */
export const mediaFilePathSchema = z
  .string()
  .max(200)
  .regex(
    /^(?:[a-z0-9_-]{1,64}\/){0,3}[a-z0-9_-]{1,64}\.(?:m3u8|ts|m4s|mp4|webp|png|jpg|vtt|json)$/,
    'Путь файла: сегменты из a-z, 0-9, _ и -, расширение из списка',
  );

const imagePathSchema = mediaFilePathSchema.refine(
  (value) => /\.(?:webp|png|jpg)$/.test(value),
  'Картинка: .webp, .png или .jpg',
);

export const sha256Schema = z
  .string()
  .regex(/^[a-fA-F0-9]{64}$/, 'sha256 в hex')
  .transform((value) => value.toLowerCase());

export const manifestFileSchema = z.object({
  path: mediaFilePathSchema,
  size: z.number().int().min(0).max(MAX_FILE_BYTES),
  sha256: sha256Schema,
});
export type ManifestFile = z.infer<typeof manifestFileSchema>;

const uniquePaths = (files: readonly { path: string }[]) =>
  new Set(files.map((f) => f.path)).size === files.length;

export const VIDEO_KINDS = ['hls', 'mp4'] as const;
export type VideoKind = (typeof VIDEO_KINDS)[number];

const videoSchema = z
  .object({
    kind: z.enum(VIDEO_KINDS),
    files: z.array(manifestFileSchema).min(1).max(MAX_MEDIA_FILES),
  })
  .refine((m) => uniquePaths(m.files), 'Пути файлов повторяются')
  .refine(
    (m) => m.files.some((f) => f.path === MEDIA_ENTRY[m.kind]),
    `Нет главного файла: ${MEDIA_ENTRY.hls} для HLS или ${MEDIA_ENTRY.mp4} для MP4`,
  );

const imagesSchema = z
  .object({
    files: z
      .array(manifestFileSchema.extend({ path: imagePathSchema }))
      .min(1)
      .max(MAX_IMAGES),
  })
  .refine((m) => uniquePaths(m.files), 'Пути файлов повторяются');

/** A question of the lesson; `image` and option images are paths inside `images`. */
export const manifestQuestionSchema = questionContentSchema.and(
  z.object({ key: questionKeySchema }),
);
export type ManifestQuestion = QuestionContent & { key: string };

/**
 * `lesson.json` of a lesson package (SPEC §5 step 7). Re-importing the same `externalId`
 * updates the task instead of creating another one.
 */
export const lessonManifestSchema = z
  .object({
    externalId: z
      .string()
      .regex(/^[A-Za-z0-9_.:-]{1,100}$/, 'externalId: 1–100 символов A-Z, a-z, 0-9, _ . : -'),
    /** Task type of the lesson; it must support import. */
    type: z.string().min(1).max(40).default('video_lesson'),
    subjectKey: subjectKeySchema,
    title: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1).max(150)),
    description: z.string().max(1500).optional(),
    lessonDate: lessonDateSchema.optional(),
    xp: z.number().int().min(0).max(1000).optional(),
    coins: z.number().int().min(0).max(1000).optional(),
    questions: z.array(manifestQuestionSchema).max(MAX_IMPORT_QUESTIONS),
    transcript: transcriptCreateSchema.omit({ mediaId: true }).optional(),
    media: videoSchema,
    images: imagesSchema.optional(),
  })
  .superRefine((manifest, ctx) => {
    const keys = new Set(manifest.questions.map((q) => q.key));
    if (keys.size !== manifest.questions.length) {
      ctx.addIssue({ code: 'custom', path: ['questions'], message: 'Ключи вопросов повторяются' });
    }
    const images = new Set(manifest.images?.files.map((f) => f.path) ?? []);
    manifest.questions.forEach((q, index) => {
      const refs = [q.image, ...q.options.map((o) => o.image)].filter(
        (ref): ref is string => typeof ref === 'string',
      );
      for (const ref of refs) {
        if (!images.has(ref)) {
          ctx.addIssue({
            code: 'custom',
            path: ['questions', index],
            message: `Картинки ${ref} нет в images`,
          });
        }
      }
    });
  });

export type LessonManifest = z.infer<typeof lessonManifestSchema>;

export const importTokenCreateSchema = z.object({
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(80)),
});

/** `durationSec` is required for a video (the player and the watch tracker need it). */
export const mediaCompletionSchema = z.object({
  durationSec: z.number().positive().max(14_400).optional(),
});

export const REVISION_STATUSES = ['pending', 'accepted', 'rejected', 'superseded'] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export interface ImportTokenDto {
  readonly id: number;
  readonly name: string;
  /** ISO 8601 */
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

/** Returned once, on creation. */
export interface IssuedImportTokenDto extends ImportTokenDto {
  readonly token: string;
}

export interface ImportFileDto {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  /** Bytes already on the server: the next chunk goes at this offset. */
  readonly received: number;
}

export interface ImportMediaDto {
  readonly id: number;
  readonly role: 'video' | 'question_image';
  readonly kind: 'hls' | 'mp4' | 'image';
  readonly status: 'pending' | 'uploading' | 'ready' | 'deleted';
  readonly files: ImportFileDto[];
}

export interface QuestionOutcomeDto {
  readonly created: string[];
  readonly updated: string[];
  readonly unchanged: string[];
  /** Questions the admin edited or deleted: the import did not touch them. */
  readonly conflicts: string[];
  /** Imported questions the new package no longer has. */
  readonly removed: string[];
}

/**
 * `created` — a new draft; `updated` — a draft updated in place; `revision` — a published task
 * got a pending revision; `unchanged` — a published task, nothing to review.
 */
export const IMPORT_OUTCOMES = ['created', 'updated', 'revision', 'unchanged'] as const;
export type ImportOutcomeKind = (typeof IMPORT_OUTCOMES)[number];

export interface ImportLessonResultDto {
  readonly taskId: number;
  readonly outcome: ImportOutcomeKind;
  readonly revisionId: number | null;
  readonly questions: QuestionOutcomeDto;
  /** Media of this import: upload whatever is not `ready`, then complete it. */
  readonly media: ImportMediaDto[];
}

export interface UploadResultDto {
  readonly path: string;
  /** Bytes of the file on the server after this chunk. */
  readonly received: number;
  readonly complete: boolean;
}

export interface RevisionSummaryDto {
  readonly id: number;
  readonly taskId: number;
  readonly taskTitle: string;
  readonly status: RevisionStatus;
  /** Proposed media (null = unchanged) and whether they are uploaded. */
  readonly mediaId: number | null;
  readonly imagesMediaId: number | null;
  readonly mediaReady: boolean;
  readonly questions: QuestionOutcomeDto;
  /** ISO 8601 */
  readonly createdAt: string;
  readonly decidedAt: string | null;
}

/** One question key in a revision: what learners see now and what the import proposes. */
export interface RevisionQuestionDiffDto {
  readonly key: string;
  readonly change: 'created' | 'updated' | 'removed' | 'conflict';
  readonly current: (QuestionContent & { version: number }) | null;
  readonly proposed: (QuestionContent & { version: number }) | null;
}

export interface RevisionDetailDto extends RevisionSummaryDto {
  readonly currentMediaId: number | null;
  readonly diff: RevisionQuestionDiffDto[];
}
