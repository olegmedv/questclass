import './Spinner.css';

export interface SpinnerProps {
  readonly size?: 'sm' | 'md' | 'lg';
  /** Announced to screen readers. Empty string = decorative (inside a busy button). */
  readonly label?: string;
}

export function Spinner({ size = 'md', label = 'Загрузка' }: SpinnerProps) {
  if (label === '') {
    return <span className="qc-spinner" data-size={size} aria-hidden="true" />;
  }
  return <span className="qc-spinner" data-size={size} role="status" aria-label={label} />;
}
