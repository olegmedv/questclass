import manifestJson from '@questclass/shared/assets/manifest.json';
import type { AssetFileUse } from '@questclass/shared/assets/uses';
import {
  EDITABLE_ITEM_FIELDS,
  assetUrl,
  uploadUrl,
  type AnimationDto,
  type CatalogItemCreateRequest,
  type CatalogItemDto,
  type CatalogItemUpdateRequest,
  type CatalogLibraryDto,
  type HeroArtDto,
  type ItemKind,
  type RewardType,
  type RoomArtDto,
  type RoomCategory,
  type Sprite,
} from '@questclass/shared/catalog/dto';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import {
  animations,
  catalogItems,
  characters,
  rooms,
  type AnimationRow,
  type CatalogItemInsert,
  type CatalogItemRow,
  type CharacterRow,
  type RoomRow,
} from '../../db/schema/catalog';
import { badRequest, conflict, notFound } from '../../http/errors';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';
import { itemAssetUses } from './assetUses';

export const catalogItemCreated = defineAuditAction(
  'catalog_item.created',
  z.object({ kind: z.string(), title: z.string(), price: z.number() }),
);
export const catalogItemUpdated = defineAuditAction(
  'catalog_item.updated',
  z.object({ changed: z.array(z.string()), title: z.string(), version: z.number() }),
);

/** What the catalog needs to know about an admin upload (provided by FEAT-018). */
export interface UploadInfo {
  readonly animated: boolean;
  readonly width: number;
  readonly height: number;
  readonly durationMs?: number;
}

/** Everything an item can be made of, with library references by key. */
export interface ItemDraft {
  readonly kind: ItemKind;
  readonly title: string;
  readonly description: string;
  readonly price: number;
  readonly active: boolean;
  readonly characterKey: string | null;
  readonly roomKey: string | null;
  readonly animationKey: string | null;
  readonly imageKey: string | null;
  readonly sprite: Sprite | null;
  readonly imageUploadId: number | null;
  readonly animationUploadId: number | null;
  readonly roomCategory: RoomCategory | null;
  readonly rewardType: RewardType | null;
  readonly rewardAmount: number | null;
}

/** Columns of `catalog_items` an item draft resolves to. */
export type ItemColumns = Pick<
  CatalogItemInsert,
  | 'kind'
  | 'title'
  | 'description'
  | 'price'
  | 'active'
  | 'characterId'
  | 'roomId'
  | 'animationId'
  | 'image'
  | 'sprite'
  | 'imageUploadId'
  | 'animationUploadId'
  | 'roomCategory'
  | 'rewardType'
  | 'rewardAmount'
>;

export interface CatalogService {
  /** Built-in art for the item editor. */
  library(): CatalogLibraryDto;
  /** All items (admin), or only the active ones. */
  items(filter?: { kind?: ItemKind; activeOnly?: boolean }): CatalogItemDto[];
  item(id: number): CatalogItemDto;
  findRow(id: number): CatalogItemRow | undefined;
  /** Items every learner owns from the start (by the `starter` flag of the seed). */
  starters(): CatalogItemDto[];
  create(input: CatalogItemCreateRequest, actorId: number | null): CatalogItemDto;
  /** Changes an item (`version + 1`); the changed fields are kept by later seeding. */
  update(id: number, patch: CatalogItemUpdateRequest, actorId: number | null): CatalogItemDto;
  /**
   * Validates a draft against the library and uploads and returns its columns. Library rows
   * are looked up one by one, or in a preloaded `lookup` (seeding).
   */
  resolve(draft: ItemDraft, lookup?: LibraryLookup): ItemColumns;
  /** A stored item as a draft (library references by key). */
  draftOf(row: CatalogItemRow): ItemDraft;
  /** Built-in files every item shows, named by item («Оформление»). */
  assetUses(): AssetFileUse[];
}

export interface CatalogDeps {
  readonly audit: AuditService;
  /** Facts about an admin upload; without it uploads cannot be used (FEAT-018 provides it). */
  readonly describeUpload?: (mediaId: number) => UploadInfo | undefined;
  /** Whether learners bought the item (its kind may not change then; FEAT-019 provides it). */
  readonly hasPurchases?: (itemId: number) => boolean;
  /** Length of a replaced built-in animation (FEAT-060); undefined for the built-in file. */
  readonly replacedDurationMs?: (file: string) => number | undefined;
  readonly clock?: () => number;
}

