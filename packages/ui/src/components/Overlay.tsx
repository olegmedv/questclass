import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { focusableIn, lockScroll, trapTab } from '../internal/focus';
import { IconButton } from './Button';
import './Overlay.css';

export interface OverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  /** Action buttons pinned to the bottom. */
  readonly footer?: ReactNode;
  /** Escape, the close button and a click outside close it (default). */
  readonly dismissible?: boolean;
  readonly closeLabel?: string;
  readonly size?: 'sm' | 'md' | 'lg';
  /** Element focused on open; default — the first focusable element of the content. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
}

type Variant = 'modal' | 'sheet' | 'drawer';

function OverlayRoot({
  variant,
  side = 'right',
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  closeLabel = 'Закрыть',
  size = 'md',
  initialFocusRef,
}: OverlayProps & { readonly variant: Variant; readonly side?: 'left' | 'right' }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockScroll();
    const target =
      initialFocusRef?.current ??
      (bodyRef.current ? focusableIn(bodyRef.current)[0] : undefined) ??
      dialogRef.current;
    target?.focus();
    return () => {
      unlock();
      if (previous?.isConnected) previous.focus();
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && dismissible) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (dialogRef.current) trapTab(event, dialogRef.current);
  };
  const onBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (dismissible && event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <div className="qc-overlay" data-variant={variant} data-side={side} onMouseDown={onBackdrop}>
      <div
        ref={dialogRef}
        className="qc-dialog"
        data-size={size}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="qc-dialog-header">
          <div className="qc-dialog-titles">
            <h2 id={titleId} className="qc-dialog-title">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="qc-dialog-description">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <IconButton label={closeLabel} icon={<X />} size="sm" onClick={onClose} />
          )}
        </header>
        <div ref={bodyRef} className="qc-dialog-body">
          {children}
        </div>
        {footer && <footer className="qc-dialog-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** Centred dialog. */
export function Modal(props: OverlayProps) {
  return <OverlayRoot variant="modal" {...props} />;
}

/** Panel sliding up from the bottom (phone-friendly menus and confirmations). */
export function Sheet(props: OverlayProps) {
  return <OverlayRoot variant="sheet" {...props} />;
}

/** Side panel (navigation, filters). */
export function Drawer({
  side = 'right',
  ...props
}: OverlayProps & { readonly side?: 'left' | 'right' }) {
  return <OverlayRoot variant="drawer" side={side} {...props} />;
}
