import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { nextIndex } from '../internal/roving';
import './Tabs.css';

export interface TabItem<T extends string = string> {
  readonly id: T;
  readonly label: string;
  readonly icon?: ReactNode;
  /** Counter after the label. */
  readonly count?: number;
  readonly disabled?: boolean;
}

export interface TabsProps<T extends string> {
  /** Accessible name of the tab list. */
  readonly label: string;
  readonly items: readonly TabItem<T>[];
  readonly value: T;
  readonly onChange: (id: T) => void;
  /** pill — boxed tabs («Ачивки / От мамы / Билетики»); underline — filters inside a section. */
  readonly variant?: 'pill' | 'underline';
  /** Content of the selected tab. */
  readonly children?: ReactNode;
}

/** Tabs with automatic activation: arrows, Home and End move the selection. */
export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
  variant = 'pill',
  children,
}: TabsProps<T>) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(
    0,
    items.findIndex((item) => item.id === value),
  );
  const onKeyDown = (event: KeyboardEvent) => {
    const next = nextIndex(
      event,
      selected,
      items.map((item) => Boolean(item.disabled)),
    );
    if (next === null) return;
    event.preventDefault();
    const item = items[next];
    if (item) {
      onChange(item.id);
      refs.current[next]?.focus();
    }
  };
  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = `${base}-panel`;
  return (
    <div className="qc-tabs" data-variant={variant}>
      <div className="qc-tabs-list" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {items.map((item, index) => {
          const isSelected = index === selected;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={tabId(item.id)}
              className="qc-tabs-tab"
              aria-selected={isSelected}
              aria-controls={children === undefined ? undefined : panelId}
              tabIndex={isSelected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.count !== undefined && <span className="qc-tabs-count">{item.count}</span>}
            </button>
          );
        })}
      </div>
      {children !== undefined && (
        <div
          className="qc-tabs-panel"
          role="tabpanel"
          id={panelId}
          aria-labelledby={tabId(items[selected]?.id ?? '')}
          tabIndex={0}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface SegmentOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  readonly label: string;
  readonly options: readonly SegmentOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
  readonly size?: 'sm' | 'md';
}

/** A small either/or switch («Уроки / Игры»): a radio group that looks like pills. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  size = 'md',
}: SegmentedControlProps<T>) {
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
      className="qc-segmented"
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
            className="qc-segmented-option"
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
