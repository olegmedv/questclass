import { useId, type ReactNode } from 'react';
import './AuthFrame.css';

export interface AuthFrameProps {
  /** Brand at the top of the page. */
  readonly brand?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  /** Links under the card («Я родитель», «К выбору ученика»). */
  readonly footer?: ReactNode;
  /** Wider card for the profile picker. */
  readonly wide?: boolean;
  /** Inside another page (previews): no full-screen height and no `main` landmark. */
  readonly embedded?: boolean;
}

/** Screens before a session: setup, admin login, profile picker, PIN — a card in the middle. */
export function AuthFrame({
  brand,
  title,
  description,
  children,
  footer,
  wide = false,
  embedded = false,
}: AuthFrameProps) {
  const titleId = useId();
  const Card = embedded ? 'section' : 'main';
  return (
    <div className="qc-auth" data-embedded={embedded || undefined}>
      {brand && <div className="qc-auth-brand">{brand}</div>}
      <Card className="qc-auth-card" data-wide={wide || undefined} aria-labelledby={titleId}>
        <header className="qc-auth-header">
          <h1 id={titleId} className="qc-auth-title">
            {title}
          </h1>
          {description && <p className="qc-auth-description">{description}</p>}
        </header>
        {children}
      </Card>
      {footer && <div className="qc-auth-footer">{footer}</div>}
    </div>
  );
}
