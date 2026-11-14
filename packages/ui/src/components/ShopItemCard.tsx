import { Coins } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';
import './ShopItemCard.css';

const number = (value: number) => value.toLocaleString('ru-RU');

export interface ShopItemCardProps {
  readonly title: string;
  /** Preview: a (live) hero, a room or a ticket picture. */
  readonly media?: ReactNode;
  /** `wide` — a 3:2 room; `square` — heroes and tickets. */
  readonly mediaShape?: 'square' | 'wide';
  /** Small marks over the picture: the room section, «анимация». */
  readonly marks?: ReactNode;
  readonly price: number;
  /** «Ещё N монет»: the price button is off while coins are missing. */
  readonly missingCoins?: number;
  readonly onBuy?: () => void;
  /** The title is a button that opens «Подробнее». */
  readonly onDetails?: () => void;
  /** The purchase is being saved. */
  readonly buying?: boolean;
  /** A live hero or a room that moves: framed in the «live» colour. */
  readonly live?: boolean;
  readonly loading?: boolean;
}

export interface ShopMarkProps {
  readonly icon: ReactNode;
  /** What the mark means («Дневная комната», «Анимированная»). */
  readonly label: string;
  readonly tone?: 'gold' | 'teal';
}

export interface ShopPreviewProps {
  readonly shape?: 'square' | 'wide';
  readonly children: ReactNode;
}

/** The framed big picture of an item in the shop's dialogs (confirmation, details). */
export function ShopPreview({ shape = 'square', children }: ShopPreviewProps) {
  return (
    <div className="qc-shop-card-media qc-shop-preview" data-shape={shape}>
      {children}
    </div>
  );
}

/** A small mark over a shop picture: the section of a room or that it moves. */
export function ShopMark({ icon, label, tone = 'gold' }: ShopMarkProps) {
  return (
    <span className="qc-shop-mark" data-tone={tone} role="img" aria-label={label}>
      {icon}
    </span>
  );
}

/** A card of the learner's shop: preview, name (opens details) and the price button. */
export function ShopItemCard({
  title,
  media,
  mediaShape = 'square',
  marks,
  price,
  missingCoins = 0,
  onBuy,
  onDetails,
  buying = false,
  live = false,
  loading = false,
}: ShopItemCardProps) {
  const titleId = useId();
  if (loading) {
    return (
      <article className="qc-shop-card" aria-busy="true">
        <div className="qc-shop-card-media" data-shape={mediaShape}>
          <Skeleton ratio={mediaShape === 'wide' ? '3 / 2' : '1 / 1'} />
        </div>
        <Skeleton lines={2} />
      </article>
    );
  }
  const missing = missingCoins > 0;
  return (
    <article className="qc-shop-card" data-live={live || undefined} aria-labelledby={titleId}>
      <div className="qc-shop-card-media" data-shape={mediaShape}>
        {media}
        {marks && <span className="qc-shop-card-marks">{marks}</span>}
      </div>
      <h3 id={titleId} className="qc-shop-card-title">
        {onDetails ? (
          <button
            type="button"
            className="qc-shop-card-details"
            aria-haspopup="dialog"
            title="Подробнее"
            onClick={onDetails}
          >
            {title}
          </button>
        ) : (
          title
        )}
      </h3>
      <button
        type="button"
        className="qc-shop-card-price"
        disabled={missing || buying || !onBuy}
        aria-busy={buying || undefined}
        aria-label={
          missing
            ? `${title}: ${number(price)} монет, ещё ${number(missingCoins)} монет`
            : `Купить «${title}» за ${number(price)} монет`
        }
        onClick={onBuy}
      >
        <span className="qc-shop-card-amount">
          {buying ? <Spinner size="sm" label="" /> : <Coins aria-hidden="true" />}
          {number(price)}
        </span>
        {missing && <span className="qc-shop-card-missing">Ещё {number(missingCoins)} монет</span>}
      </button>
    </article>
  );
}
