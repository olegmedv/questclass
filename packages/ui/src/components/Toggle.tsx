import { useEffect, useId, useRef, type ReactNode } from 'react';
import './Form.css';

interface ToggleProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly name?: string;
}

/** On/off setting that applies at once («Звуки интерфейса»). */
export function Switch({ checked, onChange, label, description, disabled, name }: ToggleProps) {
  const descriptionId = useId();
  const labelId = useId();
  return (
    <label className="qc-toggle" data-kind="switch" data-disabled={disabled || undefined}>
      <input
        type="checkbox"
        role="switch"
        className="qc-toggle-input"
        checked={checked}
        disabled={disabled}
        name={name}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="qc-toggle-switch" aria-hidden="true" />
      <span className="qc-toggle-text">
        <span id={labelId} className="qc-toggle-label">
          {label}
        </span>
        {description && (
          <span id={descriptionId} className="qc-toggle-description">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/** A choice in a form or list (assign to a learner, accept a rule…). */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  name,
  indeterminate = false,
}: ToggleProps & { readonly indeterminate?: boolean }) {
  const descriptionId = useId();
  const labelId = useId();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="qc-toggle" data-kind="checkbox" data-disabled={disabled || undefined}>
      <input
        ref={ref}
        type="checkbox"
        className="qc-toggle-input"
        checked={checked}
        disabled={disabled}
        name={name}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="qc-toggle-box" aria-hidden="true" />
      <span className="qc-toggle-text">
        <span id={labelId} className="qc-toggle-label">
          {label}
        </span>
        {description && (
          <span id={descriptionId} className="qc-toggle-description">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
