// @vitest-environment jsdom
// FEAT-061/063: «Оформление» — the app's own files on top (one logo for every size), every other
// built-in file by where it shows, named by its owner and linked to its editor; replace with a
// file or an earlier upload, put the built-in one back.
import type { AppearanceSlotDto } from '@questclass/shared/assets/appearance';
import type { AssetUseDto } from '@questclass/shared/assets/uses';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { admin, mockApi, renderRoute, sessionApi } from './helpers';

const LOGO = 'icons/star-v1-192.png';
const TOUCH = 'icons/star-v1-180.png';
const TAB = 'icons/star-v1-32.png';
const CANDLES = 'game/rooms/night-hotel/candles_flicker.webp';
const MATH = 'game/subjects-pixel/math.webp';

const appUse = (area: AssetUseDto['area'], part: string, place: string): AssetUseDto => ({
  area,
  role: 'app',
  owner: null,
  part,
  place,
  href: null,
});

function slot(key: string, uses: AssetUseDto[], patch: Partial<AppearanceSlotDto> = {}) {
  return {
    key,
    files: [key],
    kind: 'image',
    area: uses[0]?.area ?? 'unused',
    uses,
    builtin: { width: 192, height: 192, bytes: 73_689, frames: null, durationMs: null },
    url: `/assets/${key}?v=0`,
    replacement: null,
    ...patch,
  } satisfies AppearanceSlotDto;
}

const logo = slot(LOGO, [appUse('brand', 'Логотип', 'Шапка кабинета и ученика, экран входа')]);
const touch = slot(TOUCH, [appUse('brand', 'Значок на телефоне', 'Экран «Домой»')], {
  builtin: { width: 180, height: 180, bytes: 9_000, frames: null, durationMs: null },
});
const tab = slot(TAB, [appUse('brand', 'Значок вкладки', 'Вкладка браузера')], {
  builtin: { width: 32, height: 32, bytes: 1_000, frames: null, durationMs: null },
});
const sound = slot(
  'game/ui-audio/collection-blessing.mp3',
  [appUse('sounds', 'Звук награды', 'Когда ученик получает монеты и XP')],
  {
    files: ['game/ui-audio/collection-blessing.mp3', 'game/ui-audio/collection-blessing.ogg'],
    kind: 'audio',
    builtin: { width: null, height: null, bytes: 30_000, frames: null, durationMs: null },
  },
);
const candles = slot(CANDLES, [
  {
    area: 'rooms',
    role: 'layer',
    owner: 'Ночной отель',
    part: 'Слой сцены: свечи',
    place: 'Магазин и комната героя',
    href: '/admin/shop/7',
  },
]);
const math = slot(MATH, [
  {
    area: 'subjects',
    role: 'icon',
    owner: 'Математика',
    part: 'Значок предмета',
    place: 'Задания и уроки ученика',
    href: '/admin/subjects',
  },
]);

const replacedLogo = {
  ...logo,
  url: `/assets/${LOGO}?v=12`,
  replacement: {
    uploadId: 12,
    mime: 'image/png',
    sizeBytes: 2048,
    durationMs: null,
    updatedAt: '2026-11-15T10:00:00.000Z',
  },
} satisfies AppearanceSlotDto;

const upload = (id: number, kind: 'image' | 'audio' = 'image') => ({
  id,
  url: `/api/uploads/${id}`,
  mime: kind === 'audio' ? 'audio/mpeg' : 'image/png',
  kind,
  sizeBytes: 2048,
  animated: false,
  durationMs: null,
  createdAt: '2026-11-15T09:00:00.000Z',
});

