// FEAT-060: a room layer the admin replaced keeps the Night Hotel busy for its own length.
import { describe, expect, it } from 'vitest';
import { sceneAssetUrls } from '../src/features/character/useCharacter';

const ASSETS = {
  layers: {
    lightning: 'game/rooms/night-hotel/lightning_flash.webp',
    candles: 'game/rooms/night-hotel/candles_flicker.webp',
  },
  audio: { ambient: ['game/rooms/night-hotel/audio/ambient/rain.ogg'], events: [] },
};

describe('scene assets', () => {
  it('pass the length of each layer clip, replaced or built-in', () => {
    const replaced = (file: string) =>
      file.endsWith('lightning_flash.webp')
        ? 900
        : file.endsWith('candles_flicker.webp')
          ? 1800
          : undefined;
    const assets = sceneAssetUrls(ASSETS, null, 'ogg', replaced);
    expect(assets.layers).toEqual({
      lightning: '/assets/game/rooms/night-hotel/lightning_flash.webp',
      candles: '/assets/game/rooms/night-hotel/candles_flicker.webp',
    });
    expect(assets.layerDurations).toEqual({ lightning: 900, candles: 1800 });
  });

  it('leave the scene its own timing when nothing is known', () => {
    const assets = sceneAssetUrls(ASSETS, null, 'mp3');
    expect(assets.layerDurations).toBeUndefined();
    expect(assets.ambient).toEqual(['/assets/game/rooms/night-hotel/audio/ambient/rain.mp3']);
  });
});
