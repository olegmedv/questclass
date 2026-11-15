import { z } from 'zod';
import { requestIdSchema } from '../economy/dto';
import { lessonDateSchema, subjectKeySchema } from '../tasks/dto';

/** Name of a reward reason: trimmed, inner whitespace collapsed, 1–60 characters. */
export const rewardReasonNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Название не может быть пустым').max(60));

/** XP or coins of one manual award (spec/02 §2.3: 0–1000 each). */
const amountSchema = z.number().int().min(0).max(1000);

const atLeastOneAmount = (value: { xp?: number; coins?: number }): boolean =>
  (value.xp ?? 0) > 0 || (value.coins ?? 0) > 0;
const AMOUNT_MESSAGE = 'Укажите XP или монеты';

/** Equality of reasons and award titles ignores case and repeated spaces. */
export function rewardTextKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

export const rewardReasonCreateSchema = z
  .object({ name: rewardReasonNameSchema, xp: amountSchema, coins: amountSchema })
  .refine(atLeastOneAmount, AMOUNT_MESSAGE);

export const rewardReasonUpdateSchema = z
  .object({
    name: rewardReasonNameSchema,
    xp: amountSchema,
    coins: amountSchema,
    archived: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Нечего менять');

export type RewardReasonCreateRequest = z.infer<typeof rewardReasonCreateSchema>;
export type RewardReasonUpdateRequest = z.infer<typeof rewardReasonUpdateSchema>;

export interface RewardReasonDto {
  readonly id: number;
  /** Set on the reasons of the installation seed. */
  readonly seedKey: string | null;
  readonly name: string;
  readonly xp: number;
  readonly coins: number;
  readonly archived: boolean;
}

/** `reasonId` of an award that has no reason («Своя награда»). */
export const CUSTOM_REASON = 'custom';
export const CUSTOM_REASON_NAME = 'Своя награда';

export const awardCreateSchema = z
  .object({
    /** A non-archived reason, or `custom`. */
    reasonId: z.union([z.number().int().positive(), z.literal(CUSTOM_REASON)]),
    title: z
      .string()
      .transform((value) => value.trim().replace(/\s+/g, ' '))
      .pipe(z.string().min(1, 'Название не может быть пустым').max(150)),
    /** Day of the lesson or deed, `YYYY-MM-DD`. */
    date: lessonDateSchema,
    /** Omitted or null = «Без предмета». */
    subjectKey: subjectKeySchema.nullable().optional(),
    /** The lesson the award is for (optional). */
    taskId: z.number().int().positive().nullable().optional(),
    xp: amountSchema,
    coins: amountSchema,
    note: z.string().trim().max(500).optional(),
    /** Retrying with the same id returns the first award. */
    requestId: requestIdSchema,
    /** Grant even though the same award (reason, date, subject, title) was already given. */
    force: z.boolean().optional(),
  })
  .refine(atLeastOneAmount, AMOUNT_MESSAGE);

export type AwardCreateRequest = z.infer<typeof awardCreateSchema>;

/** One manual award («От родителя»). Snapshots keep their names after renames. */
export interface AwardDto {
  readonly id: number;
  readonly learnerId: number;
  /** Null for «Своя награда». */
  readonly reasonId: number | null;
  readonly reasonName: string;
  readonly title: string;
  readonly date: string;
  readonly subjectId: number | null;
  /** «Без предмета» when there is no subject. */
  readonly subjectName: string;
  readonly taskId: number | null;
  readonly xp: number;
  readonly coins: number;
  readonly note: string | null;
  /** The ledger row that paid the award. */
  readonly ledgerId: number;
  /** ISO 8601 */
  readonly at: string;
  /** ISO 8601; set once the award is cancelled (a compensating ledger row exists). */
  readonly cancelledAt: string | null;
  readonly createdBy: number | null;
}

/** Newest first; pass `nextCursor` back as `cursor` for the next page. */
export interface AwardPageDto {
  readonly items: AwardDto[];
  readonly nextCursor: string | null;
}

export const NO_SUBJECT_NAME = 'Без предмета';
