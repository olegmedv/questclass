import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../internal/cx';
import './Button.css';
import './Menu.css';

export interface MenuAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
}

export interface MenuProps {
  /** Accessible name of the trigger («Профиль»). */
  readonly label: string;
  /** Content of the trigger button (an icon or an avatar). */
  readonly trigger: ReactNode;
  /** Title inside the menu (who is signed in). */
  readonly heading?: ReactNode;
  readonly items: readonly MenuAction[];
  readonly align?: 'start' | 'end';
  readonly disabled?: boolean;
}

/** A button that opens a short list of actions (profile menu). Arrows, Escape, click outside. */
export function Menu({
  label,
  trigger,
  heading,
  items,
  align = 'end',
  disabled = false,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const enabled = items.map((item) => !item.disabled);
  const focusItem = (index: number) => itemRefs.current[index]?.focus();
  const firstEnabled = () => enabled.indexOf(true);

  useEffect(() => {
    if (!open) return;
    focusItem(firstEnabled());
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
    // Focus moves only when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  };

  const onMenuKey = (event: KeyboardEvent) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    const move = (delta: number) => {
      for (let i = 1; i <= items.length; i += 1) {
        const next = (current + delta * i + items.length) % items.length;
        if (enabled[next]) return focusItem(next);
      }
    };
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(firstEnabled());
        break;
      case 'End':
        event.preventDefault();
        focusItem(enabled.lastIndexOf(true));
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  return (
    <div ref={root} className="qc-menu">
      <button
        ref={button}
        type="button"
        className="qc-icon-btn qc-menu-trigger"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      {open && (
        <div className={cx('qc-menu-popover')} data-align={align}>
          {heading && <div className="qc-menu-heading">{heading}</div>}
          <div
            id={menuId}
            role="menu"
            aria-label={label}
            className="qc-menu-list"
            onKeyDown={onMenuKey}
          >
            {items.map((item, index) => (
              <button
                key={item.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="qc-menu-item"
                disabled={item.disabled}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
