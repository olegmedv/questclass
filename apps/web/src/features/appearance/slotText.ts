// How a replaceable built-in file is named on the admin screens (FEAT-062): by what it is for its
// owner and where the learner sees it, not by its file name.
import type { AppearanceSlotDto } from '@questclass/shared/assets/appearance';
import type { AssetSlotKind } from '@questclass/shared/assets/slots';
import type { AssetUseDto } from '@questclass/shared/assets/uses';
import type { UploadDto } from '../admin-shop/queries';

export const KIND_LABEL: Record<AssetSlotKind, string> = {
  image: 'Картинка',
  animation: 'Анимация',
  audio: 'Звук',
};

export const ACCEPT: Record<AssetSlotKind, string> = {
  image: 'image/png,image/jpeg,image/webp',
  animation: 'image/webp',
  audio: 'audio/mpeg,audio/ogg,.mp3,.ogg',
};

export const FORMAT_HINT: Record<AssetSlotKind, string> = {
  image: 'PNG, JPEG или WebP',
  animation: 'анимированный WebP',
  audio: 'MP3 (играет везде) или OGG',
};

const lowerFirst = (text: string): string =>
  text.charAt(0).toLocaleLowerCase('ru-RU') + text.slice(1);

/** «Ночной отель — слой сцены: свечи», «Логотип». */
export const labelOfUse = (use: AssetUseDto): string =>
  use.owner === null ? use.part : `${use.owner} — ${lowerFirst(use.part)}`;

export const kb = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1024))} КБ`;

export const fileName = (slot: AppearanceSlotDto): string =>
  slot.key.slice(slot.key.lastIndexOf('/') + 1);

/** «700 × 700 · 79 КБ», «Анимация · 10,1 с · 6 МБ», «Звук · 112 КБ». */
export function builtinFacts(slot: AppearanceSlotDto): string {
  const { width, height, bytes, durationMs } = slot.builtin;
  const size = width && height ? `${width} × ${height}` : KIND_LABEL[slot.kind];
  const length = durationMs === null ? null : `${(durationMs / 1000).toLocaleString('ru-RU')} с`;
  return [size, length, kb(bytes)].filter(Boolean).join(' · ');
}

/** Tile of the file in a list of many owners: the owner, then what the file is for it. */
export function slotTitle(slot: AppearanceSlotDto): { title: string; subtitle: string } {
  const [first, ...rest] = slot.uses;
  if (!first) return { title: fileName(slot), subtitle: 'Сейчас нигде не показывается' };
  const more = rest.length > 0 ? ` · и ещё ${rest.length}` : '';
  return first.owner === null
    ? { title: first.part, subtitle: `${first.place}${more}` }
    : { title: first.owner, subtitle: `${first.part}${more}` };
}

/** What the search on «Оформление» looks through. */
export const slotSearchText = (slot: AppearanceSlotDto): string =>
  [slot.key, ...slot.uses.flatMap((use) => [use.owner ?? '', use.part, use.place])]
    .join(' ')
    .toLocaleLowerCase('ru-RU');

/** An earlier upload that may stand in for the file (same kind). */
export function fits(slot: AppearanceSlotDto, upload: UploadDto): boolean {
  if (slot.kind === 'audio') return upload.kind === 'audio';
  return upload.kind === 'image' && upload.animated === (slot.kind === 'animation');
}
