import { z } from 'zod';

/**
 * Shared catalog of the shop and the hero (spec/02 §2.5, §2.7, §2.8): a library of built-in
 * art (characters, animations, rooms) and the items that sell or give it.
 */

export const ITEM_KINDS = ['outfit', 'room', 'ticket'] as const;
/** `outfit` — a look of the hero (live with an animation), `room` — a background, `ticket` — a wish. */
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ROOM_CATEGORIES = ['day', 'night', 'special'] as const;
export type RoomCategory = (typeof ROOM_CATEGORIES)[number];

export const REWARD_TYPES = ['wish', 'robux'] as const;
export type RewardType = (typeof REWARD_TYPES)[number];

/** Motion drawn with CSS over a still picture (heroes without an animated WebP). */
export const HERO_MOTIONS = ['bounce', 'float', 'pendulum', 'sway'] as const;
export type HeroMotion = (typeof HERO_MOTIONS)[number];

export const ANIMATION_KINDS = ['hero', 'room'] as const;
export type AnimationKind = (typeof ANIMATION_KINDS)[number];

export const AMBIENT_THEMES = ['embers', 'fairy', 'forest', 'water', 'clock', 'rebound'] as const;
export type AmbientTheme = (typeof AMBIENT_THEMES)[number];

/**
 * Which scene component draws a room (chosen by this field, never by the room's id):
 * a still background, an ambient overlay of a theme, or one of the special rooms.
 */
export const ROOM_SCENES = [
  'static',
  'ambient:embers',
  'ambient:fairy',
  'ambient:forest',
  'ambient:water',
  'ambient:clock',
  'ambient:rebound',
  'night-hotel',
  'astro',
  'rebound',
] as const;
export type RoomScene = (typeof ROOM_SCENES)[number];

/** Key of a file of the asset manifest (`apps/web/public/assets/<key>`). */
export const assetPathSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9/_.-]{1,159}$/, 'Некорректный путь ассета')
  .refine((value) => !value.includes('..'), 'Некорректный путь ассета');

/** URL the web uses for an asset key. */
export const assetUrl = (key: string): string => `/assets/${key}`;
/** URL of an admin upload (FEAT-018). */
export const uploadUrl = (id: number): string => `/api/uploads/${id}`;

/** A cell of a sprite sheet. */
export const spriteSchema = z
  .object({
    cols: z.number().int().min(1).max(8),
    rows: z.number().int().min(1).max(8),
    col: z.number().int().min(0).max(7),
    row: z.number().int().min(0).max(7),
  })
  .refine((s) => s.col < s.cols && s.row < s.rows, 'Ячейка вне спрайта');
export type Sprite = z.infer<typeof spriteSchema>;

const libraryKeySchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/, 'Некорректный ключ');

/** Asset keys a special scene plays (layers and sounds), read whole by the scene component. */
export const sceneAssetsSchema = z.object({
  layers: z.record(z.string(), assetPathSchema).optional(),
  audio: z
    .object({
      ambient: z.array(assetPathSchema).optional(),
      events: z.array(assetPathSchema).optional(),
    })
    .optional(),
});
export type SceneAssets = z.infer<typeof sceneAssetsSchema>;

export const seedCharacterSchema = z.object({
  key: libraryKeySchema,
  name: z.string().min(1).max(100),
  image: assetPathSchema,
  sprite: spriteSchema.optional(),
  /** How far (in % of the picture height) the feet are above its bottom edge. */
  footOffset: z.number().min(0).max(50),
});

export const seedAnimationSchema = z
  .object({
    key: libraryKeySchema,
    name: z.string().min(1).max(100),
    kind: z.enum(ANIMATION_KINDS),
    /** Animated WebP; absent for a CSS motion. */
    src: assetPathSchema.optional(),
    motion: z.enum(HERO_MOTIONS).optional(),
    poster: assetPathSchema,
    posterSprite: spriteSchema.optional(),
    durationMs: z.number().int().min(100).max(60_000),
  })
  .refine((a) => (a.src === undefined) !== (a.motion === undefined), 'Нужен src или motion');

export const footAnchorSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});
export type FootAnchor = z.infer<typeof footAnchorSchema>;

export const seedRoomSchema = z.object({
  key: libraryKeySchema,
  title: z.string().min(1).max(100),
  category: z.enum(ROOM_CATEGORIES),
  image: assetPathSchema,
  thumb: assetPathSchema,
  /** Where the hero's feet stand, in % of the 1536×1024 scene. */
  footAnchor: footAnchorSchema,
  scene: z.enum(ROOM_SCENES),
  sceneAssets: sceneAssetsSchema.optional(),
});

export const seedItemSchema = z.object({
  seedKey: libraryKeySchema,
  kind: z.enum(ITEM_KINDS),
  title: z.string().min(1).max(100),
  description: z.string().max(800),
  price: z.number().int().min(0).max(100_000),
  /** Shown in the learner's shop. */
  active: z.boolean(),
  /** Owned by every learner from the start (not sold). */
  starter: z.boolean().optional(),
  character: libraryKeySchema.optional(),
  room: libraryKeySchema.optional(),
  animation: libraryKeySchema.optional(),
  /** Picture of a ticket. */
  image: assetPathSchema.optional(),
  sprite: spriteSchema.optional(),
  rewardType: z.enum(REWARD_TYPES).optional(),
  rewardAmount: z.number().int().min(1).max(100_000).optional(),
});

/** `apps/api/seed/catalog.json`. */
export const catalogSeedSchema = z.object({
  characters: z.array(seedCharacterSchema),
  animations: z.array(seedAnimationSchema),
  rooms: z.array(seedRoomSchema),
  items: z.array(seedItemSchema),
});
export type CatalogSeed = z.infer<typeof catalogSeedSchema>;

