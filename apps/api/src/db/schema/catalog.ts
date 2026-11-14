import type {
  AnimationKind,
  EditableItemField,
  HeroMotion,
  ItemKind,
  RewardType,
  RoomCategory,
  RoomScene,
  SceneAssets,
  Sprite,
} from '@questclass/shared/catalog/dto';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { media } from './media';

/**
 * Built-in hero art (CLAUDE.md rule 5: one shared catalog). Seeded from `seed/catalog.json`
 * by `key`; items refer to it.
 */
export const characters = sqliteTable(
  'characters',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    key: text().notNull(),
    name: text().notNull(),
    /** Asset key of the still picture. */
    image: text().notNull(),
    sprite: text({ mode: 'json' }).$type<Sprite>(),
    /** Feet above the picture's bottom edge, % of its height. */
    footOffset: real().notNull(),
  },
  (t) => [uniqueIndex('characters_key_uq').on(t.key)],
);

/** Built-in animations: an animated WebP or a CSS motion over a still picture. */
export const animations = sqliteTable(
  'animations',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    key: text().notNull(),
    name: text().notNull(),
    kind: text().$type<AnimationKind>().notNull(),
    src: text(),
    motion: text().$type<HeroMotion>(),
    poster: text().notNull(),
    posterSprite: text({ mode: 'json' }).$type<Sprite>(),
    durationMs: integer().notNull(),
  },
  (t) => [uniqueIndex('animations_key_uq').on(t.key)],
);

/** Built-in room art; `scene` picks the component that draws it. */
export const rooms = sqliteTable(
  'rooms',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    key: text().notNull(),
    title: text().notNull(),
    category: text().$type<RoomCategory>().notNull(),
    image: text().notNull(),
    thumb: text().notNull(),
    /** Feet of the hero, % of the 1536×1024 scene. */
    footX: real().notNull(),
    footY: real().notNull(),
    scene: text().$type<RoomScene>().notNull(),
    /** Layers and sounds of a special scene (value object, read whole). */
    sceneAssets: text({ mode: 'json' }).$type<SceneAssets>(),
  },
  (t) => [uniqueIndex('rooms_key_uq').on(t.key)],
);

/**
 * What the shop sells and the hero can wear: outfits (a character, maybe with an animation),
 * rooms and tickets (wishes, Robux). Each save bumps `version`; a purchase of an older version
 * is refused. Seeded rows are upserted by `seed_key`, except the fields the admin edited.
 */
export const catalogItems = sqliteTable(
  'catalog_items',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    seedKey: text(),
    kind: text().$type<ItemKind>().notNull(),
    title: text().notNull(),
    description: text().notNull().default(''),
    price: integer().notNull(),
    active: integer({ mode: 'boolean' }).notNull().default(false),
    /** Owned by every learner from the start. */
    starter: integer({ mode: 'boolean' }).notNull().default(false),
    version: integer().notNull().default(1),
    characterId: integer().references(() => characters.id, { onDelete: 'restrict' }),
    roomId: integer().references(() => rooms.id, { onDelete: 'restrict' }),
    animationId: integer().references(() => animations.id, { onDelete: 'restrict' }),
    /** Built-in picture of a ticket (asset key) and its sprite cell. */
    image: text(),
    sprite: text({ mode: 'json' }).$type<Sprite>(),
    imageUploadId: integer().references(() => media.id, { onDelete: 'restrict' }),
    animationUploadId: integer().references(() => media.id, { onDelete: 'restrict' }),
    roomCategory: text().$type<RoomCategory>(),
    rewardType: text().$type<RewardType>(),
    rewardAmount: integer(),
    /** Fields changed by an admin (value object): the seed does not overwrite them. */
    editedFields: text({ mode: 'json' }).$type<EditableItemField[]>().notNull().default([]),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    uniqueIndex('catalog_items_seed_key_uq').on(t.seedKey),
    index('catalog_items_kind_active_idx').on(t.kind, t.active),
  ],
);

export type CharacterRow = typeof characters.$inferSelect;
export type AnimationRow = typeof animations.$inferSelect;
export type RoomRow = typeof rooms.$inferSelect;
export type CatalogItemRow = typeof catalogItems.$inferSelect;
export type CatalogItemInsert = typeof catalogItems.$inferInsert;
