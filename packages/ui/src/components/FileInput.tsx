import { Upload } from 'lucide-react';
import { useState } from 'react';
import { buttonClassName } from './Button';
import { useFieldControl } from './Field';
import './Form.css';

export interface FileInputProps {
  readonly onChange: (files: File[]) => void;
  /** e.g. "image/webp,image/png" */
  readonly accept?: string;
  readonly multiple?: boolean;
  readonly disabled?: boolean;
  readonly id?: string;
  /** Text of the button. */
  readonly buttonLabel?: string;
}

/** File picker: a real (visually hidden) input behind a button, with the chosen names shown. */
export function FileInput({
  onChange,
  accept,
  multiple = false,
  disabled,
  id,
  buttonLabel = 'Выбрать файл',
}: FileInputProps) {
  const control = useFieldControl({ id, disabled });
  const [names, setNames] = useState<string[]>([]);
  return (
    <span className="qc-file" data-disabled={control.disabled || undefined}>
      <input
        {...control}
        type="file"
        className="qc-file-input qc-visually-hidden"
        accept={accept}
        multiple={multiple}
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          setNames(files.map((file) => file.name));
          onChange(files);
        }}
      />
      <label htmlFor={control.id} className={buttonClassName({ variant: 'secondary', size: 'sm' })}>
        <Upload aria-hidden="true" />
        <span className="qc-btn-label">{buttonLabel}</span>
      </label>
      <span className="qc-file-names" aria-live="polite">
        {names.length > 0 ? names.join(', ') : 'Файл не выбран'}
      </span>
    </span>
  );
}
