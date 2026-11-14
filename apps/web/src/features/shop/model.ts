// What the shop and «Мои желания» show: filters, labels, the confirmation text and the wishes
// counter of the header. Pure functions over the shared DTOs (spec/02 §2.5–2.6).
import type { RoomCategory } from '@questclass/shared/catalog/dto';
import type { ShopItemDto } from '@questclass/shared/shop/dto';
import type { WishGroupDto } from '@questclass/shared/wishes/dto';

export type ShopSection = 'all' | 'heroes' | 'rooms' | 'wishes';
export type HeroFilter = 'all' | 'ordinary' | 'animated';
export type RoomFilter = 'all' | RoomCategory | 'animated';

export interface ShopFilter {
  readonly section: ShopSection;
  readonly heroes: HeroFilter;
  readonly rooms: RoomFilter;
}

export const ALL_ITEMS: ShopFilter = { section: 'all', heroes: 'all', rooms: 'all' };

/** Items of the chosen section and sub-filter, in the server's order (live ones first). */
export function filterItems(items: readonly ShopItemDto[], filter: ShopFilter): ShopItemDto[] {
  return items.filter((item) => {
    switch (filter.section) {
      case 'all':
        return true;
      case 'heroes':
        return (
          item.kind === 'outfit' &&
          (filter.heroes === 'all' || item.animated === (filter.heroes === 'animated'))
        );
      case 'rooms':
        if (item.kind !== 'room') return false;
        if (filter.rooms === 'all') return true;
        if (filter.rooms === 'animated') return item.animated;
        return item.roomCategory === filter.rooms;
      case 'wishes':
        return item.kind === 'ticket';
    }
  });
}

export const ROOM_CATEGORY_LABELS: Record<RoomCategory, string> = {
  day: 'Дневная комната',
  night: 'Ночная комната',
  special: 'Особая комната',
};

const WHAT: Record<ShopItemDto['kind'], string> = {
  outfit: 'персонажа',
  room: 'комнату',
  ticket: 'билет',
};

/** Title of the confirmation: «Забираем персонажа?». */
export const confirmTitle = (item: Pick<ShopItemDto, 'kind'>) => `Забираем ${WHAT[item.kind]}?`;

const coinsWord = (n: number): string => {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return 'монета';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'монеты';
  return 'монет';
};

const number = (value: number) => value.toLocaleString('ru-RU');

/** «Потратишь 40 монет. Останется 10.» */
export function spendText(price: number, coins: number): string {
  return `Потратишь ${number(price)} ${coinsWord(price)}. Останется ${number(coins - price)}.`;
}

/** Toast after a purchase, by kind. */
export const PURCHASE_TOASTS: Record<ShopItemDto['kind'], string> = {
  outfit: 'Новый образ в твоём гардеробе!',
  room: 'Новая комната! Выбери её в разделе «Герой → Комнаты».',
  ticket: 'Билет сохранён в «Мои желания»!',
};

/** «Билетов: 2» or «300 Robux». */
export function remainingText(group: Pick<WishGroupDto, 'rewardType' | 'remaining'>): string {
  return group.rewardType === 'robux'
    ? `${number(group.remaining)} Robux`
    : `Билетов: ${number(group.remaining)}`;
}

/**
 * The number on the header's «Мои желания» chip: every unused wish counts, all Robux together
 * count as one.
 */
export function wishesCount(groups: readonly Pick<WishGroupDto, 'rewardType' | 'remaining'>[]) {
  return groups.reduce((n, g) => n + (g.rewardType === 'robux' ? 1 : g.remaining), 0);
}

/** A client id of one purchase intent (created when the confirmation opens). */
export function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}
