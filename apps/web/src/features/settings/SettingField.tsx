// One field of the generic settings form: the control is chosen by the setting's schema
// (whole number, decimal, switch, choice, list, text), never by its key.
import type { SettingDef } from '@questclass/shared/settings/registry';
import { settingFieldOf, settingText, type SettingField } from '@questclass/shared/settings/form';
import { Field, NumberInput, Select, Switch, Textarea, TextInput } from '@questclass/ui';

export interface SettingFieldProps {
  readonly settingKey: string;
  readonly def: SettingDef;
  /** Current text of the field (a list: one item per line; a switch: `true`/`false`). */
  readonly text: string;
  readonly onChange: (text: string) => void;
  readonly error?: string;
  readonly disabled?: boolean;
}

/** «По умолчанию: 70» in the words the field itself uses. */
function defaultText(field: SettingField, value: unknown): string {
  if (field.kind === 'enum') {
    return field.options.find((option) => option.value === value)?.label ?? String(value);
  }
  if (field.kind === 'boolean') return value === true ? 'включено' : 'выключено';
  const text = settingText(field, value);
  return field.kind === 'list' ? text.split('\n').join(', ') || 'пусто' : text;
}

function range(field: SettingField): string | null {
  if (field.kind !== 'integer' && field.kind !== 'decimal') return null;
  if (field.min !== null && field.max !== null) return `от ${field.min} до ${field.max}`;
  if (field.min !== null) return `не меньше ${field.min}`;
  if (field.max !== null) return `не больше ${field.max}`;
  return null;
}

export function SettingFieldControl({
  settingKey,
  def,
  text,
  onChange,
  error,
  disabled,
}: SettingFieldProps) {
  const field = settingFieldOf(def.schema);
  const allowed = range(field);
  const hint = [
    def.description,
    field.kind === 'list' ? 'По одному на строке.' : null,
    allowed ? `Можно ${allowed}.` : null,
    `По умолчанию: ${defaultText(field, def.default)}.`,
  ]
    .filter(Boolean)
    .join(' ');

  if (field.kind === 'boolean') {
    return (
      <Switch
        name={settingKey}
        label={def.label}
        description={hint}
        checked={text === 'true'}
        disabled={disabled}
        onChange={(checked) => onChange(String(checked))}
      />
    );
  }

  let control;
  switch (field.kind) {
    case 'integer': {
      const parsed = text.trim() === '' ? null : Number(text);
      control = (
        <NumberInput
          name={settingKey}
          value={parsed !== null && Number.isFinite(parsed) ? parsed : null}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          onChange={(value) => onChange(value === null ? '' : String(value))}
        />
      );
      break;
    }
    case 'decimal':
      control = (
        <TextInput
          name={settingKey}
          inputMode="decimal"
          value={text}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      );
      break;
    case 'enum':
      control = (
        <Select
          name={settingKey}
          options={field.options}
          value={text}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      );
      break;
    case 'list':
      control = (
        <Textarea
          name={settingKey}
          rows={Math.min(8, Math.max(3, text.split('\n').length + 1))}
          value={text}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      );
      break;
    default:
      control = (
        <TextInput
          name={settingKey}
          value={text}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      );
  }
  return (
    <Field label={def.label} hint={hint} error={error} disabled={disabled}>
      {control}
    </Field>
  );
}
