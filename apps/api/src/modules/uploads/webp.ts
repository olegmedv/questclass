/**
 * Recognises an uploaded picture by its signature and reads its size (and, for an animated
 * WebP, its frames) from the headers alone — no image library, nothing is decoded.
 * Containers: PNG (IHDR), JPEG (SOFn), WebP (RIFF: VP8, VP8L, VP8X + ANIM/ANMF).
 */

export const IMAGE_TYPES = {
  png: { mime: 'image/png', extension: '.png' },
  jpeg: { mime: 'image/jpeg', extension: '.jpg' },
  webp: { mime: 'image/webp', extension: '.webp' },
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;

export interface ImageInfo {
  readonly type: ImageType;
  readonly width: number;
  readonly height: number;
  readonly animated: boolean;
  /** Animated WebP only. */
  readonly frames?: number;
  readonly durationMs?: number;
  /** Shortest frame of an animation, ms. */
  readonly minFrameMs?: number;
}

/** The bytes are not a picture of a supported type. */
export class UnsupportedImage extends Error {
  override name = 'UnsupportedImage';
}

/** A supported type whose headers are broken or inconsistent. */
export class BrokenImage extends Error {
  override name = 'BrokenImage';
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const ascii = (b: Uint8Array, at: number, length = 4): string =>
  String.fromCharCode(...b.subarray(at, at + length));
const u16be = (b: Uint8Array, at: number): number => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const u16le = (b: Uint8Array, at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, at: number): number =>
  (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16);
const u32 = (b: Uint8Array, at: number, little: boolean): number =>
  new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at, little);

function need(b: Uint8Array, end: number): void {
  if (end > b.length) {
    throw new BrokenImage('Файл обрывается');
  }
}

function png(b: Uint8Array): ImageInfo {
  need(b, 24);
  if (ascii(b, 12) !== 'IHDR') {
    throw new BrokenImage('Нет заголовка PNG');
  }
  return { type: 'png', width: u32(b, 16, false), height: u32(b, 20, false), animated: false };
}

/** Start-of-frame markers carry the size; DHT (C4), JPG (C8) and DAC (CC) do not. */
const isStartOfFrame = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpeg(b: Uint8Array): ImageInfo {
  let at = 2;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) {
      throw new BrokenImage('Повреждён заголовок JPEG');
    }
    const marker = b[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2; // markers without a length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      break; // end of image / start of scan before any frame header
    }
    const length = u16be(b, at + 2);
    if (length < 2) {
      throw new BrokenImage('Повреждён заголовок JPEG');
    }
    if (isStartOfFrame(marker)) {
      need(b, at + 9);
      return { type: 'jpeg', width: u16be(b, at + 7), height: u16be(b, at + 5), animated: false };
    }
    at += 2 + length;
  }
  throw new BrokenImage('В JPEG нет размеров кадра');
}

interface Chunk {
  readonly fourcc: string;
  /** Start of the payload. */
  readonly start: number;
  readonly size: number;
}

/** RIFF chunks between `from` and `to` (payloads are padded to an even size). */
function* chunks(b: Uint8Array, from: number, to: number): Generator<Chunk> {
  let at = from;
  while (at < to) {
    need(b, at + 8);
    const size = u32(b, at + 4, true);
    const start = at + 8;
    const end = start + size;
    if (end > to) {
      throw new BrokenImage('Повреждён контейнер WebP');
    }
    yield { fourcc: ascii(b, at), start, size };
    at = end + (size % 2);
  }
}

/** Size of a still bitstream (`VP8 ` lossy key frame or `VP8L` lossless). */
function bitstreamSize(b: Uint8Array, chunk: Chunk): { width: number; height: number } {
  if (chunk.fourcc === 'VP8 ') {
    need(b, chunk.start + 10);
    if (b[chunk.start + 3] !== 0x9d || b[chunk.start + 4] !== 0x01 || b[chunk.start + 5] !== 0x2a) {
      throw new BrokenImage('Повреждён кадр WebP');
    }
    return {
      width: u16le(b, chunk.start + 6) & 0x3fff,
      height: u16le(b, chunk.start + 8) & 0x3fff,
    };
  }
  need(b, chunk.start + 5);
  if (b[chunk.start] !== 0x2f) {
    throw new BrokenImage('Повреждён кадр WebP');
  }
  const bits = u32(b, chunk.start + 1, true);
  return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
}

function webp(b: Uint8Array): ImageInfo {
  need(b, 20);
  const riffEnd = 8 + u32(b, 4, true);
  if (riffEnd > b.length) {
    throw new BrokenImage('Файл WebP обрывается');
  }
  const [first] = chunks(b, 12, riffEnd);
  if (!first) {
    throw new BrokenImage('Пустой WebP');
  }
  if (first.fourcc === 'VP8 ' || first.fourcc === 'VP8L') {
    return { type: 'webp', ...bitstreamSize(b, first), animated: false };
  }
  if (first.fourcc !== 'VP8X' || first.size < 10) {
    throw new BrokenImage('Неизвестный вид WebP');
  }
  const width = u24le(b, first.start + 4) + 1;
  const height = u24le(b, first.start + 7) + 1;
  const animated = ((b[first.start] ?? 0) & 0x02) !== 0;
  if (!animated) {
    return { type: 'webp', width, height, animated: false };
  }
  let hasAnim = false;
  let frames = 0;
  let durationMs = 0;
  let minFrameMs = Number.POSITIVE_INFINITY;
  for (const chunk of chunks(b, 12, riffEnd)) {
    if (chunk.fourcc === 'ANIM') {
      hasAnim = true;
    } else if (chunk.fourcc === 'ANMF') {
      if (!hasAnim || chunk.size < 16) {
        throw new BrokenImage('Повреждена анимация WebP');
      }
      const x = u24le(b, chunk.start) * 2;
      const y = u24le(b, chunk.start + 3) * 2;
      const w = u24le(b, chunk.start + 6) + 1;
      const h = u24le(b, chunk.start + 9) + 1;
      if (x + w > width || y + h > height) {
        throw new BrokenImage('Кадр анимации выходит за холст');
      }
      const ms = u24le(b, chunk.start + 12);
      frames += 1;
      durationMs += ms;
      minFrameMs = Math.min(minFrameMs, ms);
    }
  }
  if (!hasAnim || frames === 0) {
    throw new BrokenImage('В анимированном WebP нет кадров');
  }
  return { type: 'webp', width, height, animated: true, frames, durationMs, minFrameMs };
}

/** Type and size of a picture; throws `UnsupportedImage` or `BrokenImage`. */
export function inspectImage(bytes: Uint8Array): ImageInfo {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((v, i) => bytes[i] === v)) {
    return png(bytes);
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return jpeg(bytes);
  }
  if (bytes.length >= 12 && ascii(bytes, 0) === 'RIFF' && ascii(bytes, 8) === 'WEBP') {
    return webp(bytes);
  }
  throw new UnsupportedImage('Поддерживаются PNG, JPG и WebP');
}
