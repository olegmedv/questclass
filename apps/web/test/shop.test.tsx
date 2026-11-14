// @vitest-environment jsdom
// FEAT-033: the learner's shop and «Мои желания» — filters and sub-filters, cards with
// «Ещё N монет», the confirmation «Потратишь N монет. Останется M.», toasts, a ticket opening the
// wishes, «Хочу использовать» and the history page by page.
import type { CatalogItemDto } from '@questclass/shared/catalog/dto';
import type { ShopDto, ShopItemDto } from '@questclass/shared/shop/dto';
import type { WishesDto, WishGroupDto } from '@questclass/shared/wishes/dto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_ITEMS,
  filterItems,
  remainingText,
  spendText,
  wishesCount,
} from '../src/features/shop/model';
import { errorReply, learner, mockApi, renderRoute, sessionApi, type ApiTable } from './helpers';

const base: Omit<CatalogItemDto, 'id' | 'kind' | 'title' | 'price'> = {
  seedKey: null,
  description: '',
  active: true,
  starter: false,
  version: 1,
  animated: false,
  hero: null,
  room: null,
  roomCategory: null,
  animation: null,
  ticket: null,
  rewardType: null,
  rewardAmount: null,
  editedFields: [],
};

function shopItem(
  item: Partial<CatalogItemDto> & Pick<CatalogItemDto, 'id' | 'kind' | 'title' | 'price'>,
  coins: number,
): ShopItemDto {
  const full = { ...base, ...item };
  const affordable = coins >= 0 && coins >= full.price;
  return { ...full, affordable, missingCoins: affordable ? 0 : full.price - coins };
}

const hero = (name: string, image: string) => ({
  characterKey: name,
  uploadId: null,
  name,
  image,
  sprite: null,
  footOffset: 4,
});

const room = (title: string, scene: 'static' | 'night-hotel' = 'static') => ({
  roomKey: title,
  uploadId: null,
  title,
  image: `/assets/game/rooms/${title}.webp`,
  thumb: `/assets/game/rooms/${title}-thumb.webp`,
  footAnchor: { x: 50, y: 75 },
  scene,
  sceneAssets: null,
});

function catalog(coins: number): ShopItemDto[] {
  return [
    shopItem(
      {
        id: 1,
        kind: 'outfit',
        title: 'Живой исследователь',
        price: 80,
        animated: true,
        hero: hero('blue-live', '/assets/blue-cover.webp'),
        animation: {
          key: 'blue-idle',
          uploadId: null,
          kind: 'hero',
          name: 'Синий',
          src: '/assets/blue-idle.webp',
          motion: null,
          poster: '/assets/blue-cover.webp',
          posterSprite: null,
          durationMs: 3000,
        },
      },
      coins,
    ),
    shopItem(
      {
        id: 2,
        kind: 'outfit',
        title: 'Космонавт',
        price: 40,
        description: 'Готов к полёту.',
        hero: hero('space', '/assets/space.webp'),
      },
      coins,
    ),
    shopItem(
      {
        id: 3,
        kind: 'room',
        title: 'Ночной отель',
        price: 200,
        animated: true,
        room: room('night-hotel', 'night-hotel'),
        roomCategory: 'night',
      },
      coins,
    ),
    shopItem(
      {
        id: 4,
        kind: 'room',
        title: 'Звёздная студия',
        price: 120,
        room: room('star'),
        roomCategory: 'day',
      },
      coins,
    ),
    shopItem(
      {
        id: 5,
        kind: 'ticket',
        title: '300 Robux',
        price: 300,
        description: '300 Robux от родителя.',
        ticket: {
          image: '/assets/wishes.webp',
          sprite: { cols: 2, rows: 2, col: 1, row: 0 },
          uploadId: null,
        },
        rewardType: 'robux',
        rewardAmount: 300,
      },
      coins,
    ),
  ];
}

const shop = (coins: number): ShopDto => ({ coins, items: catalog(coins) });

const robuxGroup = (patch: Partial<WishGroupDto> = {}): WishGroupDto => ({
  groupKey: 'robux',
  rewardType: 'robux',
  title: 'Robux',
  description: '300 Robux от родителя.',
  ticket: {
    image: '/assets/wishes.webp',
    sprite: { cols: 2, rows: 2, col: 1, row: 0 },
    uploadId: null,
  },
  remaining: 300,
  status: 'ready',
  requestedAt: null,
  ...patch,
});

