// The HLS player asks hls.js to load about a minute ahead, not its default of up to 10 minutes /
// 60 MB: lessons are watched on mobile data and are often stopped early.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachSource, BUFFER_AHEAD_SEC } from '../src/components/MediaPlayer/attach';

interface HlsConfig {
  readonly maxBufferLength?: number;
  readonly maxMaxBufferLength?: number;
  readonly maxBufferSize?: number;
  readonly backBufferLength?: number;
}

const created = vi.hoisted(() => [] as { config: HlsConfig; src?: string; media?: unknown }[]);

vi.mock('hls.js', () => {
  class FakeHls {
    static isSupported = () => true;
    static Events = { ERROR: 'hlsError' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
    private readonly entry: { config: HlsConfig; src?: string; media?: unknown };
    constructor(config: HlsConfig) {
      this.entry = { config };
      created.push(this.entry);
    }
    on() {}
    loadSource(src: string) {
      this.entry.src = src;
    }
    attachMedia(media: unknown) {
      this.entry.media = media;
    }
    destroy() {}
  }
  return { default: FakeHls };
});

afterEach(() => {
  created.length = 0;
});

describe('attachSource (HLS)', () => {
  it('limits how far ahead hls.js buffers', async () => {
    const video = document.createElement('video');
    vi.spyOn(video, 'canPlayType').mockReturnValue('');
    const onError = vi.fn();
    const detach = attachSource(video, { kind: 'hls', src: '/api/media/1/master.m3u8' }, onError);
    await vi.waitFor(() => expect(created).toHaveLength(1));

    const entry = created.at(0);
    if (!entry) throw new Error('hls.js was not created');
    const { config, src, media } = entry;
    expect(src).toBe('/api/media/1/master.m3u8');
    expect(media).toBe(video);
    expect(config.maxBufferLength).toBeLessThanOrEqual(BUFFER_AHEAD_SEC);
    expect(config.maxMaxBufferLength).toBe(BUFFER_AHEAD_SEC);
    expect(config.maxBufferSize).toBeLessThanOrEqual(10 * 1000 * 1000);
    expect(config.backBufferLength).toBe(BUFFER_AHEAD_SEC);
    expect(onError).not.toHaveBeenCalled();
    detach();
  });
});
