// @vitest-environment jsdom
// FEAT-042: the shop catalog in the admin area — list with kinds, an item from built-in art or an
// upload, switching it on, the version; handing out Robux (part of what is left) and wishes.
import type { CatalogItemDto, CatalogLibraryDto } from '@questclass/shared/catalog/dto';
import type { LearnerWishesDto } from '@questclass/shared/wishes/dto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { admin, errorReply, mockApi, renderRoute, sessionApi, type ApiTable } from './helpers';

const library: CatalogLibraryDto = {
  characters: [
    {
      key: 'blue',
      name: 'Синий исследователь',
      image: '/assets/game/characters/blue.webp',
      sprite: null,
      footOffset: 4,
    },
    {
      key: 'pizza',
      name: 'Пицца',
      image: '/assets/game/characters/pizza-boy.webp',
      sprite: null,
      footOffset: 4,
    },
  ],
  animations: [
    {
      key: 'blue-idle',
      uploadId: null,
      kind: 'hero',
      name: 'Синий машет',
      src: '/assets/a.webp',
      motion: null,
      poster: '/assets/p.webp',
      posterSprite: null,
      durationMs: 3000,
    },
    {
      key: 'astro-room',
      uploadId: null,
      kind: 'room',
      name: 'Звёзды',
      src: '/assets/r.webp',
      motion: null,
      poster: '/assets/rp.webp',
      posterSprite: null,
      durationMs: 3000,
    },
  ],
  rooms: [],
};

const base = {
  description: '',
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
  seedKey: null,
} satisfies Partial<CatalogItemDto>;

const pizza: CatalogItemDto = {
  ...base,
  id: 5,
  kind: 'outfit',
  title: 'Пицца',
  price: 40,
  active: false,
  hero: {
    characterKey: 'pizza',
    uploadId: null,
    name: 'Пицца',
    image: '/assets/game/characters/pizza-boy.webp',
    sprite: null,
    footOffset: 4,
  },
};
const robux: CatalogItemDto = {
  ...base,
  id: 6,
  kind: 'ticket',
  title: '300 Robux',
  price: 300,
  active: true,
  ticket: {
    image: '/assets/game/wishes.webp',
    sprite: { cols: 2, rows: 2, col: 1, row: 0 },
    uploadId: null,
  },
  rewardType: 'robux',
  rewardAmount: 300,
};

function shopApi(extra: ApiTable = {}): ApiTable {
  return sessionApi(admin, {
    'GET /api/admin/catalog/library': { body: library },
    'GET /api/admin/catalog/items': { body: [pizza, robux] },
    'GET /api/admin/catalog/items/5': { body: pizza },
    'GET /api/admin/uploads': { body: [] },
    ...extra,
  });
}

describe('/admin/shop', () => {
  it('lists items by kind and opens one', async () => {
    const { calls } = mockApi(shopApi());
    const { router } = renderRoute('/admin/shop');
    const list = await screen.findByRole('list', { name: 'Товары' });
    expect(within(list).getByText('Билет · 300 монет · 300 Robux')).toBeInTheDocument();
    expect(within(list).getByText('Скрыт')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Только то, что в магазине'));
    expect(within(list).queryByText('Пицца')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Билеты' }));
    await waitFor(() =>
      expect(calls.map((call) => call.path)).toContain('/api/admin/catalog/items?kind=ticket'),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Изменить: 300 Robux' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/shop/6'));
  });

  it('a new look from a built-in hero with its animation', async () => {
    const { calls } = mockApi(
      shopApi({
        'POST /api/admin/catalog/items': (body) => ({
          status: 201,
          body: { ...pizza, id: 9, ...(body as object) },
        }),
        'GET /api/admin/catalog/items/9': { body: { ...pizza, id: 9, title: 'Синий герой' } },
      }),
    );
    const { router } = renderRoute('/admin/shop/new');
    const form = await screen.findByRole('form', { name: 'Товар' });
    await userEvent.type(within(form).getByLabelText(/Название/), 'Синий герой');
    await userEvent.selectOptions(
      await within(form).findByLabelText('Герой'),
      'Синий исследователь',
    );
    await userEvent.selectOptions(within(form).getByLabelText('Как двигается'), 'Синий машет');
    expect(within(form).queryByRole('option', { name: 'Звёзды' })).not.toBeInTheDocument();
    await userEvent.click(within(form).getByText('Показывать в магазине ребёнка'));
    await userEvent.click(within(form).getByRole('button', { name: 'Создать товар' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/shop/9'));
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      kind: 'outfit',
      title: 'Синий герой',
      description: '',
      price: 100,
      active: true,
      characterKey: 'blue',
      roomKey: null,
      animationKey: 'blue-idle',
      imageKey: null,
      sprite: null,
      imageUploadId: null,
      animationUploadId: null,
      roomCategory: null,
      rewardType: null,
      rewardAmount: null,
    });
  });

  it('a Robux ticket gives its own amount; a refusal of the server is shown', async () => {
    const { calls } = mockApi(
      shopApi({
        'POST /api/admin/catalog/items': errorReply(
          400,
          'invalid_item',
          'Выберите картинку билета или загрузите свою',
        ),
      }),
    );
    renderRoute('/admin/shop/new');
    const form = await screen.findByRole('form', { name: 'Товар' });
    await userEvent.click(within(form).getByRole('radio', { name: 'Билет' }));
    await userEvent.type(within(form).getByLabelText(/Название/), '500 Robux');
    await userEvent.click(within(form).getByRole('radio', { name: 'Robux' }));
    await userEvent.type(within(form).getByLabelText('Robux за одну покупку'), '500{Tab}');
    await userEvent.click(within(form).getByRole('button', { name: 'Создать товар' }));
    expect(
      await within(form).findByText('Выберите картинку билета или загрузите свою'),
    ).toBeVisible();
    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      kind: 'ticket',
      rewardType: 'robux',
      rewardAmount: 500,
      characterKey: null,
      animationKey: null,
    });
  });

  it('an edit sends only what changed and shows the new version', async () => {
    const { calls } = mockApi(
      shopApi({
        'PATCH /api/admin/catalog/items/5': (body) => ({
          body: { ...pizza, ...(body as object), version: 2 },
        }),
      }),
    );
    renderRoute('/admin/shop/5');
    const form = await screen.findByRole('form', { name: 'Товар' });
    expect(within(form).getByText(/Версия 1 — покупка по старой версии не пройдёт/)).toBeVisible();
    await userEvent.click(within(form).getByText('Показывать в магазине ребёнка'));
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Сохранено, версия 2')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ active: true });
  });

  it('an own picture is uploaded and replaces the built-in hero', async () => {
    const upload = {
      id: 12,
      url: '/api/uploads/12',
      mime: 'image/png',
      sizeBytes: 2048,
      animated: false,
      durationMs: null,
      createdAt: '2026-11-14T10:00:00.000Z',
    };
    let uploads: unknown[] = [];
    const { calls } = mockApi(
      shopApi({
        'GET /api/admin/uploads': () => ({ body: uploads }),
        'POST /api/admin/uploads': () => {
          uploads = [upload];
          return { status: 201, body: upload };
        },
        'PATCH /api/admin/catalog/items/5': (body) => ({
          body: { ...pizza, ...(body as object), version: 2 },
        }),
      }),
    );
    renderRoute('/admin/shop/5');
    const form = await screen.findByRole('form', { name: 'Товар' });
    await userEvent.click(await within(form).findByRole('radio', { name: 'Своя загрузка' }));
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' });
    await userEvent.upload(within(form).getByLabelText('Или загрузите новую'), file);
    expect(await within(form).findByText('Загрузка № 12')).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
        characterKey: null,
        imageUploadId: 12,
      }),
    );
    const sent = calls.find((call) => call.path === '/api/admin/uploads' && call.method === 'POST');
    expect(sent).toBeDefined();
  });
});

