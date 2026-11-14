// @vitest-environment jsdom
// FEAT-031: the video lesson — the watch tracker (intervals, batches, retries, beacon), the
// hook on a real <video> element, and the Player: resume, «Просмотрено N% · Нужно M%»,
// «Перейти к вопросам» gated by the rule, the strip per video on this device, the hint fragment.
import type { AttemptDto } from '@questclass/shared/attempts/dto';
import type { LearnerProgressDto } from '@questclass/shared/progress/dto';
import type {
  WatchBatch,
  WatchProgressDto,
  WatchSessionDto,
} from '@questclass/shared/task-types/video_lesson/dto';
import type { LearnerTaskDto } from '@questclass/shared/tasks/dto';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/client';
import {
  useWatchTracking,
  WatchTracker,
  type TrackerTimers,
  type WatchTransport,
} from '../src/task-types/video_lesson/useWatchTracking';
import { learner, mockApi, renderRoute, sessionApi, type ApiTable } from './helpers';

const progressDto = (patch: Partial<WatchProgressDto> = {}): WatchProgressDto => ({
  taskId: 9,
  mediaId: 7,
  mode: 'percent',
  durationSec: 300,
  watchedSec: 0,
  percent: 0,
  requiredPercent: 70,
  lastPosition: 0,
  confirmed: false,
  satisfied: false,
  ...patch,
});

function fakeTransport(
  reply: () => Promise<WatchProgressDto> = () => Promise.resolve(progressDto()),
) {
  const sent: WatchBatch[] = [];
  const beacons: WatchBatch[] = [];
  const transport: WatchTransport = {
    send: vi.fn((_url: string, batch: WatchBatch) => {
      sent.push(batch);
      return reply();
    }),
    beacon: vi.fn((_url: string, batch: WatchBatch) => {
      beacons.push(batch);
    }),
  };
  return { transport, sent, beacons };
}

function manualTimers() {
  const pending: { callback: () => void; ms: number }[] = [];
  const timers: TrackerTimers = {
    setTimeout: (callback, ms) => {
      const entry = { callback, ms };
      pending.push(entry);
      return entry;
    },
    clearTimeout: (handle) => {
      const index = pending.indexOf(handle as (typeof pending)[number]);
      if (index >= 0) pending.splice(index, 1);
    },
  };
  return { timers, pending };
}

describe('WatchTracker', () => {
  const url = '/api/watch/9/sessions/3/intervals';

  it('joins continuous playback into one interval and splits at a seek', async () => {
    const { transport, sent } = fakeTransport();
    const tracker = new WatchTracker({ url, kind: 'main', transport });
    for (const t of [10, 10.25, 10.5, 11, 12]) tracker.tick(t);
    tracker.tick(40); // a jump forward is a seek, not watching
    tracker.tick(40.5);
    tracker.close();
    await tracker.flush(40.5);
    expect(sent).toEqual([
      {
        intervals: [
          { start: 10, end: 12, kind: 'main' },
          { start: 40, end: 40.5, kind: 'main' },
        ],
        position: 40.5,
      },
    ]);
    expect(tracker.pending).toEqual([]);
  });

  it('a periodic cut sends what is played so far and keeps going', async () => {
    const { transport, sent } = fakeTransport();
    const tracker = new WatchTracker({ url, kind: 'main', transport });
    tracker.tick(0);
    tracker.tick(1);
    tracker.cut();
    tracker.tick(2);
    tracker.close();
    await tracker.flush();
    expect(sent[0]?.intervals).toEqual([
      { start: 0, end: 1, kind: 'main' },
      { start: 1, end: 2, kind: 'main' },
    ]);
  });

  it('keeps the queue on a network failure and retries with a growing delay', async () => {
    let fail = true;
    const onProgress = vi.fn();
    const { transport, sent } = fakeTransport(() =>
      fail
        ? Promise.reject(new ApiError(0, 'network_error', 'Нет связи'))
        : Promise.resolve(progressDto({ percent: 1 })),
    );
    const { timers, pending } = manualTimers();
    const tracker = new WatchTracker({ url, kind: 'main', transport, timers, onProgress });
    tracker.tick(0);
    tracker.tick(1);
    tracker.close();
    await tracker.flush(1);
    expect(tracker.pending).toHaveLength(1);
    expect(pending.map((p) => p.ms)).toEqual([2000]);
    pending.shift()!.callback();
    await vi.waitFor(() => expect(pending.map((p) => p.ms)).toEqual([4000]));
    fail = false;
    pending.shift()!.callback();
    await vi.waitFor(() => expect(onProgress).toHaveBeenCalled());
    expect(tracker.pending).toHaveLength(0);
    expect(sent).toHaveLength(3);
  });

  it('stops for good when the session is closed by another tab', async () => {
    const onFatal = vi.fn();
    const { transport, sent } = fakeTransport(() =>
      Promise.reject(new ApiError(409, 'session_closed', 'Видео открыто в другом окне.')),
    );
    const tracker = new WatchTracker({ url, kind: 'main', transport, onFatal });
    tracker.tick(0);
    tracker.tick(1);
    tracker.close();
    await tracker.flush();
    expect(onFatal).toHaveBeenCalledWith('Видео открыто в другом окне.');
    tracker.tick(2);
    tracker.tick(3);
    tracker.close();
    await tracker.flush();
    expect(sent).toHaveLength(1);
  });

  it('a hint fragment is reported as `help`; the page leaving sends a beacon', () => {
    const { transport, beacons } = fakeTransport();
    const tracker = new WatchTracker({ url, kind: 'help', transport });
    tracker.tick(5);
    tracker.tick(6);
    tracker.beacon(6);
    expect(beacons).toEqual([{ intervals: [{ start: 5, end: 6, kind: 'help' }], position: 6 }]);
    expect(tracker.pending).toEqual([]);
  });
});

