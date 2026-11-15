// The built-in files of a shop item the form above does not edit (FEAT-064): a special scene's
// background, layers and sounds, the room preview, the first frame of an animation. Each is replaced
// in place («Оформление» does the same); a file other items share says so in its dialog.
import type { AppearanceSlotDto } from '@questclass/shared/assets/appearance';
import type { AssetUseRole } from '@questclass/shared/assets/uses';
import type { CatalogItemDto } from '@questclass/shared/catalog/dto';
import { Card, Notice } from '@questclass/ui';
import { errorText } from '../admin/forms';
import { useAdminAppearance } from '../appearance/queries';
import { SlotTiles, type SlotName } from '../appearance/SlotTiles';
import { builtinFacts } from '../appearance/slotText';

/** The form edits the picture and the animation itself (own upload or another built-in one). */
const EXTRA_ROLES: ReadonlySet<AssetUseRole> = new Set(['thumb', 'poster', 'layer', 'sound']);

/** As the scene is built: the background, its preview, the first frame, the layers, the sounds. */
const ROLE_ORDER: readonly AssetUseRole[] = ['picture', 'thumb', 'poster', 'layer', 'sound'];

export function ItemFiles({ item }: { item: CatalogItemDto }) {
  const slots = useAdminAppearance();
  const href = `/admin/shop/${item.id}`;
  const scene = item.room !== null && item.room.scene !== 'static';
  const itemUseOf = (slot: AppearanceSlotDto) =>
    slot.uses.find(
      (use) =>
        use.href === href && (EXTRA_ROLES.has(use.role) || (scene && use.role === 'picture')),
    );
  const rank = (slot: AppearanceSlotDto) => {
    const use = itemUseOf(slot);
    return use ? ROLE_ORDER.indexOf(use.role) : ROLE_ORDER.length;
  };
  const list = (slots.data ?? [])
    .filter((slot) => itemUseOf(slot) !== undefined)
    .sort((a, b) => rank(a) - rank(b));
  if (slots.isError) {
    return <Notice tone="danger">{errorText(slots.error)}</Notice>;
  }
  if (list.length === 0) return null;
  const name: SlotName = (slot) => {
    const others = slot.uses.length - 1;
    return {
      title: itemUseOf(slot)?.part ?? slot.key,
      subtitle: others > 0 ? `Общий файл, ещё в ${others}` : builtinFacts(slot),
    };
  };
  return (
    <Card
      title={scene ? 'Сцена комнаты: фон, слои и звуки' : 'Ещё картинки товара'}
      description={
        scene
          ? 'Живая сцена собрана из этих встроенных файлов — любой можно заменить своим, и сцена останется живой. «Своя загрузка» в блоке «Картинка» заменяет всю сцену одной неподвижной картинкой.'
          : 'Встроенные файлы этого товара: нажмите, чтобы заменить своим или вернуть встроенный.'
      }
    >
      <SlotTiles slots={list} name={name} />
    </Card>
  );
}