describe('/admin/wishes', () => {
  const queue: LearnerWishesDto[] = [
    {
      learnerId: 2,
      learnerName: 'Саша',
      groups: [
        {
          groupKey: 'robux',
          rewardType: 'robux',
          title: 'Robux',
          description: '',
          ticket: null,
          remaining: 600,
          status: 'requested',
          requestedAt: '2026-11-14T09:00:00.000Z',
        },
        {
          groupKey: 'wish:7:abcdefabcdef',
          rewardType: 'wish',
          title: 'Сюрприз',
          description: 'Подарок от родителя',
          ticket: null,
          remaining: 2,
          status: 'requested',
          requestedAt: '2026-11-14T09:30:00.000Z',
        },
      ],
    },
  ];

  it('gives part of the Robux, showing what is left now and after', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/wishes': { body: queue },
        'POST /api/admin/learners/2/fulfillments': (body) => ({
          status: 201,
          body: {
            id: 1,
            groupKey: 'robux',
            rewardType: 'robux',
            title: 'Robux',
            amount: (body as { amount: number }).amount,
            at: '2026-11-14T10:00:00.000Z',
            allocations: [],
          },
        }),
      }),
    );
    renderRoute('/admin/wishes');
    const field = await screen.findByLabelText('Выдать Robux: Robux');
    expect(screen.getByText('Сейчас осталось: 600 · После отметки: 0')).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, '200{Tab}');
    expect(screen.getByText('Сейчас осталось: 600 · После отметки: 400')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Выдать Robux' }));
    expect(await screen.findByText('Выдано 200 Robux')).toBeInTheDocument();
    const body = calls.find((call) => call.method === 'POST')?.body as Record<string, unknown>;
    expect(body).toMatchObject({ groupKey: 'robux', amount: 200, expectedRemaining: 600 });
    expect(body['requestId']).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('confirms a wish; a change meanwhile is reported', async () => {
    mockApi(
      sessionApi(admin, {
        'GET /api/admin/wishes': { body: queue },
        'POST /api/admin/learners/2/fulfillments': errorReply(
          409,
          'remaining_changed',
          'Остаток изменился. Обновите страницу',
          { remaining: 1 },
        ),
      }),
    );
    renderRoute('/admin/wishes');
    expect(await screen.findByText('Осталось желаний: 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить выполнение' }));
    expect(
      await screen.findByText('Остаток изменился — список обновлён, проверьте ещё раз'),
    ).toBeInTheDocument();
  });

  it('says when nobody asks for anything', async () => {
    mockApi(sessionApi(admin, { 'GET /api/admin/wishes': { body: [] } }));
    renderRoute('/admin/wishes');
    expect(await screen.findByText('Никто ничего не просит')).toBeInTheDocument();
  });
});