describe('/admin/appearance', () => {
  it('the app files on top by what they are; the rest by where they show, found by owner', async () => {
    mockApi(
      sessionApi(admin, {
        'GET /api/admin/appearance': { body: [logo, sound, candles, math] },
        'GET /api/admin/uploads': { body: [] },
      }),
    );
    renderRoute('/admin/appearance');
    const logoCard = await screen.findByRole('region', { name: 'Логотип' });
    expect(
      within(logoCard).getByRole('button', {
        name: 'Заменить: Логотип, Шапка кабинета и ученика, экран входа',
      }),
    ).toBeVisible();
    const sounds = screen.getByRole('region', { name: 'Звуки' });
    // A sound is a row of a list (no picture to show), opening the same dialog.
    await userEvent.click(within(sounds).getByRole('button', { name: /Звук награды/ }));
    const soundDialog = await screen.findByRole('dialog', { name: 'Звук награды' });
    expect(within(soundDialog).getByRole('button', { name: 'Прослушать' })).toBeVisible();
    await userEvent.click(within(soundDialog).getByRole('button', { name: 'Готово' }));
    expect(screen.getByRole('button', { name: /Магазин: комнаты · 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Значки предметов · 1/ })).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: /Поиск/ }), 'отель');
    const tile = screen.getByRole('button', { name: 'Заменить: Ночной отель, Слой сцены: свечи' });
    expect(
      screen.queryByRole('button', { name: 'Заменить: Математика, Значок предмета' }),
    ).toBeNull();
    await userEvent.click(tile);
    const dialog = await screen.findByRole('dialog', { name: 'Ночной отель — слой сцены: свечи' });
    expect(
      within(dialog).getByRole('link', { name: /Ночной отель — слой сцены: свечи/ }),
    ).toHaveAttribute('href', '/admin/shop/7');
  });

  it('one logo for every size: uploaded once for the main logo, put in place of each', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/appearance': { body: [touch, logo, tab] },
        'POST /api/admin/uploads': { status: 201, body: upload(12) },
        [`PUT /api/admin/appearance/${LOGO}`]: { body: replacedLogo },
        [`PUT /api/admin/appearance/${TOUCH}`]: { body: touch },
        [`PUT /api/admin/appearance/${TAB}`]: { body: tab },
      }),
    );
    renderRoute('/admin/appearance');
    const logoCard = await screen.findByRole('region', { name: 'Логотип' });
    const input = logoCard.querySelector<HTMLInputElement>('input[type=file]');
    if (!input) throw new Error('No file input');
    await userEvent.upload(input, new File(['png'], 'logo.png', { type: 'image/png' }));
    expect(await screen.findByText('Логотип заменён')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
      `/api/admin/uploads?for=${encodeURIComponent(LOGO)}`,
    ]);
    expect(calls.filter((c) => c.method === 'PUT')).toEqual([
      expect.objectContaining({ path: `/api/admin/appearance/${LOGO}`, body: { uploadId: 12 } }),
      expect.objectContaining({ path: `/api/admin/appearance/${TOUCH}`, body: { uploadId: 12 } }),
      expect.objectContaining({ path: `/api/admin/appearance/${TAB}`, body: { uploadId: 12 } }),
    ]);
  });

  it('takes an earlier upload of the same kind and puts the built-in file back', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/appearance': { body: [replacedLogo] },
        'GET /api/admin/uploads': { body: [upload(12), upload(13), upload(14, 'audio')] },
        [`PUT /api/admin/appearance/${LOGO}`]: { body: replacedLogo },
        [`DELETE /api/admin/appearance/${LOGO}`]: { body: logo },
      }),
    );
    renderRoute('/admin/appearance');
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Заменить: Логотип, Шапка кабинета и ученика, экран входа',
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Логотип' });
    expect(within(dialog).getByText('Сейчас: своя')).toBeInTheDocument();
    const earlier = within(dialog).getByRole('combobox', { name: /загруженный раньше/ });
    // The current upload and the sound are not offered for a picture.
    await waitFor(() => expect(within(earlier).getAllByRole('option')).toHaveLength(2));
    await userEvent.selectOptions(earlier, '13');
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ uploadId: 13 }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Вернуть встроенный' }));
    expect(await screen.findByText('Встроенный файл возвращён')).toBeInTheDocument();
    expect(
      calls.some((c) => c.method === 'DELETE' && c.path === `/api/admin/appearance/${LOGO}`),
    ).toBe(true);
  });
});
