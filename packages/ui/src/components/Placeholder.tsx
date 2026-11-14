import { BookOpen, ImageOff, Sparkles, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import './Placeholder.css';

/**
 * The only way to show a missing asset (CLAUDE.md rule 9). Every use needs a row in
 * docs/PLACEHOLDERS.md with the same `kind` and `label`.
 */
export type PlaceholderKind = 'upload' | 'subject' | 'image' | 'animation';

const icons: Record<PlaceholderKind, ReactNode> = {
  upload: <Upload aria-hidden="true" />,
  subject: <BookOpen aria-hidden="true" />,
  image: <ImageOff aria-hidden="true" />,
  animation: <Sparkles aria-hidden="true" />,
};

export interface PlaceholderProps {
  readonly kind: PlaceholderKind;
  /** What should be here, e.g. «Картинка товара». Visible and announced. */
  readonly label: string;
  /** CSS aspect ratio of the slot, default square. */
  readonly ratio?: string;
  readonly size?: 'sm' | 'md' | 'fill';
}

export function Placeholder({ kind, label, ratio = '1 / 1', size = 'fill' }: PlaceholderProps) {
  return (
    <div
      className="qc-placeholder"
      role="img"
      aria-label={label}
      data-kind={kind}
      data-size={size}
      style={{ aspectRatio: ratio }}
    >
      {icons[kind]}
      {size !== 'sm' && <span className="qc-placeholder-label">{label}</span>}
    </div>
  );
}
