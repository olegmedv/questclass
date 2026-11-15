import { z } from 'zod';

export const TASK_STATUSES = ['draft', 'published', 'archived'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Stable machine name of a subject (`math`); used by settings and the import manifest. */
export const subjectKeySchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_-]{1,39}$/,
    'Ключ: 2–40 символов, латиница в нижнем регистре, цифры, _ и -',
  );

/** Display name: trimmed, inner whitespace collapsed, 1–80 characters. */
export const subjectNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Название не может быть пустым').max(80));

/** Key of a built-in asset (e.g. `game/subjects-pixel/math`) used as an icon. */
export const assetKeySchema = z
  .string()
  .regex(/^[a-z0-9/_-]{1,120}$/, 'Некорректный ключ картинки');

/** Calendar date of a lesson, `YYYY-MM-DD`. */
export const lessonDateSchema = z.iso.date();

/** Name equality ignores case and repeated spaces (`ИЗО` = `изо`). */
export function subjectNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

/** Id of a still picture the admin uploaded (`/api/admin/uploads`). */
const uploadIdSchema = z.number().int().positive();

/** A subject has a built-in icon or an uploaded one, never both. */
const ONE_ICON = {
  message: 'Выберите один значок: встроенный или загруженный',
  path: ['icon'],
};
const oneIcon = (value: { icon?: string | null; iconUploadId?: number | null }) =>
  !(typeof value.icon === 'string' && typeof value.iconUploadId === 'number');

export const subjectCreateSchema = z
  .object({
    key: subjectKeySchema.optional(),
    name: subjectNameSchema,
    icon: assetKeySchema.nullable().optional(),
    iconUploadId: uploadIdSchema.nullable().optional(),
    sort: z.number().int().min(0).max(100_000).optional(),
  })
  .refine(oneIcon, ONE_ICON);

export const subjectUpdateSchema = z
  .object({
    name: subjectNameSchema,
    icon: assetKeySchema.nullable(),
    iconUploadId: uploadIdSchema.nullable(),
    sort: z.number().int().min(0).max(100_000),
    archived: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Нечего менять')
  .refine(oneIcon, ONE_ICON);

const titleSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1, 'Название не может быть пустым').max(150));

/** ISO 8601 date-time with offset, or null for "no release date". */
const releaseAtSchema = z.iso.datetime({ offset: true }).nullable();

export const taskCreateSchema = z.object({
  type: z.string().min(1).max(40),
  subjectId: z.number().int().positive().nullable().optional(),
  title: titleSchema,
  description: z.string().max(1500).optional(),
  /** Type-specific; validated against the type's `configSchema`. Default: the type's default. */
  config: z.unknown().optional(),
  xp: z.number().int().min(0).max(1000).optional(),
  coins: z.number().int().min(0).max(1000).optional(),
  releaseAt: releaseAtSchema.optional(),
  lessonDate: lessonDateSchema.nullable().optional(),
  sort: z.number().int().min(0).max(1_000_000).optional(),
});

export const taskUpdateSchema = z
  .object({
    subjectId: z.number().int().positive().nullable(),
    title: titleSchema,
    description: z.string().max(1500),
    config: z.unknown(),
    xp: z.number().int().min(0).max(1000),
    coins: z.number().int().min(0).max(1000),
    releaseAt: releaseAtSchema,
    lessonDate: lessonDateSchema.nullable(),
    sort: z.number().int().min(0).max(1_000_000),
    /** `published` runs the type's publish checks (422 with the list of problems). */
    status: z.enum(TASK_STATUSES),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Нечего менять');

export const assignmentCreateSchema = z.object({
  learnerId: z.number().int().positive(),
});

export type SubjectCreateRequest = z.infer<typeof subjectCreateSchema>;
export type SubjectUpdateRequest = z.infer<typeof subjectUpdateSchema>;
export type TaskCreateRequest = z.infer<typeof taskCreateSchema>;
export type TaskUpdateRequest = z.infer<typeof taskUpdateSchema>;

export interface SubjectDto {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  /** Built-in icon: asset key without the extension. */
  readonly icon: string | null;
  /** Uploaded icon (`/api/uploads/<id>`); null when the icon is built-in or missing. */
  readonly iconUploadId: number | null;
  readonly sort: number;
  readonly archived: boolean;
}

/** A task as the admin sees it (full config). */
export interface TaskDto {
  readonly id: number;
  readonly type: string;
  readonly subjectId: number | null;
  readonly title: string;
  readonly description: string;
  readonly config: unknown;
  readonly xp: number;
  readonly coins: number;
  readonly status: TaskStatus;
  /** ISO 8601 */
  readonly releaseAt: string | null;
  readonly lessonDate: string | null;
  readonly sort: number;
  /** Id of the lesson in the import source (lesson-prep), if imported. */
  readonly externalId: string | null;
  /** Learners the task is assigned to; empty = every active learner. */
  readonly assignees: number[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

/** A task as a learner sees it: only the type's public config. */
export interface LearnerTaskDto {
  readonly id: number;
  readonly type: string;
  readonly subjectId: number | null;
  readonly title: string;
  readonly description: string;
  readonly config: unknown;
  readonly xp: number;
  readonly coins: number;
  readonly releaseAt: string | null;
  readonly lessonDate: string | null;
  readonly sort: number;
  /** Assigned to this learner personally (shown first). */
  readonly assigned: boolean;
}
