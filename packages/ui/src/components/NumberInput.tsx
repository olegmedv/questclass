import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { useFieldControl } from './Field';
import './Form.css';

export interface NumberInputProps {
  /** null = empty box. */
  readonly value: number | null;
  readonly onChange: (value: number | null) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly name?: string;
  /** Unit after the number, e.g. «монет». */
  readonly suffix?: string;
}

const clamp = (value: number, min?: number, max?: number) =>
  Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));

/** Whole number with − and + buttons; typing is kept as is until the box loses focus. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  id,
  name,
  suffix,
}: NumberInputProps) {
  const control = useFieldControl({ id, disabled });
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? '' : String(value));
  const commit = (text: string) => {
    setDraft(null);
    const trimmed = text.trim().replace(/\s+/g, '');
    if (trimmed === '') {
      onChange(null);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    onChange(Number.isFinite(parsed) ? clamp(parsed, min, max) : value);
  };
  const bump = (delta: number) => onChange(clamp((value ?? min ?? 0) + delta, min, max));
  const isDisabled = Boolean(control.disabled);
  return (
    <span className="qc-number">
      <button
        type="button"
        className="qc-number-step"
        aria-label="Уменьшить"
        disabled={isDisabled || (value !== null && min !== undefined && value <= min)}
        onClick={() => bump(-step)}
      >
        <Minus aria-hidden="true" />
      </button>
      <span className="qc-input qc-number-box">
        <input
          {...control}
          name={name}
          className="qc-input-control"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={shown}
          aria-valuemin={min}
          aria-valuemax={max}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit(event.currentTarget.value);
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              bump(step);
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              bump(-step);
            }
          }}
        />
        {suffix && (
          <span className="qc-number-suffix" aria-hidden="true">
            {suffix}
          </span>
        )}
      </span>
      <button
        type="button"
        className="qc-number-step"
        aria-label="Увеличить"
        disabled={isDisabled || (value !== null && max !== undefined && value >= max)}
        onClick={() => bump(step)}
      >
        <Plus aria-hidden="true" />
      </button>
    </span>
  );
}
