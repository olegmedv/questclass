import { cloneElement, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react';
import './Tooltip.css';

export interface TooltipProps {
  readonly content: ReactNode;
  /** A single focusable element (button, link). */
  readonly children: ReactElement<{ 'aria-describedby'?: string }>;
  readonly placement?: 'top' | 'bottom';
}

/** Short hint on hover and keyboard focus; Escape hides it. */
export function Tooltip({ content, children, placement = 'top' }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const describedBy = [children.props['aria-describedby'], open ? id : null]
    .filter(Boolean)
    .join(' ');
  return (
    <span
      className="qc-tooltip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {cloneElement(children, { 'aria-describedby': describedBy || undefined })}
      {open && (
        <span role="tooltip" id={id} className="qc-tooltip-bubble" data-placement={placement}>
          {content}
        </span>
      )}
    </span>
  );
}