/** A <video> whose state the test sets (jsdom has no media pipeline). */
function controllable(video: HTMLVideoElement) {
  const state = { time: 0, paused: true, ready: 4 };
  Object.defineProperty(video, 'readyState', { configurable: true, get: () => state.ready });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => state.time,
    set: (value: number) => {
      state.time = value;
    },
  });
  Object.defineProperty(video, 'paused', { configurable: true, get: () => state.paused });
  return {
    play(at: number) {
      state.paused = false;
      state.time = at;
      fireEvent.playing(video);
    },
    at(time: number) {
      state.time = time;
      fireEvent.timeUpdate(video);
    },
    pause() {
      state.paused = true;
      fireEvent.pause(video);
    },
    /** The player went away: the element is emptied and reports 0. */
    reset() {
      state.ready = 0;
      state.time = 0;
      fireEvent.timeUpdate(video);
    },
  };
}

function Harness({ transport, kind }: { transport: WatchTransport; kind?: 'main' | 'help' }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const tracking = useWatchTracking({ taskId: 9, sessionId: 3, video, transport, kind });
  return (
    <>
      <video ref={setVideo} data-testid="video" />
      {tracking.savedAt !== null && <p>сохранено</p>}
    </>
  );
}

describe('useWatchTracking', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends on pause, every 20 s while playing and a beacon on pagehide', async () => {
    vi.useFakeTimers();
    const { transport, sent, beacons } = fakeTransport();
    render(<Harness transport={transport} />);
    const video = controllable(screen.getByTestId<HTMLVideoElement>('video'));
    video.play(0);
    for (let t = 0.25; t <= 3; t += 0.25) video.at(t);
    video.pause();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(sent).toEqual([{ intervals: [{ start: 0, end: 3, kind: 'main' }], position: 3 }]);
    expect(screen.getByText('сохранено')).toBeInTheDocument();

    video.play(3);
    for (let t = 3.25; t <= 8; t += 0.25) video.at(t);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(sent[1]).toEqual({ intervals: [{ start: 3, end: 8, kind: 'main' }], position: 8 });

    video.at(8.25);
    video.at(8.5);
    fireEvent(window, new Event('pagehide'));
    expect(beacons).toEqual([{ intervals: [{ start: 8, end: 8.5, kind: 'main' }], position: 8.5 }]);
  });

  it('leaving the video keeps the saved place (the emptied element reports 0)', async () => {
    const { transport, sent } = fakeTransport();
    const { unmount } = render(<Harness transport={transport} />);
    const video = controllable(screen.getByTestId<HTMLVideoElement>('video'));
    video.play(40);
    video.at(40.5);
    video.at(41);
    video.reset();
    unmount();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ intervals: [{ start: 40, end: 41, kind: 'main' }], position: 41 });
  });

  it('marks hint playback as `help`', async () => {
    const { transport, sent } = fakeTransport();
    render(<Harness transport={transport} kind="help" />);
    const video = controllable(screen.getByTestId<HTMLVideoElement>('video'));
    video.play(10);
    video.at(10.5);
    video.at(11);
    video.pause();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    // Intervals only: the hint does not move the lesson's resume point.
    expect(sent[0]).toEqual({ intervals: [{ start: 10, end: 11, kind: 'help' }] });
  });
});

