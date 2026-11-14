// FEAT-031: MediaPlayer — own controls (±10 s, play/pause, timeline, volume, fullscreen), the
// strip over the subtitles (keyboard and button), a hint fragment that stops by media time, and
// the «Загрузить видео заново» error state.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTime, MediaPlayer, type ShutterState } from '../src';

const mp4 = { kind: 'mp4' as const, src: '/api/media/7/video.mp4' };

function video(): HTMLVideoElement {
  const el = document.querySelector('video');
  if (!el) throw new Error('no video');
  return el;
}

/** jsdom has no media pipeline: give the element a duration and a settable position. */
function loadMetadata(duration = 120) {
  const el = video();
  Object.defineProperty(el, 'duration', { configurable: true, value: duration });
  fireEvent.loadedMetadata(el);
  fireEvent.canPlay(el);
}

let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    fireEvent.play(this);
    return Promise.resolve();
  });
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    fireEvent.pause(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MediaPlayer', () => {
  it('plays MP4 directly and has the lesson controls', async () => {
    render(<MediaPlayer source={mp4} label="Видео урока" />);
    expect(screen.getByRole('group', { name: 'Видео урока' })).toBeInTheDocument();
    expect(video().getAttribute('src')).toBe('/api/media/7/video.mp4');
    loadMetadata();
    await userEvent.click(screen.getByRole('button', { name: 'Смотреть' }));
    expect(play).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Пауза' }));
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Смотреть' })).toBeInTheDocument();
  });

  it('±10 s, the timeline and the volume move the video', async () => {
    render(<MediaPlayer source={mp4} label="Видео урока" />);
    loadMetadata(120);
    video().currentTime = 30;
    await userEvent.click(screen.getByRole('button', { name: '10 сек вперёд' }));
    expect(video().currentTime).toBe(40);
    await userEvent.click(screen.getByRole('button', { name: '10 сек назад' }));
    expect(video().currentTime).toBe(30);
    fireEvent.change(screen.getByRole('slider', { name: 'Перемотка' }), {
      target: { value: '90' },
    });
    expect(video().currentTime).toBe(90);
    fireEvent.change(screen.getByRole('slider', { name: 'Громкость' }), {
      target: { value: '40' },
    });
    expect(video().volume).toBeCloseTo(0.4);
    await userEvent.click(screen.getByRole('button', { name: 'Звук' }));
    expect(video().muted).toBe(true);
  });

  it('resumes from the saved position', () => {
    render(<MediaPlayer source={mp4} label="Видео урока" startAt={42} />);
    loadMetadata(120);
    expect(video().currentTime).toBe(42);
  });

  it('the strip over the subtitles: keyboard height, «Открыть низ» / «Скрыть низ»', async () => {
    const onShutterChange = vi.fn<(state: ShutterState) => void>();
    const { rerender } = render(
      <MediaPlayer
        source={mp4}
        label="Видео урока"
        shutter={{ heightPct: 9, visible: true }}
        onShutterChange={onShutterChange}
      />,
    );
    const handle = screen.getByRole('slider', { name: 'Высота чёрной полосы' });
    expect(handle).toHaveAttribute('aria-valuenow', '9');
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(onShutterChange).toHaveBeenLastCalledWith({ heightPct: 10, visible: true });
    fireEvent.keyDown(handle, { key: 'End' });
    expect(onShutterChange).toHaveBeenLastCalledWith({ heightPct: 40, visible: true });
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(onShutterChange).toHaveBeenLastCalledWith({ heightPct: 4, visible: true });
    const [openButton] = screen.getAllByRole('button', { name: 'Открыть низ' });
    await userEvent.click(openButton!);
    expect(onShutterChange).toHaveBeenLastCalledWith({ heightPct: 9, visible: false });
    rerender(
      <MediaPlayer
        source={mp4}
        label="Видео урока"
        shutter={{ heightPct: 9, visible: false }}
        onShutterChange={onShutterChange}
      />,
    );
    expect(screen.queryByRole('slider', { name: 'Высота чёрной полосы' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Скрыть низ' }));
    expect(onShutterChange).toHaveBeenLastCalledWith({ heightPct: 9, visible: true });
  });

  it('a hint fragment starts 3 s early and ends by the media time', () => {
    const onEnd = vi.fn();
    render(<MediaPlayer source={mp4} label="Объяснение" clip={{ start: 20, end: 30, onEnd }} />);
    loadMetadata(120);
    expect(video().currentTime).toBe(17);
    expect(play).toHaveBeenCalled();
    fireEvent.timeUpdate(video());
    video().currentTime = 29;
    fireEvent.timeUpdate(video());
    expect(onEnd).not.toHaveBeenCalled();
    video().currentTime = 30.2;
    fireEvent.timeUpdate(video());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalled();
  });

  it('a broken video offers «Загрузить видео заново»', async () => {
    render(<MediaPlayer source={mp4} label="Видео урока" />);
    fireEvent.error(video());
    expect(screen.getByRole('alert')).toHaveTextContent('Видео не загрузилось');
    const first = video();
    await userEvent.click(screen.getByRole('button', { name: 'Загрузить видео заново' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(video()).not.toBe(first);
  });

  it('formats times as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });
});
