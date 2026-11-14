// @vitest-environment jsdom
// FEAT-034: the fitting room — the scene (room, hero on the foot point), the wardrobe where one
// tap wears a look or puts up a room, the dressing order «save → puff 260 ms → new hero 380 ms»
// (old hero stays on failure, no puff with reduced motion), device settings, and the worn hero
// on the home card.
import type { CharacterDto, OwnedItemDto } from '@questclass/shared/character/dto';
import type { LearnerProgressDto } from '@questclass/shared/progress/dto';
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_HERO_PREFERENCES,
  HERO_PREFERENCES_KEY,
  resetHeroPreferencesCache,
} from '../src/features/character/HeroSettings';
import { useDressing } from '../src/features/character/useCharacter';
import { errorReply, learner, mockApi, renderRoute, sessionApi, type ApiTable } from './helpers';

const heroArt = (image: string, footOffset = 4.4) => ({
  characterKey: image,
  uploadId: null,
  name: image,
  image: `/assets/${image}.webp`,
  sprite: null,
  footOffset,
});

const blue: OwnedItemDto = {
  itemId: 1,
  purchaseId: null,
  kind: 'outfit',
  title: 'Синий исследователь',
  animated: false,
  hero: heroArt('blue'),
  room: null,
  roomCategory: null,
  animation: null,
  ticket: null,
};

const space: OwnedItemDto = {
  ...blue,
  itemId: 4,
  purchaseId: 7,
  title: 'Космонавт',
  hero: heroArt('space', 6),
};

const vampire: OwnedItemDto = {
  ...blue,
  itemId: 9,
  purchaseId: 8,
  title: 'Вампир',
  animated: true,
  hero: heroArt('vampire-boy', 5.1),
  animation: {
    key: 'vampire-cape',
    uploadId: null,
    kind: 'hero',
    name: 'Вампир',
    src: '/assets/vampire-cape.webp',
    motion: null,
    poster: '/assets/vampire-boy.webp',
    posterSprite: null,
    durationMs: 3000,
  },
};

const roomItem = (itemId: number, title: string, y = 75): OwnedItemDto => ({
  itemId,
  purchaseId: itemId === 3 ? null : 11,
  kind: 'room',
  title,
  animated: false,
  hero: null,
  room: {
    roomKey: title,
    uploadId: null,
    title,
    image: `/assets/rooms/${itemId}.webp`,
    thumb: `/assets/rooms/${itemId}-thumb.webp`,
    footAnchor: { x: 50, y },
    scene: 'static',
    sceneAssets: null,
  },
  roomCategory: 'day',
  animation: null,
  ticket: null,
});

const cosy = roomItem(3, 'Уютная примерочная');
const studio = roomItem(12, 'Звёздная студия', 79.5);

function character(patch: Partial<CharacterDto> = {}): CharacterDto {
  return {
    name: '',
    look: blue,
    room: cosy,
    looks: [blue, space, vampire],
    rooms: [cosy, studio],
    ...patch,
  };
}

function heroApi(extra: ApiTable = {}, initial = character()): ApiTable {
  return sessionApi(learner, {
    'GET /api/me/wallet': { body: { xp: 0, coins: 0, level: 1, levelXp: 0, xpToNext: 300 } },
    'GET /api/me/character': { body: initial },
    ...extra,
  });
}

/** Holds the answers to PUT requests until the test releases them (to see the «saving» phase). */
function holdPuts(fetchMock: ReturnType<typeof mockApi>['fetchMock']) {
  const answer = fetchMock.getMockImplementation();
  if (!answer) throw new Error('no fetch mock');
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') await gate;
    return answer(input, init);
  });
  return () => release();
}

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

const scene = () => document.querySelector<HTMLElement>('.qc-scene');
const heroImage = () =>
  within(scene() as HTMLElement).getByRole('img', { name: /исследователь|Космонавт|Вампир/ });