// ---- the Player ----------------------------------------------------------------------------

const task: LearnerTaskDto = {
  id: 9,
  type: 'video_lesson',
  subjectId: 2,
  title: 'Сложение в пределах 100',
  description: '',
  config: { mediaId: 7, watchMode: 'percent', shutter: { enabled: true, heightPct: 9 } },
  xp: 100,
  coins: 350,
  releaseAt: null,
  lessonDate: null,
  sort: 0,
  assigned: false,
};

const myProgress: LearnerProgressDto = {
  mode: 'rotation',
  nextTaskId: 9,
  assignedTotal: 0,
  assignedDone: 0,
  tasks: [],
};

const session = (progress: Partial<WatchProgressDto> = {}): WatchSessionDto => ({
  sessionId: 3,
  media: { id: 7, kind: 'mp4', durationSec: 300, src: '/api/media/7/video.mp4' },
  progress: progressDto(progress),
});

function lessonApi(sessionProgress: Partial<WatchProgressDto>, extra: ApiTable = {}): ApiTable {
  return sessionApi(learner, {
    'GET /api/tasks/9': { body: task },
    'GET /api/subjects': {
      body: [{ id: 2, key: 'math', name: 'Математика', icon: null, sort: 1, archived: false }],
    },
    'GET /api/me/progress': { body: myProgress },
    'GET /api/me/wallet': { body: { xp: 0, coins: 0, level: 1, levelXp: 0, xpToNext: 300 } },
    'POST /api/watch/9/sessions': { status: 201, body: session(sessionProgress) },
    ...extra,
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('video lesson player', () => {
  it('opens a watching session, resumes and gates the questions by the rule', async () => {
    const { calls } = mockApi(lessonApi({ percent: 40, lastPosition: 42 }));
    renderRoute('/tasks/9');
    expect(await screen.findByRole('group', { name: /Видео урока/ })).toBeInTheDocument();
    expect(
      calls.filter((c) => c.method === 'POST' && c.path === '/api/watch/9/sessions'),
    ).toHaveLength(1);
    expect(screen.getByText('Продолжаем с места остановки: 0:42.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Просмотрено 40%' })).toHaveAttribute(
      'aria-valuetext',
      'Нужно 70%',
    );
    expect(screen.getByText('Посмотри 70% видео — вопросы откроются.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перейти к вопросам' })).toBeDisabled();
    expect(screen.getByText('Награда за пройденный тест')).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Шаги задания' });
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Видео: сейчас', 'Вопросы: впереди', 'Награда: впереди']);
  });

  it('once the rule is met «Перейти к вопросам» starts the questions', async () => {
    const attempt: AttemptDto = {
      id: 21,
      taskId: 9,
      epoch: 0,
      status: 'in_progress',
      startedAt: '2026-11-14T10:00:00.000Z',
      finishedAt: null,
      questions: [
        {
          id: 1,
          position: 0,
          text: 'Сколько будет 2 + 2?',
          image: null,
          options: [
            { id: 'a', text: '4', image: null },
            { id: 'b', text: '5', image: null },
            { id: 'c', text: '6', image: null },
            { id: 'd', text: '7', image: null },
          ],
          answer: null,
        },
      ],
      result: null,
      retry: null,
    };
    mockApi(
      lessonApi(
        { percent: 85, satisfied: true },
        { 'POST /api/tasks/9/attempts': { status: 201, body: attempt } },
      ),
    );
    renderRoute('/tasks/9');
    const go = await screen.findByRole('button', { name: 'Перейти к вопросам' });
    await vi.waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    expect(await screen.findByText('Вопрос 1 из 1')).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Шаги задания' });
    expect(within(steps).getAllByRole('listitem')[0]).toHaveTextContent('Видео: готово');
  });

  it('without a watching rule the questions are open at once', async () => {
    mockApi(lessonApi({ mode: 'none', requiredPercent: null, satisfied: true }));
    renderRoute('/tasks/9');
    expect(
      await screen.findByText('Можно переходить к вопросам, когда будешь готов.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перейти к вопросам' })).toBeEnabled();
  });

  it('the strip over the subtitles is remembered per video on this device', async () => {
    mockApi(lessonApi({}));
    renderRoute('/tasks/9');
    const handle = await screen.findByRole('slider', { name: 'Высота чёрной полосы' });
    expect(handle).toHaveAttribute('aria-valuenow', '9');
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(JSON.parse(localStorage.getItem('quest-video-shutter:7') ?? 'null')).toEqual({
      heightPct: 10,
      visible: true,
    });
    await userEvent.click(screen.getAllByRole('button', { name: 'Открыть низ' })[0]!);
    expect(screen.queryByRole('slider', { name: 'Высота чёрной полосы' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('quest-video-shutter:7') ?? 'null')).toEqual({
      heightPct: 10,
      visible: false,
    });
  });

  it('a video opened in another tab is reported', async () => {
    mockApi(
      lessonApi(
        {},
        {
          'POST /api/watch/9/sessions/3/intervals': {
            status: 409,
            body: {
              error: {
                code: 'session_closed',
                message: 'Видео открыто в другом окне. Открой урок снова.',
              },
            },
          },
        },
      ),
    );
    renderRoute('/tasks/9');
    await screen.findByRole('group', { name: /Видео урока/ });
    const video = document.querySelector('video')!;
    const control = controllable(video);
    control.play(0);
    control.at(0.5);
    control.at(1);
    control.pause();
    expect(
      await screen.findByText('Видео открыто в другом окне. Открой урок снова.'),
    ).toBeInTheDocument();
  });

  it('the result offers the explaining fragment of a question', async () => {
    const finished: AttemptDto = {
      id: 21,
      taskId: 9,
      epoch: 0,
      status: 'finished',
      startedAt: '2026-11-14T10:00:00.000Z',
      finishedAt: '2026-11-14T10:01:00.000Z',
      questions: [
        {
          id: 1,
          position: 0,
          text: 'Сколько будет 2 + 2?',
          image: null,
          options: [
            { id: 'a', text: '4', image: null },
            { id: 'b', text: '5', image: null },
            { id: 'c', text: '6', image: null },
            { id: 'd', text: '7', image: null },
          ],
          answer: 'b',
          correct: 'a',
          isCorrect: false,
          evidence: { start: 65, end: 80, quote: null },
        },
      ],
      result: {
        correct: 0,
        total: 1,
        passed: false,
        reward: { xp: 0, coins: 0 },
        streakReward: { xp: 0, coins: 0 },
      },
      retry: { canRetry: true, canRequest: false, requestOpen: false },
    };
    mockApi(
      lessonApi(
        { percent: 90, satisfied: true },
        { 'POST /api/tasks/9/attempts': { body: finished } },
      ),
    );
    renderRoute('/tasks/9');
    const go = await screen.findByRole('button', { name: 'Перейти к вопросам' });
    await vi.waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await userEvent.click(await screen.findByRole('button', { name: 'Посмотреть объяснение' }));
    const dialog = await screen.findByRole('dialog', { name: 'Помощь к вопросу' });
    expect(within(dialog).getByText(/Объяснение начнётся с 1:02/)).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Объяснение к вопросу' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Вернуться к результату' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // «Повторить видео» goes back to the lesson video.
    await userEvent.click(screen.getByRole('button', { name: 'Повторить видео' }));
    expect(await screen.findByRole('group', { name: /Видео урока/ })).toBeInTheDocument();
  });
});
