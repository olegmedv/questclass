import { describe, expect, it } from 'vitest';
import manifestJson from '../src/assets/manifest.json';
import { ASSET_SLOTS, assetSlot, assetSlotOfFile } from '../src/assets/slots';
import { APP_ASSETS, appAssetUses } from '../src/assets/uses';

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

  it("the app's own files are built-in files, each with one use and no admin page", () => {
    for (const asset of Object.values(APP_ASSETS)) {
      expect(assetSlotOfFile(asset.file), asset.file).toBeDefined();
    }
    const uses = appAssetUses();
    expect(uses).toHaveLength(Object.keys(APP_ASSETS).length);
    expect(uses.find((use) => use.file === APP_ASSETS.logo.file)).toEqual({
      file: 'icons/star-v1-192.png',
      area: 'brand',
      role: 'app',
      owner: null,
      part: 'Логотип',
      place: 'Шапка кабинета и ученика, экран входа',
      href: null,
    });
  });
});
