/**
 * Recognises an uploaded sound by its signature only (nothing is decoded on the server):
 * MP3 (an ID3 tag or an MPEG audio frame sync) and Ogg (`OggS`).
 */

export const AUDIO_TYPES = {
  mp3: { mime: 'audio/mpeg', extension: '.mp3' },
  ogg: { mime: 'audio/ogg', extension: '.ogg' },
} as const;
export type AudioType = keyof typeof AUDIO_TYPES;

const ascii = (b: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...b.subarray(at, at + length));

/** The type of a sound file, or null when the bytes are not MP3 or Ogg. */
export function inspectAudio(bytes: Uint8Array): AudioType | null {
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'OggS') {
    return 'ogg';
  }
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3') {
    return 'mp3';
  }
  // 11 set bits of a frame sync, a valid MPEG version and layer.
  const [first = 0, second = 0] = bytes;
  if (bytes.length >= 4 && first === 0xff && (second & 0xe0) === 0xe0 && (second & 0x06) !== 0) {
    return 'mp3';
  }
  return null;
}