const fries: WishGroupDto = {
  groupKey: 'wish:7:0123456789ab',
  rewardType: 'wish',
  title: 'Картошка из ДодоПиццы',
  description: 'Одна порция картошки.',
  ticket: null,
  remaining: 2,
  status: 'ready',
  requestedAt: null,
};

const noWishes: WishesDto = { groups: [], history: { items: [], nextCursor: null } };

function shopApi(coins: number, extra: ApiTable = {}): ApiTable {
  return sessionApi(learner, {
    'GET /api/me/wallet': { body: { xp: 10, coins, level: 1, levelXp: 10, xpToNext: 290 } },
    'GET /api/shop': { body: shop(coins) },
    'GET /api/me/wishes': { body: noWishes },
    ...extra,
  });
}

const cards = () =>
  screen.queryAllByRole('article').map((card) => within(card).getByRole('heading').textContent);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shop', () => {
  it('filters by section and sub-filter; live items come first as the server sent them', async () => {
    mockApi(shopApi(100));
    renderRoute('/shop');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Магазин желаний' }),
    ).toBeInTheDocument();
    expect(screen.getByText('За монеты: персонажи, комнаты, Robux и желания.')).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Космонавт' });
    const sections = screen.getByRole('radiogroup', { name: 'Разделы магазина' });
    expect(within(sections).getByRole('radio', { name: 'Всё' })).toBeChecked();
    expect(cards()).toEqual([
      'Живой исследователь',
      'Космонавт',
      'Ночной отель',
      'Звёздная студия',
      '300 Robux',
    ]);

    await userEvent.click(within(sections).getByRole('radio', { name: 'Герои' }));
    expect(cards()).toEqual(['Живой исследователь', 'Космонавт']);
    const heroes = screen.getByRole('radiogroup', { name: 'Какие герои' });
    await userEvent.click(within(heroes).getByRole('radio', { name: 'Анимированные' }));
    expect(cards()).toEqual(['Живой исследователь']);
    // The live hero comes alive only by its button.
    expect(screen.getByRole('button', { name: 'Оживить героя' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await userEvent.click(within(sections).getByRole('radio', { name: 'Комнаты' }));
    expect(
      screen.getByText('Комнату можно менять отдельно от персонажа. Покупка остаётся у тебя.'),
    ).toBeInTheDocument();
    const rooms = screen.getByRole('radiogroup', { name: 'Какие комнаты' });
    await userEvent.click(within(rooms).getByRole('radio', { name: 'Ночь' }));
    expect(cards()).toEqual(['Ночной отель']);
    expect(screen.getByRole('img', { name: 'Ночная комната' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Анимированная комната' })).toBeInTheDocument();
    // Arrows move the choice inside a filter.
    await userEvent.keyboard('{ArrowRight}');
    expect(within(rooms).getByRole('radio', { name: 'Специальные' })).toBeChecked();
    expect(screen.getByText('Здесь пока нет новых покупок')).toBeInTheDocument();
    expect(screen.getByText('Загляни в другую категорию.')).toBeInTheDocument();

    await userEvent.click(within(sections).getByRole('radio', { name: 'Желания' }));
    expect(cards()).toEqual(['300 Robux']);
  });

  it('a card without enough coins shows «Ещё N монет» and cannot be bought', async () => {
    mockApi(shopApi(100));
    renderRoute('/shop');
    const card = (await screen.findByRole('heading', { name: 'Ночной отель' })).closest('article');
    if (!card) throw new Error('no card');
    expect(within(card).getByText('Ещё 100 монет')).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: 'Ночной отель: 200 монет, ещё 100 монет' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Купить «Космонавт» за 40 монет' })).toBeEnabled();
  });

  it('a live room plays its scene by the button, without touch and sound', async () => {
    mockApi(shopApi(500));
    renderRoute('/shop');
    const card = (await screen.findByRole('heading', { name: 'Ночной отель' })).closest('article');
    if (!card) throw new Error('no card');
    expect(within(card).getByRole('img', { name: 'Ночной отель' })).toHaveAttribute(
      'src',
      '/assets/game/rooms/night-hotel-thumb.webp',
    );
    await userEvent.click(
      within(card).getByRole('button', { name: 'Посмотреть анимацию комнаты' }),
    );
    const scene = card.querySelector('.qc-scene');
    expect(scene).toHaveAttribute('data-room-scene', 'night-hotel');
    expect(within(card).queryByRole('button', { name: /Оживить комнату/ })).toBeNull();
    await userEvent.click(
      within(card).getByRole('button', { name: 'Остановить анимацию комнаты' }),
    );
    expect(card.querySelector('.qc-scene')).toBeNull();
  });

  it('the name opens «Подробнее» with the description', async () => {
    mockApi(shopApi(100));
    renderRoute('/shop');
    await userEvent.click(await screen.findByRole('button', { name: 'Космонавт' }));
    const dialog = screen.getByRole('dialog', { name: 'Космонавт' });
    expect(within(dialog).getByText('Готов к полёту.')).toBeInTheDocument();
    expect(within(dialog).getByText('Цена: 40 монет')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Понятно' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('buys after the confirmation; a retry after a lost answer reuses the request id', async () => {
    let attempt = 0;
    const { calls } = mockApi(
      shopApi(100, {
        'POST /api/shop/purchases': () => {
          attempt += 1;
          if (attempt === 1) return errorReply(503, 'unavailable', 'Сервер недоступен');
          return { status: 201, body: { purchase: { id: 9 }, coins: 60 } };
        },
      }),
    );
    renderRoute('/shop');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Купить «Космонавт» за 40 монет' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Забираем персонажа?' });
    expect(within(dialog).getByText('Потратишь 40 монет. Останется 60.')).toBeInTheDocument();
    expect(within(dialog).getByText('Готов к полёту.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить покупку' }));
    expect(await within(dialog).findByText('Сервер недоступен')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить покупку' }));

    expect(await screen.findByText('Новый образ в твоём гардеробе!')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    const posts = calls.filter((c) => c.method === 'POST' && c.path === '/api/shop/purchases');
    expect(posts).toHaveLength(2);
    const [first, second] = posts.map(
      (c) => c.body as { itemId: number; version: number; requestId: string },
    );
    expect(first).toMatchObject({ itemId: 2, version: 1 });
    expect(second?.requestId).toBe(first?.requestId);
  });

  it('«Пока не покупать» closes without buying; a changed item is refused with a message', async () => {
    const { calls } = mockApi(
      shopApi(500, {
        'POST /api/shop/purchases': errorReply(
          409,
          'item_changed',
          'Родитель изменил товар. Обнови магазин и посмотри новые условия',
        ),
      }),
    );
    renderRoute('/shop');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Купить «Ночной отель» за 200 монет' }),
    );
    let dialog = screen.getByRole('dialog', { name: 'Забираем комнату?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Пока не покупать' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await userEvent.click(
      screen.getByRole('button', { name: 'Купить «Ночной отель» за 200 монет' }),
    );
    dialog = screen.getByRole('dialog', { name: 'Забираем комнату?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить покупку' }));
    expect(
      await within(dialog).findByText(
        'Родитель изменил товар. Обнови магазин и посмотри новые условия',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Подтвердить покупку' })).toBeDisabled();
  });

  it('a negative balance blocks buying with a note', async () => {
    mockApi(shopApi(-20));
    renderRoute('/shop');
    expect(await screen.findByText(/Пока не хватает монет: баланс ниже нуля/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Космонавт: 40 монет, ещё 60 монет' }),
    ).toBeDisabled();
  });

  it('a bought ticket opens «Мои желания» with the toast', async () => {
    let wishes: WishesDto = noWishes;
    const { router } = (() => {
      mockApi(
        shopApi(500, {
          'POST /api/shop/purchases': () => {
            wishes = { groups: [robuxGroup()], history: { items: [], nextCursor: null } };
            return { status: 201, body: { purchase: { id: 3 }, coins: 200 } };
          },
          'GET /api/me/wishes': () => ({ body: wishes }),
        }),
      );
      return renderRoute('/shop');
    })();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Купить «300 Robux» за 300 монет' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Забираем билет?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить покупку' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Мои желания' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/wishes');
    expect(screen.getByText('Билет сохранён в «Мои желания»!')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Robux' })).toBeInTheDocument();
    expect(screen.getByText('300 Robux', { selector: 'p' })).toBeInTheDocument();
  });
});

describe('«Мои желания»', () => {
  it('«Хочу использовать» sends the request and the group becomes «Просьба отправлена»', async () => {
    let group = fries;
    const { calls } = mockApi(
      shopApi(0, {
        'GET /api/me/wishes': () => ({
          body: { groups: [robuxGroup(), group], history: { items: [], nextCursor: null } },
        }),
        'POST /api/me/wish-requests': () => {
          group = { ...fries, status: 'requested', requestedAt: '2026-11-14T10:00:00Z' };
          return { status: 201, body: group };
        },
      }),
    );
    renderRoute('/wishes');
    const card = (await screen.findByRole('heading', { name: 'Картошка из ДодоПиццы' })).closest(
      'article',
    );
    if (!card) throw new Error('no card');
    expect(within(card).getByText('Билетов: 2')).toBeInTheDocument();
    expect(within(card).getByText('Куплено · можно использовать')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Хочу использовать' }));
    expect(await within(card).findByText('Просьба отправлена')).toBeInTheDocument();
    expect(within(card).getByText('Родитель получил твою просьбу.')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Хочу использовать' })).toBeNull();
    expect(calls.find((c) => c.path === '/api/me/wish-requests')?.body).toEqual({
      groupKey: fries.groupKey,
    });
    // The header counts every wish and all Robux as one.
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Мои желания: 3' })).toHaveAttribute(
        'href',
        '/wishes',
      ),
    );
  });

  it('the history shows what the parent handed out, 20 at a time', async () => {
    const receipt = (id: number) => ({
      id,
      groupKey: 'robux',
      rewardType: 'robux' as const,
      title: 'Robux',
      amount: 100,
      at: '2026-11-13T10:00:00Z',
      allocations: [],
    });
    const { calls } = mockApi(
      shopApi(0, {
        'GET /api/me/wishes': () => {
          const last = calls.filter((c) => c.path.startsWith('/api/me/wishes')).at(-1);
          const more = last?.path.includes('cursor=50');
          return {
            body: {
              groups: [],
              history: more
                ? { items: [receipt(49)], nextCursor: null }
                : { items: [receipt(51), receipt(50)], nextCursor: '50' },
            },
          };
        },
      }),
    );
    renderRoute('/wishes');
    expect(await screen.findByText('Пока нет неиспользованных наград')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'В магазин' })).toHaveAttribute('href', '/shop');
    await userEvent.click(screen.getByRole('button', { name: 'Получено' }));
    const list = screen.getByRole('list', { name: 'Получено' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getAllByText('Выданы родителем · 13.11.2026')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3));
    expect(calls.some((c) => c.path === '/api/me/wishes?limit=20&cursor=50')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
  });
});

describe('shop model', () => {
  it('filters, texts and the wishes counter', () => {
    const items = catalog(100);
    expect(filterItems(items, ALL_ITEMS)).toHaveLength(5);
    expect(
      filterItems(items, { ...ALL_ITEMS, section: 'heroes', heroes: 'ordinary' }).map((i) => i.id),
    ).toEqual([2]);
    expect(
      filterItems(items, { ...ALL_ITEMS, section: 'rooms', rooms: 'animated' }).map((i) => i.id),
    ).toEqual([3]);
    expect(
      filterItems(items, { ...ALL_ITEMS, section: 'rooms', rooms: 'day' }).map((i) => i.id),
    ).toEqual([4]);
    expect(spendText(1, 22)).toBe('Потратишь 1 монета. Останется 21.');
    expect(spendText(3, 10)).toBe('Потратишь 3 монеты. Останется 7.');
    expect(spendText(1200, 1500)).toBe('Потратишь 1 200 монет. Останется 300.');
    expect(remainingText(robuxGroup())).toBe('300 Robux');
    expect(remainingText(fries)).toBe('Билетов: 2');
    expect(wishesCount([robuxGroup(), fries])).toBe(3);
    expect(wishesCount([])).toBe(0);
  });
});
