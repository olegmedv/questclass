import { ChevronDown } from 'lucide-react';
import {
  createContext,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from '../internal/cx';
import './Form.css';

interface FieldControl {
  readonly id: string;
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
  readonly required: boolean;
  readonly disabled: boolean;
}

const FieldContext = createContext<FieldControl | null>(null);

/** Props a control inside a `<Field>` takes over: id, descriptions, validity, required. */
export function useFieldControl<
  P extends {
    id?: string;
    disabled?: boolean;
    required?: boolean;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
  },
>(props: P): P {
  const field = useContext(FieldContext);
  if (!field) return props;
  return {
    ...props,
    id: props.id ?? field.id,
    disabled: props.disabled ?? field.disabled,
    required: props.required ?? field.required,
    'aria-describedby': props['aria-describedby'] ?? field.describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field.invalid || undefined),
  };
}

export interface FieldProps {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  /** Validation message; marks the control invalid and is announced. */
  readonly error?: ReactNode;
  readonly required?: boolean;
  readonly disabled?: boolean;
  /** Keep the label for screen readers only (e.g. a search box with an icon). */
  readonly labelHidden?: boolean;
  readonly children: ReactNode;
}

/** Label + control + hint + error, wired together for assistive technology. */
export function Field({
  label,
  hint,
  error,
  required = false,
  disabled = false,
  labelHidden = false,
  children,
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  const control: FieldControl = {
    id,
    describedBy: describedBy || undefined,
    invalid: Boolean(error),
    required,
    disabled,
  };
  return (
    <div className="qc-field" data-invalid={Boolean(error) || undefined}>
      <label htmlFor={id} className={cx('qc-field-label', labelHidden && 'qc-visually-hidden')}>
        {label}
        {required && (
          <span className="qc-field-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <FieldContext.Provider value={control}>{children}</FieldContext.Provider>
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
    </div>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Icon inside the box on the left (search…). */
  readonly icon?: ReactNode;
}

export function TextInput({ icon, className, type = 'text', ...props }: TextInputProps) {
  const control = useFieldControl(props);
  return (
    <span className={cx('qc-input', className)} data-has-icon={icon ? true : undefined}>
      {icon && (
        <span className="qc-input-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <input type={type} className="qc-input-control" {...control} />
    </span>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Shows «12 / 500» under the box when `maxLength` is set. */
  readonly showCount?: boolean;
}

export function Textarea({ showCount = false, className, ...props }: TextareaProps) {
  const control = useFieldControl(props);
  const length = typeof props.value === 'string' ? props.value.length : 0;
  return (
    <span className={cx('qc-textarea', className)}>
      <textarea className="qc-input-control" rows={4} {...control} />
      {showCount && props.maxLength !== undefined && (
        <span className="qc-textarea-count" aria-live="polite">
          {length} / {props.maxLength}
        </span>
      )}
    </span>
  );
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly options: readonly SelectOption[];
  /** First empty option, e.g. «Выберите предмет». */
  readonly placeholder?: string;
}

/** Native select (best on phones), styled like the other inputs. */
export function Select({ options, placeholder, className, ...props }: SelectProps) {
  const control = useFieldControl(props);
  return (
    <span className={cx('qc-input', 'qc-select', className)}>
      <select className="qc-input-control" {...control}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="qc-select-chevron" aria-hidden="true" />
    </span>
  );
}

export type DateTimeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** Local date and time (`YYYY-MM-DDTHH:mm`), the browser's own picker. */
export function DateTimeInput({ className, ...props }: DateTimeInputProps) {
  const control = useFieldControl(props);
  return (
    <span className={cx('qc-input', className)}>
      <input type="datetime-local" className="qc-input-control" {...control} />
    </span>
  );
}
