import type { z } from 'zod';

/** An installation-wide setting edited in the admin UI ("Настройки"). */
export interface SettingDef<T = unknown> {
  readonly schema: z.ZodType<T>;
  readonly default: T;
  /** Field label in the admin form (Russian UI). */
  readonly label: string;
  readonly description?: string;
}

/** A secret (API key, bot token): write-only from the admin UI, stored encrypted. */
export interface SecretDef {
  readonly label: string;
  readonly description?: string;
}

/** Declares a setting; the default must itself satisfy the schema. */
export function defineSetting<T>(def: SettingDef<T>): SettingDef<T> {
  const check = def.schema.safeParse(def.default);
  if (!check.success) {
    throw new Error(`Default of setting "${def.label}" does not match its schema`);
  }
  return Object.freeze({ ...def });
}

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

/** Merges per-module key files into one registry; a key declared twice is an error. */
export function combineKeys<const T extends readonly Readonly<Record<string, unknown>>[]>(
  ...parts: T
): UnionToIntersection<T[number]> {
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    for (const [key, def] of Object.entries(part)) {
      if (key in out) {
        throw new Error(`Setting or secret declared twice: ${key}`);
      }
      out[key] = def;
    }
  }
  return Object.freeze(out) as UnionToIntersection<T[number]>;
}
