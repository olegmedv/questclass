// Replaceable built-in files (FEAT-062): pictures and animations as tiles, sounds as a compact
// list under them; each opens the file's dialog. The caller names them: «Оформление» by owner,
// an item editor by what the file is for the item.
import type { AppearanceSlotDto } from '@questclass/shared/assets/appearance';
import { ActionList, Badge, Grid, ItemCard, Stack } from '@questclass/ui';
import { useState } from 'react';
import { SlotDialog } from './SlotDialog';
import { slotTitle } from './slotText';

export type SlotName = (slot: AppearanceSlotDto) => { title: string; subtitle: string };

export function SlotTiles({
  slots,
  name = slotTitle,
}: {
  slots: readonly AppearanceSlotDto[];
  name?: SlotName;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // The dialog follows the list: a replacement refreshes it.
  const open = slots.find((slot) => slot.key === openKey) ?? null;
  const pictures = slots.filter((slot) => slot.kind !== 'audio');
  const sounds = slots.filter((slot) => slot.kind === 'audio');
  return (
    <Stack gap="md">
      {pictures.length > 0 && (
        <Grid min="sm">
          {pictures.map((slot) => {
            const { title, subtitle } = name(slot);
            return (
              <ItemCard
                key={slot.key}
                title={title}
                subtitle={subtitle}
                media={{ src: slot.url, alt: '' }}
                badge={slot.replacement ? <Badge tone="success">Своя</Badge> : undefined}
                onClick={() => setOpenKey(slot.key)}
                actionLabel={`Заменить: ${title}, ${subtitle}`}
              />
            );
          })}
        </Grid>
      )}
      {sounds.length > 0 && (
        <ActionList
          label="Звуки"
          items={sounds.map((slot) => {
            const { title, subtitle } = name(slot);
            return {
              id: slot.key,
              title,
              description: slot.replacement ? `Свой звук · ${subtitle}` : subtitle,
              onClick: () => setOpenKey(slot.key),
            };
          })}
        />
      )}
      {open && <SlotDialog slot={open} onClose={() => setOpenKey(null)} />}
    </Stack>
  );
}