const manifest = manifestJson as Record<string, { readonly kind: string }>;
/** Foot offset of an uploaded hero (as in the original's fitting room). */
const UPLOAD_FOOT_OFFSET = 10;
const DEFAULT_FOOT_ANCHOR = { x: 50, y: 75 };
/** A room animation must be a horizontal 3:2 picture (±0.02). */
const ROOM_RATIO = 1.5;
const ROOM_RATIO_TOLERANCE = 0.02;

const invalid = (message: string) => badRequest('invalid_item', message);

/** Library rows by key. */
export interface LibraryLookup {
  character(key: string): CharacterRow | undefined;
  room(key: string): RoomRow | undefined;
  animation(key: string): AnimationRow | undefined;
}

/** The whole library read once (for seeding many items). */
export function preloadLibrary(db: Db): LibraryLookup {
  const byKey = <T extends { key: string }>(rows: readonly T[]) =>
    new Map(rows.map((row) => [row.key, row]));
  const c = byKey(db.select().from(characters).all());
  const r = byKey(db.select().from(rooms).all());
  const a = byKey(db.select().from(animations).all());
  return { character: (k) => c.get(k), room: (k) => r.get(k), animation: (k) => a.get(k) };
}

interface Library {
  readonly characters: ReadonlyMap<number, CharacterRow>;
  readonly animations: ReadonlyMap<number, AnimationRow>;
  readonly rooms: ReadonlyMap<number, RoomRow>;
  /** Length of a built-in animation file the admin replaced («Оформление»), ms. */
  readonly replacedDurationMs: (file: string) => number | undefined;
}

function byId<T extends { id: number }>(rows: readonly T[]): Map<number, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function characterDto(row: CharacterRow) {
  return {
    key: row.key,
    name: row.name,
    image: assetUrl(row.image),
    sprite: row.sprite ?? null,
    footOffset: row.footOffset,
  };
}

function animationDto(
  row: AnimationRow,
  replacedDurationMs: (file: string) => number | undefined,
): AnimationDto & { key: string } {
  return {
    key: row.key,
    uploadId: null,
    kind: row.kind,
    name: row.name,
    src: row.src === null ? null : assetUrl(row.src),
    motion: row.motion ?? null,
    poster: assetUrl(row.poster),
    posterSprite: row.posterSprite ?? null,
    durationMs: (row.src === null ? undefined : replacedDurationMs(row.src)) ?? row.durationMs,
  };
}

function roomDto(row: RoomRow) {
  return {
    key: row.key,
    title: row.title,
    category: row.category,
    image: assetUrl(row.image),
    thumb: assetUrl(row.thumb),
    footAnchor: { x: row.footX, y: row.footY },
    scene: row.scene,
    sceneAssets: row.sceneAssets ?? null,
  };
}

