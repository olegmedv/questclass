// The picture of a shop item or a purchase: a (live) hero, a room or a ticket. An admin upload
// whose file is missing shows the placeholder P-001 (docs/PLACEHOLDERS.md).
import type { PurchaseSnapshot } from '@questclass/shared/shop/dto';
import { Placeholder, SpriteImage } from '@questclass/ui';
import { LiveHero } from '../animation/LiveHero';
import { RoomPreview } from './RoomPreview';

export interface ShopItemMediaProps {
  readonly item: PurchaseSnapshot & { readonly title: string };
  /** A live hero gets the «Оживить героя» button (cards and details). */
  readonly controls?: boolean;
}

const missing = <Placeholder kind="upload" label="Картинка товара" />;

export function ShopItemMedia({ item, controls = true }: ShopItemMediaProps) {
  if (item.hero) {
    const { animation, hero } = item;
    const poster = animation?.poster || hero.image;
    if (!poster) return missing;
    return (
      <LiveHero
        poster={poster}
        sprite={(animation ? animation.posterSprite : hero.sprite) ?? undefined}
        src={animation?.src ?? undefined}
        motion={animation?.motion ?? undefined}
        alt={item.title}
        mode="on-demand"
        controls={controls}
      />
    );
  }
  if (item.room) {
    if (!item.room.thumb) return missing;
    // A room that moves plays by its button (no touch and no sound in the shop).
    if (item.animated && controls) {
      return <RoomPreview room={item.room} animation={item.animation} title={item.title} />;
    }
    return <SpriteImage src={item.room.thumb} alt={item.title} />;
  }
  if (item.ticket) {
    return item.ticket.image ? (
      <SpriteImage src={item.ticket.image} sprite={item.ticket.sprite} alt={item.title} />
    ) : (
      missing
    );
  }
  return missing;
}
