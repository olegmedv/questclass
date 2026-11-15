// The picture of a shop item in the admin: the still hero (a sprite cell or a whole picture),
// the room's thumbnail or the ticket. An upload whose file is missing shows the placeholder P-001.
import type { CatalogItemDto, Sprite } from '@questclass/shared/catalog/dto';
import { AnimatedHero, Placeholder } from '@questclass/ui';

export function StillArt({
  image,
  sprite,
  alt,
  pixelated = true,
}: {
  image: string;
  sprite?: Sprite | null;
  alt: string;
  pixelated?: boolean;
}) {
  if (image === '') return <Placeholder kind="upload" label="Картинка товара" />;
  return (
    <AnimatedHero
      poster={image}
      sprite={sprite ?? undefined}
      alt={alt}
      playing={false}
      pixelated={pixelated}
    />
  );
}

export function ItemArt({ item }: { item: CatalogItemDto }) {
  if (item.hero) {
    return <StillArt image={item.hero.image} sprite={item.hero.sprite} alt={item.title} />;
  }
  if (item.room) {
    return <StillArt image={item.room.thumb} alt={item.title} pixelated={false} />;
  }
  if (item.ticket) {
    return (
      <StillArt
        image={item.ticket.image}
        sprite={item.ticket.sprite}
        alt={item.title}
        pixelated={false}
      />
    );
  }
  return <Placeholder kind="upload" label="Картинка товара" />;
}
