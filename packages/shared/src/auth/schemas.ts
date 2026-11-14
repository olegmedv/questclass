import { z } from 'zod';

export const USER_ROLES = ['admin', 'learner'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Admin login name: stored lower-case. */
export const loginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'Логин: 3–32 символа, латиница, цифры, точка, дефис');

export const passwordSchema = z
  .string()
  .min(8, 'Пароль не короче 8 символов')
  .max(200, 'Пароль не длиннее 200 символов');

/** Learner PIN: 4–8 digits. */
export const pinSchema = z.string().regex(/^\d{4,8}$/, 'PIN — от 4 до 8 цифр');

export const displayNameSchema = z.string().trim().min(1).max(40);
/** Asset key of an avatar picture (e.g. `avatars/fox`). */
export const avatarSchema = z
  .string()
  .regex(/^[a-z0-9/_-]{1,80}$/)
  .nullable();

export const setupRequestSchema = z.object({
  token: z.string().min(1).max(200),
  login: loginSchema,
  password: passwordSchema,
  name: displayNameSchema.default('Админ'),
});

export const adminLoginRequestSchema = z.object({
  login: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(200),
});

export const learnerLoginRequestSchema = z.object({
  userId: z.number().int().positive(),
  pin: z.string().min(1).max(16),
});

export const deviceCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const userCreateRequestSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('admin'),
    name: displayNameSchema,
    login: loginSchema,
    password: passwordSchema,
    avatar: avatarSchema.optional(),
  }),
  z.object({
    role: z.literal('learner'),
    name: displayNameSchema,
    pin: pinSchema,
    avatar: avatarSchema.optional(),
  }),
]);

export const userUpdateRequestSchema = z
  .object({
    name: displayNameSchema,
    avatar: avatarSchema,
    login: loginSchema,
    password: passwordSchema,
    pin: pinSchema,
    active: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Нечего менять');

/** The admin changes their own password: the current one proves it is them. */
export const passwordChangeRequestSchema = z.object({
  current: z.string().min(1, 'Введите текущий пароль').max(200),
  next: passwordSchema,
});

export type SetupRequest = z.infer<typeof setupRequestSchema>;
export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;
export type LearnerLoginRequest = z.infer<typeof learnerLoginRequestSchema>;
export type UserCreateRequest = z.infer<typeof userCreateRequestSchema>;
export type UserUpdateRequest = z.infer<typeof userUpdateRequestSchema>;
export type PasswordChangeRequest = z.infer<typeof passwordChangeRequestSchema>;
