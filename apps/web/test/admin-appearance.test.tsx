// @vitest-environment jsdom
// FEAT-061: «Оформление» — built-in files by group, search, replace with a file or an earlier
// upload, put the built-in one back.
import type { AppearanceSlotDto } from '@questclass/shared/assets/appearance';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { admin, mockApi, renderRoute, sessionApi } from './helpers';

const LOGO = 'icons/star-v1-192.png';
const ROOM = 'game/rooms/room-bright.webp';

function slot(key: string, patch: Partial<AppearanceSlotDto> = {}): AppearanceSlotDto {
  return {
    key,
    files: [key],
    kind: 'image',
    group: key.startsWith('icons/') ? 'brand' : 'rooms',
    builtin: { width: 192, height: 192, bytes: 73_689, frames: null, durationMs: null },
    url: `/assets/${key}?v=0`,
    replacement: null,
    ...patch,
  };
}

const SOUND = slot('game/ui-audio/collection-blessing.mp3', {
  files: ['game/ui-audio/collection-blessing.mp3', 'game/ui-audio/collection-blessing.ogg'],
  kind: 'audio',
  group: 'sounds',
  builtin: { width: null, height: null, bytes: 30_000, frames: null, durationMs: null },
});

const replaced = slot(LOGO, {
  url: `/assets/${LOGO}?v=12`,
  replacement: {
    uploadId: 12,
    mime: 'image/png',
    sizeBytes: 2048,
    durationMs: null,
    updatedAt: '2026-11-15T10:00:00.000Z',
  },
});

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
  it('shows the files by group and finds them by name', async () => {
    mockApi(
      sessionApi(admin, {
        'GET /api/admin/appearance': { body: [slot(LOGO), slot(ROOM), SOUND] },
      }),
    );
    renderRoute('/admin/appearance');
    const brand = await screen.findByRole('button', { name: /Логотип и значки приложения · 1/ });
    expect(screen.getByRole('button', { name: /Комнаты · 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Звуки интерфейса · 1/ })).toBeInTheDocument();
    await userEvent.click(brand);
    expect(screen.getByRole('button', { name: `Заменить: star-v1-192.png` })).toBeVisible();

    await userEvent.type(screen.getByRole('textbox', { name: /Поиск/ }), 'room');
    expect(screen.getByRole('button', { name: 'Заменить: room-bright.webp' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Заменить: star-v1-192.png' })).toBeNull();
  });

  it('replaces the logo with a new file: uploaded for that file, then put in its place', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/appearance': { body: [slot(LOGO)] },
        'GET /api/admin/uploads': { body: [] },
        'POST /api/admin/uploads': { status: 201, body: upload(12) },
        [`PUT /api/admin/appearance/${LOGO}`]: { body: replaced },
      }),
    );
    renderRoute('/admin/appearance');
    await userEvent.type(await screen.findByRole('textbox', { name: /Поиск/ }), 'star');
    await userEvent.click(screen.getByRole('button', { name: 'Заменить: star-v1-192.png' }));
    const dialog = await screen.findByRole('dialog', { name: 'star-v1-192.png' });
    const input = dialog.querySelector<HTMLInputElement>('input[type=file]');
    if (!input) throw new Error('No file input');
    await userEvent.upload(input, new File(['png'], 'logo.png', { type: 'image/png' }));
    expect(await screen.findByText('Файл заменён')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.path).toBe(
      `/api/admin/uploads?for=${encodeURIComponent(LOGO)}`,
    );
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
      path: `/api/admin/appearance/${LOGO}`,
      body: { uploadId: 12 },
    });
  });

  it('takes an earlier upload of the same kind and puts the built-in file back', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/appearance': { body: [replaced] },
        'GET /api/admin/uploads': { body: [upload(12), upload(13), upload(14, 'audio')] },
        [`PUT /api/admin/appearance/${LOGO}`]: { body: replaced },
        [`DELETE /api/admin/appearance/${LOGO}`]: { body: slot(LOGO) },
      }),
    );
    renderRoute('/admin/appearance');
    await userEvent.click(await screen.findByRole('radio', { name: /Заменённые \(1\)/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Заменить: star-v1-192.png' }));
    const dialog = await screen.findByRole('dialog', { name: 'star-v1-192.png' });
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
