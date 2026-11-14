import { useId, type ReactNode } from 'react';
import './WishCard.css';

export interface WishCardProps {
  readonly title: string;
  /** «Билетов: 1» or «300 Robux». */
  readonly amount: string;
  readonly description?: ReactNode;
  /** The ticket picture (SpriteImage) or a placeholder. */
  readonly picture: ReactNode;
  /** «Куплено · можно использовать», «Просьба отправлена». */
  readonly status?: ReactNode;
  /** «Хочу использовать». */
  readonly action?: ReactNode;
}

/** One kind of bought reward in «Мои желания»: picture, what is left and what to do with it. */
export function WishCard({ title, amount, description, picture, status, action }: WishCardProps) {
  const titleId = useId();
  return (
    <article className="qc-wish-card" aria-labelledby={titleId}>
      <div className="qc-wish-card-picture">{picture}</div>
      <div className="qc-wish-card-body">
        <h3 id={titleId} className="qc-wish-card-title">
          {title}
        </h3>
        <p className="qc-wish-card-amount">{amount}</p>
        {description && <p className="qc-wish-card-description">{description}</p>}
        {status && <div className="qc-wish-card-status">{status}</div>}
      </div>
      {action && <div className="qc-wish-card-action">{action}</div>}
    </article>
  );
}
