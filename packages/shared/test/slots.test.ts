import { describe, expect, it } from 'vitest';
import manifestJson from '../src/assets/manifest.json';
import { ASSET_GROUPS, ASSET_SLOTS, assetSlot, assetSlotOfFile } from '../src/assets/slots';

const manifest = manifestJson as Record<string, { kind: string; animated?: boolean }>;

describe('replaceable built-in files', () => {
  it('every picture, animation and sound of the manifest is in exactly one slot', () => {
    const media = Object.entries(manifest).filter(
      ([, e]) => e.kind === 'image' || e.kind === 'audio',
    );
    const covered = ASSET_SLOTS.flatMap((slot) => slot.files);
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual(media.map(([key]) => key).sort());
    // Fonts and texts are not replaceable.
    expect(assetSlotOfFile('fonts/ReportSans.ttf')).toBeUndefined();
  });

  it('a sound is one slot for its OGG and MP3, keyed by the MP3', () => {
    const ogg = Object.keys(manifest).find((key) => key.endsWith('.ogg'));
    if (!ogg) throw new Error('No sound in the manifest');
    const slot = assetSlotOfFile(ogg);
    expect(slot?.kind).toBe('audio');
    expect(slot?.key).toBe(ogg.replace(/\.ogg$/, '.mp3'));
    expect(slot?.files).toEqual([ogg.replace(/\.ogg$/, '.mp3'), ogg]);
    expect(assetSlot(slot?.key ?? '')).toBe(slot);
    // The streak movie shares its name with its sound, but they are different slots.
    expect(assetSlotOfFile('celebrations/streak-five-v1.webp')?.kind).toBe('animation');
    expect(assetSlotOfFile('celebrations/streak-five-v1.ogg')?.kind).toBe('audio');
  });

  it('groups: the special rooms come before the other rooms, every slot has a known group', () => {
    const ids = new Set<string>(ASSET_GROUPS.map((group) => group.id));
    expect(ASSET_SLOTS.every((slot) => ids.has(slot.group))).toBe(true);
    expect(assetSlotOfFile('game/rooms/night-hotel/room_base.webp')?.group).toBe('night-hotel');
    expect(assetSlotOfFile('icons/star-v1-32.png')?.group).toBe('brand');
    expect(assetSlotOfFile('game/subjects-pixel/math.webp')?.group).toBe('subjects');
  });
});
