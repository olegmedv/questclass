// Built-in files a shop item shows (FEAT-062), for «Оформление» and the item editor: the hero
// picture, the room background and preview, the parts of a special scene, the ticket picture and
// the animation with its first frame. A part replaced by the item's own upload is not listed.
import type { AssetArea, AssetFileUse, AssetUseRole } from '@questclass/shared/assets/uses';
import type { ItemKind } from '@questclass/shared/catalog/dto';
import type { AnimationRow, CatalogItemRow, CharacterRow, RoomRow } from '../../db/schema/catalog';

/** The library rows by id (as the catalog service reads them). */
export interface ItemLibrary {
  readonly characters: ReadonlyMap<number, CharacterRow>;
  readonly animations: ReadonlyMap<number, AnimationRow>;
  readonly rooms: ReadonlyMap<number, RoomRow>;
}

const KIND_PLACE: Readonly<Record<ItemKind, { area: AssetArea; place: string }>> = {
  outfit: { area: 'heroes', place: 'Магазин, примерочная и главная ученика' },
  room: { area: 'rooms', place: 'Магазин и комната героя' },
  ticket: { area: 'tickets', place: 'Магазин и желания ученика' },
};

/** Layers of the special scenes (the keys of `sceneAssets.layers` in the seed catalog). */
const LAYER_NAMES: Readonly<Record<string, string>> = {
  candles: 'свечи',
  lightning: 'молния',
  eyesBlink: 'глаза в темноте',
  lightFlicker: 'мигающий свет',
  shadowRun: 'бегущая тень',
  girlWindow: 'девочка в окне',
  figurePeek: 'фигура выглядывает',
  wardrobeMonster: 'монстр в шкафу',
  doorBend: 'дверь выгибается',
  screech: 'крикун на потолке',
  curtain: 'штора',
};

/** Sounds of the special scenes, by file name. */
const SOUND_NAMES: Readonly<Record<string, string>> = {
  lullaby: 'колыбельная',
  'night-air': 'ночной воздух',
  'star-chime': 'звон звезды',
  ambient_room_loop: 'тишина комнаты',
  rain_loop: 'дождь',
  music_optional_loop: 'музыка',
  closet_creak_close: 'шкаф закрывается',
  closet_creak_open: 'шкаф открывается',
  door_creak: 'скрип двери',
  girl_laugh: 'смех девочки',
  light_flicker: 'треск лампы',
  monster_slither: 'монстр ползёт',
  screech_jump: 'визг',
  shadow_run: 'бегущая тень',
  thunder_01: 'гром',
  thunder_02: 'гром, второй',
  wardrobe_thump: 'стук в шкафу',
  'night-music': 'ночная музыка',
  'wood-creak': 'скрип пола',
  'curtain-rustle': 'шорох шторы',
  'ghost-vanish': 'призрак исчезает',
  'ghost-return': 'призрак возвращается',
};

const baseName = (file: string): string =>
  file.slice(file.lastIndexOf('/') + 1).replace(/\.[a-z0-9]+$/i, '');

/** The built-in files of one item, in the order of the editor. */
export function itemAssetUses(row: CatalogItemRow, lib: ItemLibrary): AssetFileUse[] {
  const found: { file: string; role: AssetUseRole; part: string }[] = [];
  const add = (file: string, role: AssetUseRole, part: string) => found.push({ file, role, part });

  const character = row.characterId === null ? undefined : lib.characters.get(row.characterId);
  const room = row.roomId === null ? undefined : lib.rooms.get(row.roomId);
  const animation = row.animationId === null ? undefined : lib.animations.get(row.animationId);

  if (row.kind === 'outfit' && character) {
    add(
      character.image,
      'picture',
      character.sprite ? 'Картинка героя (общий лист с другими героями)' : 'Картинка героя',
    );
  }
  if (row.kind === 'room' && room) {
    add(room.image, 'picture', room.scene === 'static' ? 'Фон комнаты' : 'Фон сцены');
    if (room.thumb !== room.image) add(room.thumb, 'thumb', 'Превью в магазине');
    for (const [key, file] of Object.entries(room.sceneAssets?.layers ?? {})) {
      add(file, 'layer', `Слой сцены: ${LAYER_NAMES[key] ?? key}`);
    }
    const audio = room.sceneAssets?.audio;
    for (const file of audio?.ambient ?? []) {
      add(file, 'sound', `Фоновый звук: ${SOUND_NAMES[baseName(file)] ?? baseName(file)}`);
    }
    for (const file of audio?.events ?? []) {
      add(file, 'sound', `Звук события: ${SOUND_NAMES[baseName(file)] ?? baseName(file)}`);
    }
  }
  if (row.kind === 'ticket' && row.imageUploadId === null && row.image !== null) {
    add(
      row.image,
      'picture',
      row.sprite ? 'Картинка билета (общий лист с другими билетами)' : 'Картинка билета',
    );
  }
  if (animation && row.kind !== 'ticket') {
    if (animation.src !== null) {
      add(animation.src, 'animation', row.kind === 'room' ? 'Анимация комнаты' : 'Анимация героя');
    }
    add(animation.poster, 'poster', 'Первый кадр анимации');
  }

  const { area, place } = KIND_PLACE[row.kind];
  return found.map((use) => ({
    ...use,
    area,
    owner: row.title,
    place,
    href: `/admin/shop/${row.id}`,
  }));
}
