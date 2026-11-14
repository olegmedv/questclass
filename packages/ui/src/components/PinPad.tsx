import { Check, Delete } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Spinner } from './Spinner';
import './PinPad.css';

export interface PinPadProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: (pin: string) => void;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  /** «Неверный PIN», «Попробуйте через 8 с»… */
  readonly error?: string;
  readonly label?: string;
  readonly submitLabel?: string;
  /** Listen to the physical keyboard (default). Turn off when several pads share a page. */
  readonly keyboard?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Big digit keys for the learner's PIN. The physical keyboard works too (digits, Backspace,
 * Enter) unless the focus is in a text field.
 */
export function PinPad({
  value,
  onChange,
  onSubmit,
  minLength = 4,
  maxLength = 8,
  disabled = false,
  loading = false,
  error,
  label = 'PIN',
  submitLabel = 'Войти',
  keyboard = true,
}: PinPadProps) {
  const locked = disabled || loading;
  const canSubmit = !locked && value.length >= minLength;
  const latest = useRef({ value, locked, canSubmit, onChange, onSubmit, maxLength });
  useEffect(() => {
    latest.current = { value, locked, canSubmit, onChange, onSubmit, maxLength };
  });

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (event: KeyboardEvent) => {
      const state = latest.current;
      if (
        state.locked ||
        isTyping(event.target) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        if (state.value.length < state.maxLength) state.onChange(state.value + event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        state.onChange(state.value.slice(0, -1));
      } else if (event.key === 'Enter' && state.canSubmit) {
        event.preventDefault();
        state.onSubmit(state.value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard]);

  const press = (digit: string) => {
    if (!locked && value.length < maxLength) onChange(value + digit);
  };
  const dots = Math.min(maxLength, Math.max(minLength, value.length));
  return (
    <div
      className="qc-pinpad"
      role="group"
      aria-label={label}
      data-error={error ? true : undefined}
    >
      <div className="qc-pinpad-dots" aria-hidden="true">
        {Array.from({ length: dots }, (_, i) => (
          <span key={i} className="qc-pinpad-dot" data-filled={i < value.length || undefined} />
        ))}
      </div>
      <p className="qc-visually-hidden" aria-live="polite">
        Введено цифр: {value.length}
      </p>
      <p className="qc-pinpad-error" role="alert">
        {error}
      </p>
      <div className="qc-pinpad-keys">
        {KEYS.map((digit) => (
          <button
            key={digit}
            type="button"
            className="qc-pinpad-key"
            disabled={locked}
            onClick={() => press(digit)}
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          className="qc-pinpad-key qc-pinpad-key-tool"
          aria-label="Стереть"
          disabled={locked || value.length === 0}
          onClick={() => onChange(value.slice(0, -1))}
        >
          <Delete aria-hidden="true" />
        </button>
        <button
          type="button"
          className="qc-pinpad-key"
          disabled={locked}
          onClick={() => press('0')}
        >
          0
        </button>
        <button
          type="button"
          className="qc-pinpad-key qc-pinpad-key-submit"
          aria-label={submitLabel}
          aria-busy={loading || undefined}
          disabled={!canSubmit}
          onClick={() => onSubmit(value)}
        >
          {loading ? <Spinner size="sm" label="" /> : <Check aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
