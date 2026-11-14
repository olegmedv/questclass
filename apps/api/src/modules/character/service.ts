import type { CharacterDto, OwnedItemDto } from '@questclass/shared/character/dto';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { learnerCharacters, type LearnerCharacterRow } from '../../db/schema/character';
import { forbidden } from '../../http/errors';
import type { OwnedThing, Ownership } from '../shop/ownership';

export interface CharacterService {
  /**
   * The hero as it is now. Read-only: what is worn but no longer owned (or never chosen) is
   * shown as the first owned look or room, without writing that down.
   */
  view(learnerId: number): CharacterDto;
  /** Wears a look the learner owns; otherwise 403. */
  setLook(learnerId: number, itemId: number): CharacterDto;
  /** Puts up a room the learner owns; otherwise 403. */
  setRoom(learnerId: number, itemId: number): CharacterDto;
  setName(learnerId: number, name: string): CharacterDto;
}

export interface CharacterDeps {
  readonly ownership: Ownership;
  readonly clock?: () => number;
}

const toOwnedDto = (thing: OwnedThing): OwnedItemDto => ({
  ...thing.snapshot,
  itemId: thing.itemId,
  purchaseId: thing.purchaseId,
  kind: thing.kind,
  title: thing.title,
});

const NOT_OWNED = {
  outfit: 'Сначала открой этот скин в магазине',
  room: 'Сначала открой этот фон в магазине',
} as const;

export function createCharacterService(db: Db, deps: CharacterDeps): CharacterService {
  const { ownership, clock = Date.now } = deps;

  const rowOf = (learnerId: number): LearnerCharacterRow | undefined =>
    db.select().from(learnerCharacters).where(eq(learnerCharacters.learnerId, learnerId)).get();

  const view = (learnerId: number): CharacterDto => {
    const owned = ownership.owned(learnerId).map(toOwnedDto);
    const looks = owned.filter((o) => o.kind === 'outfit');
    const rooms = owned.filter((o) => o.kind === 'room');
    const row = rowOf(learnerId);
    const worn = (list: OwnedItemDto[], itemId: number | null | undefined) =>
      list.find((o) => o.itemId === itemId) ?? list[0] ?? null;
    return {
      name: row?.name ?? '',
      look: worn(looks, row?.lookItemId),
      room: worn(rooms, row?.roomItemId),
      looks,
      rooms,
    };
  };

  /** One column of the learner's row (the row is created by the first change). */
  const save = (
    learnerId: number,
    set: Partial<Pick<LearnerCharacterRow, 'name' | 'lookItemId' | 'roomItemId'>>,
  ): void => {
    const updatedAt = clock();
    db.insert(learnerCharacters)
      .values({ learnerId, ...set, updatedAt })
      .onConflictDoUpdate({ target: learnerCharacters.learnerId, set: { ...set, updatedAt } })
      .run();
  };

  const equip = (learnerId: number, itemId: number, kind: 'outfit' | 'room'): CharacterDto => {
    const thing = ownership.owned(learnerId).find((o) => o.itemId === itemId && o.kind === kind);
    if (!thing) {
      throw forbidden(NOT_OWNED[kind], 'not_owned');
    }
    save(learnerId, kind === 'outfit' ? { lookItemId: itemId } : { roomItemId: itemId });
    return view(learnerId);
  };

  return {
    view,
    setLook: (learnerId, itemId) => equip(learnerId, itemId, 'outfit'),
    setRoom: (learnerId, itemId) => equip(learnerId, itemId, 'room'),
    setName(learnerId, name) {
      save(learnerId, { name });
      return view(learnerId);
    },
  };
}
