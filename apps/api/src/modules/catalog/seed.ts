import {
  EDITABLE_ITEM_FIELDS,
  catalogSeedSchema,
  type CatalogSeed,
  type EditableItemField,
} from '@questclass/shared/catalog/dto';
import { eq } from 'drizzle-orm';
import catalogJson from '../../../seed/catalog.json';
import type { Db } from '../../db/client';
import {
  animations,
  catalogItems,
  characters,
  rooms,
  type CatalogItemInsert,
  type CatalogItemRow,
} from '../../db/schema/catalog';
import { HttpError } from '../../http/errors';
import {
  preloadLibrary,
  type CatalogService,
  type ItemColumns,
  type ItemDraft,
  type LibraryLookup,
} from './service';

let parsed: CatalogSeed | undefined;

/** The built-in catalog (`apps/api/seed/catalog.json`), validated once per process. */
export function loadCatalogSeed(): CatalogSeed {
  parsed ??= catalogSeedSchema.parse(catalogJson);
  return parsed;
}

export interface SeedResult {
  readonly inserted: number;
  readonly updated: number;
}

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

interface RowOps<T> {
  all(): (Record<string, unknown> & { id: number; key: string })[];
  insert(values: T[]): void;
  update(id: number, value: T): void;
}

/**
 * Inserts or updates library rows by `key`; rows that already match are not written.
 * Library rows belong to the seed (the admin does not edit them).
 */
function upsertByKey<T extends Record<string, unknown> & { key: string }>(
  values: readonly T[],
  ops: RowOps<T>,
): SeedResult {
  const existing = new Map(ops.all().map((row) => [row.key, row]));
  const fresh: T[] = [];
  let updated = 0;
  for (const value of values) {
    const found = existing.get(value.key);
    if (!found) {
      fresh.push(value);
    } else if (Object.entries(value).some(([column, v]) => !same(found[column], v))) {
      ops.update(found.id, value);
      updated += 1;
    }
  }
  if (fresh.length > 0) {
    ops.insert(fresh);
  }
  return { inserted: fresh.length, updated };
}

function itemDraft(item: CatalogSeed['items'][number]): ItemDraft {
  return {
    kind: item.kind,
    title: item.title,
    description: item.description,
    price: item.price,
    active: item.active,
    characterKey: item.character ?? null,
    roomKey: item.room ?? null,
    animationKey: item.animation ?? null,
    imageKey: item.image ?? null,
    sprite: item.sprite ?? null,
    imageUploadId: null,
    animationUploadId: null,
    roomCategory: null,
    rewardType: item.rewardType ?? null,
    rewardAmount: item.rewardAmount ?? null,
  };
}

/**
 * Seeds the shared catalog (startup hook, after migrations). Library rows are upserted by
 * `key`, items by `seed_key`. For an item the admin edited, the edited fields keep the admin's
 * values; a change of the other fields bumps `version` (old purchases of it are not affected).
 * Nothing is written when the database already matches the seed.
 */
export function seedCatalog(
  db: Db,
  catalog: Pick<CatalogService, 'resolve' | 'draftOf'>,
  seed: CatalogSeed = loadCatalogSeed(),
  now: number = Date.now(),
): SeedResult {
  return db.transaction(() => {
    const library = [
      upsertByKey(
        seed.characters.map((c) => ({ ...c, sprite: c.sprite ?? null })),
        {
          all: () => db.select().from(characters).all(),
          insert: (v) => db.insert(characters).values(v).run(),
          update: (id, v) => db.update(characters).set(v).where(eq(characters.id, id)).run(),
        },
      ),
      upsertByKey(
        seed.animations.map((a) => ({
          ...a,
          src: a.src ?? null,
          motion: a.motion ?? null,
          posterSprite: a.posterSprite ?? null,
        })),
        {
          all: () => db.select().from(animations).all(),
          insert: (v) => db.insert(animations).values(v).run(),
          update: (id, v) => db.update(animations).set(v).where(eq(animations.id, id)).run(),
        },
      ),
      upsertByKey(
        seed.rooms.map(({ footAnchor, sceneAssets, ...r }) => ({
          ...r,
          footX: footAnchor.x,
          footY: footAnchor.y,
          sceneAssets: sceneAssets ?? null,
        })),
        {
          all: () => db.select().from(rooms).all(),
          insert: (v) => db.insert(rooms).values(v).run(),
          update: (id, v) => db.update(rooms).set(v).where(eq(rooms.id, id)).run(),
        },
      ),
    ];
    let updated = library.reduce((n, r) => n + r.updated, 0);
    const lookup = preloadLibrary(db);
    const existing = new Map(
      db
        .select()
        .from(catalogItems)
        .all()
        .filter((row) => row.seedKey !== null)
        .map((row) => [row.seedKey, row]),
    );
    const fresh: CatalogItemInsert[] = [];

    for (const item of seed.items) {
      const starter = item.starter ?? false;
      const seeded = itemDraft(item);
      const current = existing.get(item.seedKey);
      if (!current) {
        fresh.push({
          ...catalog.resolve(seeded, lookup),
          seedKey: item.seedKey,
          starter,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        continue;
      }
      const columns = mergedColumns(catalog, lookup, current, seeded);
      if (!columns) {
        continue;
      }
      const changed =
        current.starter !== starter ||
        Object.entries(columns).some(
          ([column, value]) => !same(current[column as keyof ItemColumns], value),
        );
      if (changed) {
        db.update(catalogItems)
          .set({ ...columns, starter, version: current.version + 1, updatedAt: now })
          .where(eq(catalogItems.id, current.id))
          .run();
        updated += 1;
      }
    }
    if (fresh.length > 0) {
      db.insert(catalogItems).values(fresh).run();
    }
    const inserted = library.reduce((n, r) => n + r.inserted, 0) + fresh.length;
    return { inserted, updated };
  });
}

/**
 * Columns of a seeded item: the admin's edited fields keep their values, the rest follows the
 * seed, validated by the same rules as an admin save. A mix that is no longer a valid item
 * leaves the row as it is (null).
 */
function mergedColumns(
  catalog: Pick<CatalogService, 'resolve' | 'draftOf'>,
  lookup: LibraryLookup,
  current: CatalogItemRow,
  seeded: ItemDraft,
): ItemColumns | null {
  const edited = new Set<EditableItemField>(current.editedFields);
  if (edited.size === 0) {
    return catalog.resolve(seeded, lookup);
  }
  const mine = catalog.draftOf(current);
  const merged = Object.fromEntries(
    EDITABLE_ITEM_FIELDS.map((field) => [field, edited.has(field) ? mine[field] : seeded[field]]),
  ) as unknown as ItemDraft;
  try {
    return catalog.resolve(merged, lookup);
  } catch (err) {
    if (err instanceof HttpError) {
      console.warn(
        `Catalog seed: item ${current.seedKey} keeps the admin's version (${err.message})`,
      );
      return null;
    }
    throw err;
  }
}