/** Fields of an item an admin may set; edited fields of seeded items survive re-seeding. */
export const EDITABLE_ITEM_FIELDS = [
  'kind',
  'title',
  'description',
  'price',
  'active',
  'characterKey',
  'roomKey',
  'animationKey',
  'imageKey',
  'sprite',
  'imageUploadId',
  'animationUploadId',
  'roomCategory',
  'rewardType',
  'rewardAmount',
] as const;
export type EditableItemField = (typeof EDITABLE_ITEM_FIELDS)[number];

const uploadIdSchema = z.number().int().positive();

const itemFields = {
  kind: z.enum(ITEM_KINDS),
  title: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, 'Название не может быть пустым').max(100)),
  description: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(800)),
  price: z.number().int().min(0).max(100_000),
  active: z.boolean(),
  /** Built-in hero art (outfit). */
  characterKey: libraryKeySchema.nullable(),
  /** Built-in room art (room). */
  roomKey: libraryKeySchema.nullable(),
  /** Built-in animation (live outfit or animated room). */
  animationKey: libraryKeySchema.nullable(),
  /** Built-in picture of a ticket (asset key) and its sprite cell. */
  imageKey: assetPathSchema.nullable(),
  sprite: spriteSchema.nullable(),
  /** Uploaded still picture instead of the built-in one (hero, room or ticket). */
  imageUploadId: uploadIdSchema.nullable(),
  /** Uploaded animated WebP instead of a built-in animation. */
  animationUploadId: uploadIdSchema.nullable(),
  roomCategory: z.enum(ROOM_CATEGORIES).nullable(),
  rewardType: z.enum(REWARD_TYPES).nullable(),
  rewardAmount: z.number().int().min(1).max(100_000).nullable(),
};

export const catalogItemCreateSchema = z.object({
  ...itemFields,
  description: itemFields.description.optional(),
  active: itemFields.active.optional(),
  characterKey: itemFields.characterKey.optional(),
  roomKey: itemFields.roomKey.optional(),
  animationKey: itemFields.animationKey.optional(),
  imageKey: itemFields.imageKey.optional(),
  sprite: itemFields.sprite.optional(),
  imageUploadId: itemFields.imageUploadId.optional(),
  animationUploadId: itemFields.animationUploadId.optional(),
  roomCategory: itemFields.roomCategory.optional(),
  rewardType: itemFields.rewardType.optional(),
  rewardAmount: itemFields.rewardAmount.optional(),
});
export type CatalogItemCreateRequest = z.infer<typeof catalogItemCreateSchema>;

export const catalogItemUpdateSchema = z
  .object(itemFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Нечего менять');
export type CatalogItemUpdateRequest = z.infer<typeof catalogItemUpdateSchema>;

/** A hero picture: still art of a character or an upload. */
export interface HeroArtDto {
  readonly characterKey: string | null;
  readonly uploadId: number | null;
  readonly name: string;
  readonly image: string;
  readonly sprite: Sprite | null;
  readonly footOffset: number;
}

/** What makes an outfit or a room move. */
export interface AnimationDto {
  readonly key: string | null;
  readonly uploadId: number | null;
  readonly kind: AnimationKind;
  readonly name: string;
  /** Animated WebP; null for a CSS motion. */
  readonly src: string | null;
  readonly motion: HeroMotion | null;
  readonly poster: string;
  readonly posterSprite: Sprite | null;
  readonly durationMs: number | null;
}

export interface RoomArtDto {
  readonly roomKey: string | null;
  readonly uploadId: number | null;
  readonly title: string;
  readonly image: string;
  readonly thumb: string;
  readonly footAnchor: FootAnchor;
  readonly scene: RoomScene;
  readonly sceneAssets: SceneAssets | null;
}

export interface TicketArtDto {
  readonly image: string;
  readonly sprite: Sprite | null;
  readonly uploadId: number | null;
}

export interface CatalogItemDto {
  readonly id: number;
  /** Set on items of the installation seed. */
  readonly seedKey: string | null;
  readonly kind: ItemKind;
  readonly title: string;
  readonly description: string;
  readonly price: number;
  readonly active: boolean;
  readonly starter: boolean;
  /** Grows with every change; a purchase of an older version is refused. */
  readonly version: number;
  /** A live hero, or a room that moves (animation or a non-static scene). */
  readonly animated: boolean;
  readonly hero: HeroArtDto | null;
  readonly room: RoomArtDto | null;
  readonly roomCategory: RoomCategory | null;
  readonly animation: AnimationDto | null;
  readonly ticket: TicketArtDto | null;
  readonly rewardType: RewardType | null;
  readonly rewardAmount: number | null;
  /** Fields the admin changed (the seed leaves them alone). */
  readonly editedFields: EditableItemField[];
}

export interface CharacterDto {
  readonly key: string;
  readonly name: string;
  readonly image: string;
  readonly sprite: Sprite | null;
  readonly footOffset: number;
}

export interface RoomDto {
  readonly key: string;
  readonly title: string;
  readonly category: RoomCategory;
  readonly image: string;
  readonly thumb: string;
  readonly footAnchor: FootAnchor;
  readonly scene: RoomScene;
  readonly sceneAssets: SceneAssets | null;
}

/** Built-in art the admin picks from in the item editor. */
export interface CatalogLibraryDto {
  readonly characters: CharacterDto[];
  readonly animations: (AnimationDto & { readonly key: string })[];
  readonly rooms: RoomDto[];
}
