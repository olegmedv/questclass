// Pictures for upload tests: headers of real formats (PNG, JPEG, WebP still and animated),
// built byte by byte, so the checks run on the format rules and not on bundled files.
export const bytes = (...parts: (number[] | Uint8Array | string)[]): Uint8Array => {
  const arrays = parts.map((p) =>
    typeof p === 'string'
      ? new TextEncoder().encode(p)
      : p instanceof Uint8Array
        ? p
        : Uint8Array.from(p),
  );
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
};
export const le32 = (n: number) => [
  n & 0xff,
  (n >>> 8) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 24) & 0xff,
];
export const le24 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
export const be32 = (n: number) => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];
export const be16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];

export function png(width: number, height: number, padding = 0): Uint8Array {
  const ihdr = bytes(be32(width), be32(height), [8, 6, 0, 0, 0]);
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    be32(13),
    'IHDR',
    ihdr,
    [0, 0, 0, 0],
    be32(padding),
    'IDAT',
    new Uint8Array(padding),
    [0, 0, 0, 0],
    be32(0),
    'IEND',
    [0xae, 0x42, 0x60, 0x82],
  );
}

export function jpeg(width: number, height: number): Uint8Array {
  const app0 = bytes([0xff, 0xe0], be16(16), 'JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = bytes(
    [0xff, 0xc0],
    be16(17),
    [8],
    be16(height),
    be16(width),
    [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
  );
  return bytes([0xff, 0xd8], app0, sof, [0xff, 0xd9]);
}

export const chunk = (fourcc: string, payload: Uint8Array): Uint8Array =>
  bytes(fourcc, le32(payload.length), payload, payload.length % 2 ? [0] : []);
export const riff = (...chunks: Uint8Array[]): Uint8Array => {
  const body = bytes('WEBP', ...chunks);
  return bytes('RIFF', le32(body.length), body);
};
export const vp8l = (width: number, height: number) => {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return chunk('VP8L', bytes([0x2f], le32(bits), [0, 0, 0]));
};

export function webpStill(width: number, height: number): Uint8Array {
  return riff(vp8l(width, height));
}

export function webpAnimation(
  width: number,
  height: number,
  frameMs: readonly number[],
  padding = 0,
) {
  const vp8x = chunk('VP8X', bytes([0x12, 0, 0, 0], le24(width - 1), le24(height - 1)));
  const anim = chunk('ANIM', bytes([0, 0, 0, 0], [0, 0]));
  const frames = frameMs.map((ms) =>
    chunk(
      'ANMF',
      bytes(
        le24(0),
        le24(0),
        le24(width - 1),
        le24(height - 1),
        le24(ms),
        [0],
        vp8l(width, height),
      ),
    ),
  );
  return riff(
    vp8x,
    anim,
    ...frames,
    ...(padding > 0 ? [chunk('XPAD', new Uint8Array(padding))] : []),
  );
}

export const frames = (n: number, ms = 100) => Array.from({ length: n }, () => ms);
export const MIB = 1024 * 1024;
