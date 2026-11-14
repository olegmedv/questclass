import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { IconImage } from './IconImage';
import { Spinner } from './Spinner';
import './Form.css';
import './IconPicker.css';

export interface IconPickerOption {
  readonly value: string;
  /** Accessible name and tooltip of the tile («Загрузка № 12»). */
  readonly label: string;
  /** Picture of the tile; without it the tile shows `icon` («без значка»). */
  readonly src?: string;
  readonly pixelated?: boolean;
  readonly icon?: ReactNode;
}

export interface IconPickerProps {
  readonly legend: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly options: readonly IconPickerOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  /** More tiles are on their way (the list of uploads is loading). */
  readonly loading?: boolean;
  /** Under the tiles: e.g. the button that uploads a new picture. */
  readonly footer?: ReactNode;
}

/**
 * A grid of picture tiles, one of which is chosen (a radio group: arrow keys move the choice).
 * Used for the icon of a subject: built-in pictures and the admin's uploads side by side.
 */
export function IconPicker({
  legend,
  hint,
  error,
  options,
  value,
  onChange,
  disabled = false,
  loading = false,
  footer,
}: IconPickerProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <fieldset
      className="qc-icon-picker"
      disabled={disabled}
      aria-describedby={describedBy || undefined}
      aria-busy={loading || undefined}
      data-invalid={Boolean(error) || undefined}
    >
      <legend className="qc-field-label">{legend}</legend>
      <div className="qc-icon-picker-grid">
        {options.map((option) => (
          <label key={option.value} className="qc-icon-pick" title={option.label}>
            <input
              type="radio"
              className="qc-icon-pick-input"
              name={id}
              value={option.value}
              checked={option.value === value}
              aria-label={option.label}
              onChange={() => onChange(option.value)}
            />
            <span className="qc-icon-pick-tile" aria-hidden="true">
              {option.src ? (
                <IconImage src={option.src} pixelated={option.pixelated} />
              ) : (
                option.icon
              )}
              <span className="qc-icon-pick-check">
                <Check />
              </span>
            </span>
          </label>
        ))}
        {loading && (
          <span className="qc-icon-pick-tile" data-loading>
            <Spinner size="sm" label="Загружаем картинки" />
          </span>
        )}
      </div>
      {hint && (
        <p id={hintId} className="qc-field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="qc-field-error" role="alert">
          {error}
        </p>
      )}
      {footer}
    </fieldset>
  );
}
