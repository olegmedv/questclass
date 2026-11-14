import { Check } from 'lucide-react';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { nextIndex } from '../internal/roving';
import './CategoryFilter.css';

/** Colour of a category: the shop tells sections apart by icon, label and colour. */
export type CategoryTone = 'neutral' | 'blue' | 'green' | 'pink' | 'gold' | 'violet' | 'teal';

export interface CategoryOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly icon: ReactNode;
  readonly tone?: CategoryTone;
  readonly disabled?: boolean;
}

export interface CategoryFilterProps<T extends string> {
  /** Accessible name of the group («Разделы магазина»). */
  readonly label: string;
  readonly options: readonly CategoryOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** `sm` — a sub-filter under the main one. */
  readonly size?: 'md' | 'sm';
  readonly disabled?: boolean;
}

/**
 * Category tiles of a catalog («Всё / Герои / Комнаты / Желания»): icon over the label, a colour
 * per category and a check on the chosen one. A radio group: arrows, Home and End move the choice.
 */
export function CategoryFilter<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  disabled = false,
}: CategoryFilterProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const onKeyDown = (event: KeyboardEvent) => {
    if (disabled) return;
    const next = nextIndex(
      event,
      selected,
      options.map((option) => Boolean(option.disabled)),
    );
    if (next === null) return;
    event.preventDefault();
    const option = options[next];
    if (option) {
      onChange(option.value);
      refs.current[next]?.focus();
    }
  };
  return (
    <div
      className="qc-category-filter"
      data-size={size}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
    >
      {options.map((option, index) => {
        const checked = index === selected;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className="qc-category"
            data-tone={option.tone ?? 'neutral'}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
          >
            <span className="qc-category-icon" aria-hidden="true">
              {option.icon}
            </span>
            <span className="qc-category-label">{option.label}</span>
            {checked && (
              <span className="qc-category-check" aria-hidden="true">
                <Check />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