/** The item as the API shows it: library references resolved to pictures and scenes. */
function toItemDto(row: CatalogItemRow, lib: Library): CatalogItemDto {
  const character = row.characterId === null ? undefined : lib.characters.get(row.characterId);
  const roomRow = row.roomId === null ? undefined : lib.rooms.get(row.roomId);
  const animationRow = row.animationId === null ? undefined : lib.animations.get(row.animationId);

  let hero: HeroArtDto | null = null;
  if (row.kind === 'outfit') {
    hero = character
      ? { ...characterDto(character), characterKey: character.key, uploadId: null }
      : {
          characterKey: null,
          uploadId: row.imageUploadId,
          name: row.title,
          image: row.imageUploadId === null ? '' : uploadUrl(row.imageUploadId),
          sprite: null,
          footOffset: UPLOAD_FOOT_OFFSET,
        };
  }

  let room: RoomArtDto | null = null;
  if (row.kind === 'room') {
    const art = roomRow ? roomDto(roomRow) : undefined;
    const uploaded = row.imageUploadId === null ? '' : uploadUrl(row.imageUploadId);
    room = art
      ? {
          roomKey: art.key,
          uploadId: null,
          title: art.title,
          image: art.image,
          thumb: art.thumb,
          footAnchor: art.footAnchor,
          scene: art.scene,
          sceneAssets: art.sceneAssets,
        }
      : {
          roomKey: null,
          uploadId: row.imageUploadId,
          title: row.title,
          image: uploaded,
          thumb: uploaded,
          footAnchor: DEFAULT_FOOT_ANCHOR,
          scene: 'static',
          sceneAssets: null,
        };
  }

  let animation: AnimationDto | null = null;
  if (animationRow) {
    animation = animationDto(animationRow, lib.replacedDurationMs);
  } else if (row.animationUploadId !== null) {
    animation = {
      key: null,
      uploadId: row.animationUploadId,
      kind: row.kind === 'room' ? 'room' : 'hero',
      name: row.title,
      src: uploadUrl(row.animationUploadId),
      motion: null,
      poster: hero?.image ?? room?.image ?? '',
      posterSprite: hero?.sprite ?? null,
      durationMs: null,
    };
  }

  return {
    id: row.id,
    seedKey: row.seedKey,
    kind: row.kind,
    title: row.title,
    description: row.description,
    price: row.price,
    active: row.active,
    starter: row.starter,
    version: row.version,
    animated: animation !== null || (room !== null && room.scene !== 'static'),
    hero,
    room,
    roomCategory: row.kind === 'room' ? (row.roomCategory ?? roomRow?.category ?? null) : null,
    animation,
    ticket:
      row.kind === 'ticket'
        ? {
            image:
              row.imageUploadId !== null
                ? uploadUrl(row.imageUploadId)
                : row.image === null
                  ? ''
                  : assetUrl(row.image),
            sprite: row.imageUploadId === null ? (row.sprite ?? null) : null,
            uploadId: row.imageUploadId,
          }
        : null,
    rewardType: row.kind === 'ticket' ? row.rewardType : null,
    rewardAmount: row.kind === 'ticket' ? row.rewardAmount : null,
    editedFields: row.editedFields,
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function createCatalogService(db: Db, deps: CatalogDeps): CatalogService {
  const { audit, describeUpload, hasPurchases, replacedDurationMs, clock = Date.now } = deps;

  const loadLibrary = (): Library => ({
    characters: byId(db.select().from(characters).all()),
    animations: byId(db.select().from(animations).all()),
    rooms: byId(db.select().from(rooms).all()),
    replacedDurationMs: (file) => replacedDurationMs?.(file),
  });

  const findRow = (id: number): CatalogItemRow | undefined =>
    db.select().from(catalogItems).where(eq(catalogItems.id, id)).get();

  const requireRow = (id: number): CatalogItemRow => {
    const row = findRow(id);
    if (!row) {
      throw notFound('Товар не найден');
    }
    return row;
  };

  const queryLookup: LibraryLookup = {
    character: (key) => db.select().from(characters).where(eq(characters.key, key)).get(),
    room: (key) => db.select().from(rooms).where(eq(rooms.key, key)).get(),
    animation: (key) => db.select().from(animations).where(eq(animations.key, key)).get(),
  };

  const upload = (id: number, animated: boolean): UploadInfo => {
    const info = describeUpload?.(id);
    if (!info) {
      throw invalid('Загрузка не найдена');
    }
    if (info.animated !== animated) {
      throw invalid(
        animated
          ? 'Для анимации нужен анимированный WebP'
          : 'Для картинки нужна неподвижная картинка',
      );
    }
    return info;
  };

  /** Exactly one of two ways to give a picture. */
  const one = <A, B>(a: A | null, b: B | null, message: string): void => {
    if ((a === null) === (b === null)) {
      throw invalid(message);
    }
  };

  const resolve = (draft: ItemDraft, lookup: LibraryLookup = queryLookup): ItemColumns => {
    const base = {
      kind: draft.kind,
      title: draft.title,
      description: draft.description,
      price: draft.price,
      active: draft.active,
      characterId: null,
      roomId: null,
      animationId: null,
      image: null,
      sprite: null,
      imageUploadId: null,
      animationUploadId: null,
      roomCategory: null,
      rewardType: null,
      rewardAmount: null,
    } satisfies ItemColumns;

    if (draft.kind !== 'room' && draft.roomKey !== null) {
      throw invalid('Для фона выберите тип товара «Комната»');
    }
    if (draft.kind !== 'outfit' && draft.characterKey !== null) {
      throw invalid('Героя можно выбрать только для образа персонажа');
    }
    if (draft.kind !== 'ticket' && draft.imageKey !== null) {
      throw invalid('Готовая картинка билета подходит только билету');
    }

    if (draft.kind === 'outfit') {
      one(draft.characterKey, draft.imageUploadId, 'Выберите героя или загрузите картинку');
      const character =
        draft.characterKey === null ? undefined : lookup.character(draft.characterKey);
      if (draft.characterKey !== null && !character) {
        throw invalid('Нет такого героя');
      }
      if (draft.imageUploadId !== null) {
        upload(draft.imageUploadId, false);
      }
      return {
        ...base,
        ...heroAnimation(draft, lookup),
        characterId: character?.id ?? null,
        imageUploadId: draft.imageUploadId,
      };
    }

    if (draft.kind === 'room') {
      one(draft.roomKey, draft.imageUploadId, 'Выберите фон комнаты или загрузите свой');
      const room = draft.roomKey === null ? undefined : lookup.room(draft.roomKey);
      if (draft.roomKey !== null && !room) {
        throw invalid('Нет такой комнаты');
      }
      if (draft.imageUploadId !== null) {
        upload(draft.imageUploadId, false);
      }
      const roomCategory = draft.roomCategory ?? room?.category ?? null;
      if (roomCategory === null) {
        throw invalid('Выберите раздел комнаты: день, ночь или специальные');
      }
      const hasAnimation = draft.animationKey !== null || draft.animationUploadId !== null;
      if (room?.scene === 'night-hotel' && hasAnimation) {
        throw invalid('У «Ночного отеля» уже есть набор слоёв, свою анимацию добавить нельзя');
      }
      if (draft.animationKey !== null && draft.animationUploadId !== null) {
        throw invalid('Выберите одну анимацию');
      }
      let animationId: number | null = null;
      if (draft.animationKey !== null) {
        const animation = lookup.animation(draft.animationKey);
        if (animation?.kind !== 'room') {
          throw invalid('Нет такой анимации комнаты');
        }
        animationId = animation.id;
      }
      if (draft.animationUploadId !== null) {
        const info = upload(draft.animationUploadId, true);
        if (Math.abs(info.width / info.height - ROOM_RATIO) > ROOM_RATIO_TOLERANCE) {
          throw invalid('Для анимации комнаты нужен горизонтальный WebP с пропорциями 3:2');
        }
      }
      return {
        ...base,
        roomId: room?.id ?? null,
        imageUploadId: draft.imageUploadId,
        roomCategory,
        animationId,
        animationUploadId: draft.animationUploadId,
      };
    }

    // ticket
    one(draft.imageKey, draft.imageUploadId, 'Выберите картинку билета или загрузите свою');
    if (draft.animationKey !== null || draft.animationUploadId !== null) {
      throw invalid('Анимацию можно добавить к персонажу или комнате');
    }
    if (draft.imageKey !== null) {
      if (manifest[draft.imageKey]?.kind !== 'image' || draft.imageKey.startsWith('game/rooms/')) {
        throw invalid('Нет такой картинки для билета');
      }
    } else if (draft.imageUploadId !== null) {
      upload(draft.imageUploadId, false);
    }
    if (draft.rewardType === null) {
      throw invalid('Выберите награду: желание или Robux');
    }
    if (draft.rewardType === 'robux' && draft.rewardAmount === null) {
      throw invalid('Укажите количество Robux за одну покупку');
    }
    return {
      ...base,
      image: draft.imageKey,
      sprite: draft.imageKey === null ? null : draft.sprite,
      imageUploadId: draft.imageUploadId,
      rewardType: draft.rewardType,
      // A wish ticket is one wish; Robux are counted separately from the price.
      rewardAmount: draft.rewardType === 'wish' ? 1 : draft.rewardAmount,
    };
  };

  /** Animation of an outfit: a built-in hero animation or an animated upload. */
  const heroAnimation = (
    draft: ItemDraft,
    lookup: LibraryLookup,
  ): Pick<ItemColumns, 'animationId' | 'animationUploadId'> => {
    if (draft.animationKey !== null && draft.animationUploadId !== null) {
      throw invalid('Выберите одну анимацию');
    }
    if (draft.animationKey !== null) {
      const animation = lookup.animation(draft.animationKey);
      if (animation?.kind !== 'hero') {
        throw invalid('Нет такой анимации героя');
      }
      return { animationId: animation.id, animationUploadId: null };
    }
    if (draft.animationUploadId !== null) {
      upload(draft.animationUploadId, true);
    }
    return { animationId: null, animationUploadId: draft.animationUploadId };
  };

  /** The stored item as a draft (library ids back to keys). */
  const draftOf = (row: CatalogItemRow, lib: Library): ItemDraft => ({
    kind: row.kind,
    title: row.title,
    description: row.description,
    price: row.price,
    active: row.active,
    characterKey:
      row.characterId === null ? null : (lib.characters.get(row.characterId)?.key ?? null),
    roomKey: row.roomId === null ? null : (lib.rooms.get(row.roomId)?.key ?? null),
    animationKey:
      row.animationId === null ? null : (lib.animations.get(row.animationId)?.key ?? null),
    imageKey: row.image,
    sprite: row.sprite ?? null,
    imageUploadId: row.imageUploadId,
    animationUploadId: row.animationUploadId,
    roomCategory: row.roomCategory,
    rewardType: row.rewardType,
    rewardAmount: row.rewardAmount,
  });

  const allItems = (): CatalogItemRow[] =>
    db.select().from(catalogItems).orderBy(asc(catalogItems.id)).all();

  return {
    library() {
      return {
        characters: db
          .select()
          .from(characters)
          .orderBy(asc(characters.id))
          .all()
          .map(characterDto),
        animations: db
          .select()
          .from(animations)
          .orderBy(asc(animations.id))
          .all()
          .map((row) => animationDto(row, (file) => replacedDurationMs?.(file))),
        rooms: db.select().from(rooms).orderBy(asc(rooms.id)).all().map(roomDto),
      };
    },

    items(filter = {}) {
      const lib = loadLibrary();
      return allItems()
        .filter((row) => filter.kind === undefined || row.kind === filter.kind)
        .filter((row) => !filter.activeOnly || row.active)
        .map((row) => toItemDto(row, lib));
    },

    item: (id) => toItemDto(requireRow(id), loadLibrary()),
    findRow,

    starters() {
      const lib = loadLibrary();
      return allItems()
        .filter((row) => row.starter)
        .map((row) => toItemDto(row, lib));
    },

    resolve,
    draftOf: (row) => draftOf(row, loadLibrary()),

    assetUses() {
      const lib = loadLibrary();
      return allItems().flatMap((row) => itemAssetUses(row, lib));
    },

    create(input, actorId) {
      const now = clock();
      const draft: ItemDraft = {
        kind: input.kind,
        title: input.title,
        description: input.description ?? '',
        price: input.price,
        active: input.active ?? true,
        characterKey: input.characterKey ?? null,
        roomKey: input.roomKey ?? null,
        animationKey: input.animationKey ?? null,
        imageKey: input.imageKey ?? null,
        sprite: input.sprite ?? null,
        imageUploadId: input.imageUploadId ?? null,
        animationUploadId: input.animationUploadId ?? null,
        roomCategory: input.roomCategory ?? null,
        rewardType: input.rewardType ?? null,
        rewardAmount: input.rewardAmount ?? null,
      };
      return db.transaction(() => {
        const row = db
          .insert(catalogItems)
          .values({ ...resolve(draft), version: 1, createdAt: now, updatedAt: now })
          .returning()
          .get();
        const payload = auditPayload(catalogItemCreated, {
          kind: row.kind,
          title: row.title,
          price: row.price,
        });
        audit.record(actorId, catalogItemCreated, 'catalog_item', row.id, payload);
        return toItemDto(row, loadLibrary());
      });
    },

    update(id, patch, actorId) {
      const now = clock();
      return db.transaction(() => {
        const current = requireRow(id);
        const lib = loadLibrary();
        const before = draftOf(current, lib);
        const draft: ItemDraft = { ...before, ...patch };
        if (draft.kind !== current.kind && hasPurchases?.(id)) {
          throw conflict('kind_locked', 'Тип купленного товара менять нельзя. Создайте новый.');
        }
        const columns = resolve(draft);
        const after = draftOf({ ...current, ...columns }, lib);
        const changed = EDITABLE_ITEM_FIELDS.filter(
          (field) => !sameValue(before[field], after[field]),
        );
        if (changed.length === 0) {
          return toItemDto(current, lib);
        }
        const editedFields = [...new Set([...current.editedFields, ...changed])];
        const row =
          db
            .update(catalogItems)
            .set({ ...columns, version: current.version + 1, editedFields, updatedAt: now })
            .where(eq(catalogItems.id, id))
            .returning()
            .get() ?? current;
        const payload = auditPayload(catalogItemUpdated, {
          changed,
          title: row.title,
          version: row.version,
        });
        audit.record(actorId, catalogItemUpdated, 'catalog_item', id, payload);
        return toItemDto(row, lib);
      });
    },
  };
}
