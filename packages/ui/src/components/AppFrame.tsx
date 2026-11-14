import type { ReactNode } from 'react';
import { cx } from '../internal/cx';
import { UiLink } from './Link';
import './AppFrame.css';

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon?: ReactNode;
  readonly active?: boolean;
}

export interface AppFrameProps {
  /** TopBar. */
  readonly header: ReactNode;
  /** BottomNav of the learner (fixed at the bottom). */
  readonly nav?: ReactNode;
  /** SideNav of the admin (left on wide screens, on top on phones). */
  readonly aside?: ReactNode;
  readonly width?: 'content' | 'admin';
  readonly children: ReactNode;
}

/** Page skeleton: header, optional side navigation, main content, optional bottom navigation. */
export function AppFrame({ header, nav, aside, width = 'content', children }: AppFrameProps) {
  return (
    <div
      className="qc-frame"
      data-width={width}
      data-has-nav={nav ? true : undefined}
      data-has-aside={aside ? true : undefined}
    >
      {header}
      <div className="qc-frame-body">
        {aside && <aside className="qc-frame-aside">{aside}</aside>}
        <main className="qc-frame-main">{children}</main>
      </div>
      {nav}
    </div>
  );
}

export interface TopBarProps {
  readonly brand: ReactNode;
  readonly actions?: ReactNode;
  /** Second row (the learner's numbers). */
  readonly children?: ReactNode;
  readonly width?: 'content' | 'shell' | 'admin';
}

export function TopBar({ brand, actions, children, width = 'shell' }: TopBarProps) {
  return (
    <header className="qc-topbar">
      <div className="qc-topbar-row" data-width={width}>
        {brand}
        {actions && <div className="qc-topbar-actions">{actions}</div>}
      </div>
      {children && (
        <div className="qc-topbar-extra" data-width={width}>
          {children}
        </div>
      )}
    </header>
  );
}

export interface BrandProps {
  readonly name?: string;
  /** Logo picture URL. */
  readonly logo?: string;
  readonly href?: string;
  /** Small caption under the name («Кабинет родителя»). */
  readonly caption?: string;
}

export function Brand({ name = 'КвестКласс', logo, href, caption }: BrandProps) {
  const content = (
    <>
      {logo && <img className="qc-brand-logo" src={logo} alt="" />}
      <span className="qc-brand-text">
        <span className="qc-brand-name">{name}</span>
        {caption && <span className="qc-brand-caption">{caption}</span>}
      </span>
    </>
  );
  return href ? (
    <UiLink href={href} className="qc-brand" aria-label={`${name}: на главную`}>
      {content}
    </UiLink>
  ) : (
    <span className="qc-brand">{content}</span>
  );
}

export interface BottomNavProps {
  readonly label: string;
  readonly items: readonly NavItem[];
  /** `static` for previews; the app keeps it fixed at the bottom. */
  readonly placement?: 'fixed' | 'static';
}

/** The learner's main sections: big touch targets at the bottom of the screen. */
export function BottomNav({ label, items, placement = 'fixed' }: BottomNavProps) {
  return (
    <nav className="qc-bottom-nav" data-placement={placement} aria-label={label}>
      <ul
        className="qc-bottom-nav-list"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <li key={item.id}>
            <UiLink
              href={item.href}
              className={cx('qc-bottom-nav-item', item.active && 'qc-nav-active')}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </UiLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface SideNavProps {
  readonly label: string;
  readonly items: readonly NavItem[];
}

/** Sections of the admin area: a column on wide screens, a scrolling row on phones. */
export function SideNav({ label, items }: SideNavProps) {
  return (
    <nav className="qc-side-nav" aria-label={label}>
      <ul className="qc-side-nav-list">
        {items.map((item) => (
          <li key={item.id}>
            <UiLink
              href={item.href}
              className={cx('qc-side-nav-item', item.active && 'qc-nav-active')}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </UiLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
