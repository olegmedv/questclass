// Connects a lesson video to a <video>: HLS through hls.js (loaded on demand, with retries of
// failed segments), Safari's native HLS, or a progressive MP4 with Range requests (fallback).

export interface MediaSource {
  readonly kind: 'hls' | 'mp4';
  /** URL of `master.m3u8` or `video.mp4`. */
  readonly src: string;
}

const HLS_TYPE = 'application/vnd.apple.mpegurl';
/** Fatal errors hls.js may recover from before the player gives up and shows «Загрузить заново». */
const MAX_RECOVERIES = 3;
/** How much video hls.js loads ahead of the playhead (and keeps behind it). */
export const BUFFER_AHEAD_SEC = 60;
const BUFFER_AHEAD_BYTES = 8 * 1000 * 1000;

export const VIDEO_ERROR = 'Видео не загрузилось. Проверь интернет и попробуй ещё раз.';
const UNSUPPORTED =
  'Этот браузер не умеет показывать видео урока. Открой КвестКласс в Chrome или Safari.';

/** Safari (macOS, iPad, iPhone) plays HLS itself and does it best natively. */
function isAppleWebKit(): boolean {
  return typeof navigator !== 'undefined' && navigator.vendor === 'Apple Computer, Inc.';
}

/** Attaches the source; returns the detach function. Errors are reported in Russian. */
export function attachSource(
  video: HTMLVideoElement,
  source: MediaSource,
  onError: (message: string) => void,
): () => void {
  let disposed = false;
  let destroy: (() => void) | null = null;
  const onMediaError = () => {
    if (!disposed) onError(VIDEO_ERROR);
  };

  const playNatively = () => {
    video.src = source.src;
    video.addEventListener('error', onMediaError);
  };

  if (source.kind === 'mp4' || (isAppleWebKit() && video.canPlayType(HLS_TYPE) !== '')) {
    playNatively();
  } else {
    void import('hls.js')
      .then(({ default: Hls }) => {
        if (disposed) return;
        if (!Hls.isSupported()) {
          if (video.canPlayType(HLS_TYPE) !== '') playNatively();
          else onError(UNSUPPORTED);
          return;
        }
        const hls = new Hls({
          // Weak mobile networks: retry segments and playlists before failing.
          fragLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 10_000,
              maxLoadTimeMs: 60_000,
              timeoutRetry: { maxNumRetry: 4, retryDelayMs: 1_000, maxRetryDelayMs: 8_000 },
              errorRetry: { maxNumRetry: 6, retryDelayMs: 1_000, maxRetryDelayMs: 8_000 },
            },
          },
          capLevelToPlayerSize: true,
          // Mobile data: keep about a minute ahead. By default hls.js fills up to 60 MB / 10 min,
          // which a child who stops after a few minutes would download for nothing.
          maxBufferLength: BUFFER_AHEAD_SEC,
          maxMaxBufferLength: BUFFER_AHEAD_SEC,
          maxBufferSize: BUFFER_AHEAD_BYTES,
          backBufferLength: BUFFER_AHEAD_SEC,
        });
        let recoveries = 0;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (recoveries < MAX_RECOVERIES && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            recoveries += 1;
            hls.startLoad();
          } else if (recoveries < MAX_RECOVERIES && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            recoveries += 1;
            hls.recoverMediaError();
          } else {
            hls.destroy();
            onError(VIDEO_ERROR);
          }
        });
        hls.loadSource(source.src);
        hls.attachMedia(video);
        destroy = () => hls.destroy();
      })
      .catch(() => {
        if (!disposed) onError(VIDEO_ERROR);
      });
  }

  return () => {
    disposed = true;
    video.removeEventListener('error', onMediaError);
    destroy?.();
    if (source.kind === 'mp4' || video.src) {
      video.removeAttribute('src');
      video.load();
    }
  };
}
