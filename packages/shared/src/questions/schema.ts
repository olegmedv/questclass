import { z } from 'zod';

/** Answer options are always four, identified `a`–`d` (spec/01 §2.3). */
export const OPTION_IDS = ['a', 'b', 'c', 'd'] as const;
export type OptionId = (typeof OPTION_IDS)[number];

export const MAX_QUESTION_LENGTH = 1000;
export const MAX_OPTION_LENGTH = 300;
export const MAX_QUOTE_LENGTH = 1000;
/** One evidence fragment may not exceed a day of video. */
const MAX_SECONDS = 86_400;

export const QUESTION_STATES = ['active', 'pending'] as const;
export type QuestionState = (typeof QUESTION_STATES)[number];
/** Who created a version: lesson-prep import or an admin. */
export const QUESTION_SOURCES = ['import', 'admin'] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];

/** Stable identity of a question across versions (e.g. `q1` from lesson-prep). */
export const questionKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Ключ вопроса: 1–64 символа, латиница, цифры, _ и -');

/**
 * A picture: a relative path inside the lesson media or the app assets, never an external URL
 * (no third-party CDNs). A leading slash is dropped (`/quiz/a.png` → `quiz/a.png`).
 */
export const imageRefSchema = z
  .string()
  .transform((value) => value.replace(/^\//, ''))
  .pipe(
    z
      .string()
      .regex(/^[A-Za-z0-9_][A-Za-z0-9_./-]{0,299}$/, 'Некорректный путь картинки')
      .refine((value) => !value.split('/').includes('..'), 'Некорректный путь картинки'),
  );

/** Where in the video the answer is explained (seconds) and the supporting quote. */
export const evidenceSchema = z
  .object({
    start: z.number().min(0).max(MAX_SECONDS),
    end: z.number().min(0).max(MAX_SECONDS),
    quote: z.string().trim().max(MAX_QUOTE_LENGTH).nullable(),
  })
  .refine((e) => e.end > e.start, 'Конец фрагмента должен быть позже начала');

export const optionSchema = z.object({
  id: z.enum(OPTION_IDS),
  text: z.string().trim().min(1, 'Вариант не может быть пустым').max(MAX_OPTION_LENGTH),
  image: imageRefSchema.nullable().optional(),
});

/** The content of one question version (what an edit or an import provides). */
export const questionContentSchema = z
  .object({
    text: z.string().trim().min(1, 'Нужен текст вопроса').max(MAX_QUESTION_LENGTH),
    options: z.array(optionSchema).length(4, 'Нужно ровно четыре варианта'),
    correct: z.enum(OPTION_IDS),
    image: imageRefSchema.nullable().optional(),
    evidence: evidenceSchema.nullable().optional(),
  })
  .superRefine((q, ctx) => {
    const ids = new Set(q.options.map((o) => o.id));
    if (ids.size !== q.options.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Варианты повторяются' });
    }
    const texts = new Set(q.options.map((o) => o.text.toLocaleLowerCase('ru-RU')));
    if (texts.size !== q.options.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Варианты должны различаться' });
    }
    if (!ids.has(q.correct)) {
      ctx.addIssue({ code: 'custom', path: ['correct'], message: 'Нет такого варианта' });
    }
  });

export type QuestionOption = z.infer<typeof optionSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type QuestionContent = z.infer<typeof questionContentSchema>;

export const questionCreateSchema = questionContentSchema.and(
  z.object({ key: questionKeySchema.optional() }),
);

/** Admin import of a test as plain text or JSON (format detected from the content). */
export const questionImportRequestSchema = z.object({
  content: z.string().min(1).max(512_000),
  /** Keep the current questions and add the new ones (default: replace the bank). */
  append: z.boolean().optional(),
});

export const TRANSCRIPT_SOURCES = ['youtube', 'whisper', 'manual'] as const;
export type TranscriptSource = (typeof TRANSCRIPT_SOURCES)[number];

export const transcriptSegmentSchema = z
  .object({
    start: z.number().min(0).max(MAX_SECONDS),
    end: z.number().min(0).max(MAX_SECONDS),
    text: z.string().max(2000),
  })
  .refine((s) => s.end >= s.start, 'Конец сегмента раньше начала');

export const transcriptCreateSchema = z.object({
  mediaId: z.number().int().positive().nullable().optional(),
  lang: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, 'Код языка, например ru'),
  source: z.enum(TRANSCRIPT_SOURCES),
  segments: z.array(transcriptSegmentSchema).max(50_000),
});

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type TranscriptCreateRequest = z.infer<typeof transcriptCreateSchema>;

/** One version of a question, as the admin sees it (answers included). */
export interface QuestionDto {
  readonly id: number;
  readonly taskId: number;
  readonly key: string;
  readonly version: number;
  readonly text: string;
  readonly options: QuestionOption[];
  readonly correct: OptionId;
  readonly image: string | null;
  readonly evidence: Evidence | null;
  readonly state: QuestionState;
  readonly source: QuestionSource;
  readonly position: number;
  /** ISO 8601 */
  readonly createdAt: string;
  readonly archivedAt: string | null;
}

export interface TranscriptDto {
  readonly id: number;
  readonly taskId: number;
  readonly mediaId: number | null;
  readonly lang: string;
  readonly source: TranscriptSource;
  readonly segments: TranscriptSegment[];
  readonly createdAt: string;
}
