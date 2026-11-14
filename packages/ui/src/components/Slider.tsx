import type { CSSProperties } from 'react';
import { useFieldControl } from './Field';
import './Form.css';

export interface SliderProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
  readonly id?: string;
  /** Text of the value next to the track and for screen readers, e.g. `v => v + '%'`. */
  readonly format?: (value: number) => string;
}

/** Range input (volume, thresholds) with the current value shown. */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  id,
  format = String,
}: SliderProps) {
  const control = useFieldControl({ id, disabled });
  const ratio = max > min ? (value - min) / (max - min) : 0;
  return (
    <span className="qc-slider" style={{ '--qc-slider-fill': `${ratio * 100}%` } as CSSProperties}>
      <input
        {...control}
        type="range"
        className="qc-slider-input"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output className="qc-slider-value" htmlFor={control.id} aria-hidden="true">
        {format(value)}
      </output>
    </span>
  );
}
