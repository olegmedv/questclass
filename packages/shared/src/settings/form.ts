import type { z } from 'zod';

/**
 * How the admin form edits a setting, derived from its zod schema only (the form is generic:
 * no per-key code). Option labels of an enum come from its `.meta({ optionLabels })`.
 */
export type SettingField =
  | { readonly kind: 'integer'; readonly min: number | null; readonly max: number | null }
  | { readonly kind: 'decimal'; readonly min: number | null; readonly max: number | null }
  | { readonly kind: 'boolean' }
  | {
      readonly kind: 'enum';
      readonly options: readonly { readonly value: string; readonly label: string }[];
    }
  /** A list of short strings, edited one per line. */
  | { readonly kind: 'list' }
  | { readonly kind: 'text' };

interface Introspectable {
  readonly _zod: { readonly def: { readonly type: string } };
  readonly minValue?: number | null;
  readonly maxValue?: number | null;
  readonly isInt?: boolean;
  readonly options?: readonly unknown[];
  meta?: () => Record<string, unknown> | undefined;
}

const finite = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function settingFieldOf(schema: z.ZodType): SettingField {
  const probe = schema as unknown as Introspectable;
  switch (probe._zod.def.type) {
    case 'number':
      return {
        kind: probe.isInt ? 'integer' : 'decimal',
        min: finite(probe.minValue),
        max: finite(probe.maxValue),
      };
    case 'boolean':
      return { kind: 'boolean' };
    case 'enum': {
      const labels = (probe.meta?.()?.['optionLabels'] ?? {}) as Record<string, string>;
      const options = (probe.options ?? []).map((value) => String(value));
      return {
        kind: 'enum',
        options: options.map((value) => ({ value, label: labels[value] ?? value })),
      };
    }
    case 'array':
      return { kind: 'list' };
    default:
      return { kind: 'text' };
  }
}

/** Text of a value in the form (a list is one item per line). */
export function settingText(field: SettingField, value: unknown): string {
  if (field.kind === 'list') {
    return Array.isArray(value) ? value.map(String).join('\n') : '';
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return value === null || value === undefined ? '' : JSON.stringify(value);
}

/** The value a form text stands for; validation is left to the setting's schema. */
export function settingValue(field: SettingField, text: string): unknown {
  switch (field.kind) {
    case 'integer':
    case 'decimal': {
      const trimmed = text.trim().replace(',', '.');
      return trimmed === '' ? null : Number(trimmed);
    }
    case 'boolean':
      return text === 'true';
    case 'list':
      return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '');
    default:
      return text.trim();
  }
}