beforeEach(() => {
  localStorage.clear();
  resetHeroPreferencesCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fitting room', () => {
  it('shows the room with the hero on its foot point and the wardrobe tabs', async () => {
    mockApi(heroApi());
    renderRoute('/hero');
    expect(await screen.findByRole('heading', { level: 1, name: 'Примерка' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Комната: Уютная примерочная' })).toHaveAttribute(
      'src',
      '/assets/rooms/3.webp',
    );
    const actor = document.querySelector<HTMLElement>('.qc-scene-actor');
    expect(actor?.style.getPropertyValue('--qc-foot-x')).toBe('50%');
    expect(actor?.style.getPropertyValue('--qc-foot-bottom')).toBe('25%');
    expect(actor?.style.getPropertyValue('--qc-foot-offset')).toBe('4.4%');
    expect(heroImage()).toHaveAccessibleName('Синий исследователь');
    expect(screen.getByText('Синий исследователь', { selector: 'p' })).toBeInTheDocument();

    const tabs = screen.getByRole('tablist', { name: 'Персонажи и комнаты' });
    expect(within(tabs).getByRole('tab', { name: 'Обычные' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const list = screen.getByRole('list', { name: 'Твои обычные персонажи' });
    expect(
      within(list).getByRole('button', { name: 'Синий исследователь, надет' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(within(list).getByRole('button', { name: 'Космонавт' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await userEvent.click(within(tabs).getByRole('tab', { name: 'Живые' }));
    expect(
      within(screen.getByRole('list', { name: 'Твои живые персонажи' })).getByRole('button', {
        name: 'Вампир, живой',
      }),
    ).toBeInTheDocument();
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Комнаты' }));
    expect(screen.getByRole('button', { name: 'Уютная примерочная, выбрана' })).toBeInTheDocument();
    expect(screen.getByText('Уютная примерочная', { selector: 'p' })).toBeInTheDocument();
  });

  it('one tap wears: save first, then the puff (260 ms) and the new hero (380 ms)', async () => {
    const { calls, fetchMock } = mockApi(
      heroApi({ 'PUT /api/me/character/look': { body: character({ look: space }) } }),
    );
    const release = holdPuts(fetchMock);
    renderRoute('/hero');
    await userEvent.click(await screen.findByRole('button', { name: 'Космонавт' }));
    // Saving: the old hero stays, the wardrobe waits.
    expect(scene()).toHaveAttribute('data-phase', 'saving');
    expect(heroImage()).toHaveAccessibleName('Синий исследователь');
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Сохраняем костюм…');
    expect(screen.getByRole('button', { name: 'Синий исследователь, надет' })).toBeDisabled();
    release();
    await waitFor(() => expect(scene()).toHaveAttribute('data-phase', 'cover'));
    expect(heroImage()).toHaveAccessibleName('Синий исследователь');
    expect(document.querySelector('.qc-dress')).toHaveAttribute('data-phase', 'cover');
    await waitFor(() => expect(scene()).toHaveAttribute('data-phase', 'reveal'));
    expect(heroImage()).toHaveAccessibleName('Космонавт');
    await waitFor(() => expect(scene()).toHaveAttribute('data-phase', 'idle'));
    expect(document.querySelector('.qc-dress')).toBeNull();
    expect(screen.getByText('Персонаж надет!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Космонавт, надет' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      document
        .querySelector<HTMLElement>('.qc-scene-actor')
        ?.style.getPropertyValue('--qc-foot-offset'),
    ).toBe('6%');
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ itemId: 4 });
  });

  it('a failed save keeps the old hero and explains why', async () => {
    mockApi(
      heroApi({
        'PUT /api/me/character/look': errorReply(
          403,
          'not_owned',
          'Сначала открой этот скин в магазине',
        ),
      }),
    );
    renderRoute('/hero');
    await userEvent.click(await screen.findByRole('button', { name: 'Космонавт' }));
    expect(await screen.findByText('Сначала открой этот скин в магазине')).toBeInTheDocument();
    expect(scene()).toHaveAttribute('data-phase', 'idle');
    expect(heroImage()).toHaveAccessibleName('Синий исследователь');
    expect(screen.getByRole('button', { name: 'Синий исследователь, надет' })).toBeEnabled();
  });

  it('with reduced motion the hero changes without the puff', async () => {
    stubReducedMotion(true);
    const phases: string[] = [];
    mockApi(heroApi({ 'PUT /api/me/character/look': { body: character({ look: space }) } }));
    renderRoute('/hero');
    await userEvent.click(await screen.findByRole('button', { name: 'Космонавт' }));
    const observer = new MutationObserver(() => phases.push(scene()?.dataset['phase'] ?? ''));
    observer.observe(scene() as HTMLElement, { attributes: true });
    await waitFor(() => expect(heroImage()).toHaveAccessibleName('Космонавт'));
    observer.disconnect();
    expect(scene()).toHaveAttribute('data-phase', 'idle');
    expect(phases).not.toContain('cover');
    expect(phases).not.toContain('reveal');
  });

  it('a room is put up with one tap', async () => {
    const { calls } = mockApi(
      heroApi({ 'PUT /api/me/character/room': { body: character({ room: studio }) } }),
    );
    renderRoute('/hero');
    await userEvent.click(await screen.findByRole('tab', { name: 'Комнаты' }));
    await userEvent.click(screen.getByRole('button', { name: 'Звёздная студия' }));
    expect(await screen.findByText('Комната выбрана!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Звёздная студия, выбрана' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ itemId: 12 });
    // The hero now stands on the new room's foot point.
    expect(
      document
        .querySelector<HTMLElement>('.qc-scene-actor')
        ?.style.getPropertyValue('--qc-foot-bottom'),
    ).toBe('20.5%');
  });

  it('the live tab without live heroes points to the shop; a worn live hero opens its tab', async () => {
    mockApi(heroApi({}, character({ looks: [blue, space] })));
    const first = renderRoute('/hero');
    await userEvent.click(await screen.findByRole('tab', { name: 'Живые' }));
    expect(screen.getByText('Живые скины можно получить в магазине.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'В магазин' })).toHaveAttribute('href', '/shop');
    first.unmount();

    mockApi(heroApi({}, character({ look: vampire })));
    renderRoute('/hero');
    expect(await screen.findByRole('tab', { name: 'Живые' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Вампир, живой, надет' })).toBeInTheDocument();
    // On the «Герой» screen the worn live hero moves by itself; the button stops it.
    expect(screen.getByRole('button', { name: 'Остановить героя' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('hero settings', () => {
  it('device settings are stored on this device; the name is saved on the server', async () => {
    const { calls } = mockApi(
      heroApi({
        'PUT /api/me/character/name': (body) => ({
          body: character({ name: (body as { name: string }).name }),
        }),
      }),
    );
    const view = renderRoute('/hero');
    await userEvent.click(await screen.findByRole('button', { name: 'Настройки героя' }));
    let dialog = screen.getByRole('dialog', { name: 'Настройки героя' });
    const motion = within(dialog).getByRole('switch', { name: 'Герой двигается сам' });
    expect(motion).toBeChecked();
    await userEvent.click(motion);
    const sounds = within(dialog).getByRole('switch', { name: 'Звуки комнаты' });
    expect(sounds).not.toBeChecked();
    expect(within(dialog).getByRole('switch', { name: 'Музыка' })).toBeDisabled();
    await userEvent.click(sounds);
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Музыка' }));
    expect(JSON.parse(localStorage.getItem(HERO_PREFERENCES_KEY) ?? '{}')).toEqual({
      ...DEFAULT_HERO_PREFERENCES,
      characterMotion: false,
      roomSounds: true,
      music: true,
    });

    // An empty name is refused before sending.
    const name = within(dialog).getByRole('textbox', { name: 'Имя героя' });
    await userEvent.type(name, '   ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(within(dialog).getByText('Имя не может быть пустым')).toBeInTheDocument();
    await userEvent.clear(name);
    await userEvent.type(name, '  Гром  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ name: 'Гром' });
    view.unmount();

    // A new visit reads the device settings back.
    resetHeroPreferencesCache();
    mockApi(heroApi({}, character({ name: 'Гром' })));
    renderRoute('/hero');
    await userEvent.click(await screen.findByRole('button', { name: 'Настройки героя' }));
    dialog = screen.getByRole('dialog', { name: 'Настройки героя' });
    expect(within(dialog).getByRole('switch', { name: 'Герой двигается сам' })).not.toBeChecked();
    expect(within(dialog).getByRole('switch', { name: 'Музыка' })).toBeChecked();
    expect(within(dialog).getByRole('textbox', { name: 'Имя героя' })).toHaveValue('Гром');
  });
});

describe('useDressing', () => {
  it('saves first, covers, reveals; a failure returns to idle with the old value', async () => {
    const waits: { ms: number; done: () => void }[] = [];
    const wait = (ms: number) => new Promise<void>((done) => waits.push({ ms, done }));
    const { result, rerender } = renderHook(
      ({ value }) => useDressing(value, { motion: true, wait }),
      {
        initialProps: { value: 'old' },
      },
    );
    let save: () => void = () => {};
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.dress(() => new Promise<void>((resolve) => (save = resolve)));
    });
    expect(result.current.phase).toBe('saving');
    rerender({ value: 'new' });
    expect(result.current.shown).toBe('old');
    await act(async () => {
      save();
      await Promise.resolve();
    });
    expect(result.current.phase).toBe('cover');
    expect(result.current.shown).toBe('old');
    expect(waits.map((w) => w.ms)).toEqual([260]);
    await act(async () => {
      waits[0]?.done();
      await Promise.resolve();
    });
    expect(result.current.phase).toBe('reveal');
    expect(result.current.shown).toBe('new');
    expect(waits.map((w) => w.ms)).toEqual([260, 380]);
    await act(async () => {
      waits[1]?.done();
      await pending;
    });
    expect(result.current.phase).toBe('idle');

    await act(async () => {
      await expect(result.current.dress(() => Promise.reject(new Error('нет')))).rejects.toThrow(
        'нет',
      );
    });
    expect(result.current.phase).toBe('idle');
    expect(result.current.shown).toBe('new');
  });
});

describe('home', () => {
  it('the lesson card shows the worn hero', async () => {
    const progress: LearnerProgressDto = {
      mode: 'rotation',
      nextTaskId: 5,
      assignedTotal: 0,
      assignedDone: 0,
      tasks: [
        {
          taskId: 5,
          title: 'Урок',
          type: 'quiz',
          subjectId: null,
          assigned: false,
          epoch: 0,
          state: 'none',
          completed: false,
          score: null,
          total: null,
          startedAt: null,
          completedAt: null,
          closedBy: null,
          closedReason: null,
          available: true,
          lockReason: null,
        },
      ],
    };
    mockApi(
      heroApi(
        {
          'GET /api/me/progress': { body: progress },
          'GET /api/tasks': {
            body: [
              {
                id: 5,
                type: 'quiz',
                subjectId: null,
                title: 'Урок',
                description: '',
                config: {},
                xp: 100,
                coins: 350,
                releaseAt: null,
                lessonDate: null,
                sort: 0,
                assigned: false,
              },
            ],
          },
          'GET /api/subjects': { body: [] },
        },
        character({ look: vampire }),
      ),
    );
    renderRoute('/');
    const card = await screen.findByRole('article', { name: 'Урок' });
    await waitFor(() =>
      expect(within(card).getByRole('img', { name: 'Твой герой' })).toHaveAttribute(
        'src',
        '/assets/vampire-boy.webp',
      ),
    );
  });
});
