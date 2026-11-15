// Where a built-in file shows (FEAT-062): «Оформление» names every file by what it is and where the
// learner sees it, and links the admin page that edits its owner (a shop item, the subjects).
// Catalog items and subjects report their files themselves; the files of the app itself are here.

/** Areas of «Оформление», in screen order. A file goes to the area of its first use. */
export const ASSET_AREAS = [
  { id: 'brand', title: 'Логотип' },
  { id: 'celebration', title: 'Праздник за серию занятий' },
  { id: 'sounds', title: 'Звуки' },
  { id: 'subjects', title: 'Значки предметов' },
  { id: 'heroes', title: 'Магазин: герои' },
  { id: 'rooms', title: 'Магазин: комнаты' },
  { id: 'tickets', title: 'Магазин: билеты и желания' },
  { id: 'home', title: 'Главная ученика' },
  { id: 'unused', title: 'Сейчас нигде не показываются' },
] as const;

export type AssetArea = (typeof ASSET_AREAS)[number]['id'];

/** What the file is for its owner; the item editor edits `picture` and `animation` itself. */
export type AssetUseRole =
  'app' | 'icon' | 'picture' | 'thumb' | 'animation' | 'poster' | 'layer' | 'sound';

export interface AssetUseDto {
  readonly area: AssetArea;
  readonly role: AssetUseRole;
  /** The thing the file belongs to («Ночной отель», «Математика»); null for the app itself. */
  readonly owner: string | null;
  /** What the file is: «Слой сцены: свечи», «Логотип». */
  readonly part: string;
  /** Where the learner sees it: «Магазин и комната героя». */
  readonly place: string;
  /** The admin page that edits the owner. */
  readonly href: string | null;
}

/** A use of a served file (a sound may be named by its `.ogg`), as a module reports it. */
export interface AssetFileUse extends AssetUseDto {
  readonly file: string;
}

interface AppAsset {
  readonly file: string;
  readonly area: AssetArea;
  readonly part: string;
  readonly place: string;
}

/** Built-in files the app itself shows (not catalog items or subjects). */
export const APP_ASSETS = {
  logo: {
    file: 'icons/star-v1-192.png',
    area: 'brand',
    part: 'Логотип',
    place: 'Шапка кабинета и ученика, экран входа',
  },
  touchIcon: {
    file: 'icons/star-v1-180.png',
    area: 'brand',
    part: 'Значок на телефоне',
    place: 'Когда сайт добавлен на экран «Домой»',
  },
  favicon: {
    file: 'icons/star-v1-32.png',
    area: 'brand',
    part: 'Значок вкладки',
    place: 'Вкладка браузера и закладки',
  },
  streakMovie: {
    file: 'celebrations/streak-five-v1.webp',
    area: 'celebration',
    part: 'Мультфильм',
    place: 'Главная ученика: карточка «Серия занятий»',
  },
  streakPoster: {
    file: 'celebrations/streak-five-poster.webp',
    area: 'celebration',
    part: 'Первый кадр мультфильма',
    place: 'Пока мультфильм загружается или если анимации выключены',
  },
  streakSound: {
    file: 'celebrations/streak-five-v1.mp3',
    area: 'celebration',
    part: 'Звук мультфильма',
    place: 'Играет вместе с мультфильмом',
  },
  rewardSound: {
    file: 'game/ui-audio/collection-blessing.mp3',
    area: 'sounds',
    part: 'Звук награды',
    place: 'Когда ученик получает монеты и XP: тест, дело, серия занятий',
  },
  starterHero: {
    file: 'game/animated/repaired/blue-idle.webp',
    area: 'home',
    part: 'Герой, пока загружается свой',
    place: 'Главная ученика: карточка следующего урока',
  },
  starterHeroCover: {
    file: 'game/animated/repaired/blue-idle-cover.webp',
    area: 'home',
    part: 'Первый кадр героя, пока загружается свой',
    place: 'Главная ученика: карточка следующего урока',
  },
  robuxIcon: {
    file: 'game/report-robux.svg',
    area: 'tickets',
    part: 'Значок Robux',
    place: 'Желания ученика: билет Robux без своей картинки',
  },
} as const satisfies Readonly<Record<string, AppAsset>>;

export type AppAssetId = keyof typeof APP_ASSETS;

/** The file without its extension: a sound is played as `.ogg` or `.mp3`. */
export const assetStem = (file: string): string => file.replace(/\.[a-z0-9]+$/i, '');

/** The uses of the app's own files. */
export function appAssetUses(): AssetFileUse[] {
  return Object.values(APP_ASSETS).map((asset: AppAsset) => ({
    file: asset.file,
    area: asset.area,
    role: 'app',
    owner: null,
    part: asset.part,
    place: asset.place,
    href: null,
  }));
}
