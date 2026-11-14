// Built-in files the admin may replace (FEAT-058/059): every picture, animation and sound of the
// asset manifest. A sound ships as an OGG + MP3 pair and is one slot; fonts and texts are not
// slots. Groups only order the admin screen; they match path prefixes, the first match wins.
import manifestJson from './manifest.json';

export type AssetSlotKind = 'image' | 'animation' | 'audio';

interface ManifestEntry {
  readonly kind: string;
  readonly w?: number;
  readonly h?: number;
  readonly bytes?: number;
  readonly animated?: boolean;
  readonly frames?: number;
  readonly durationMs?: number;
}

export interface AssetSlot {
  /** Stable id: the file's manifest key (for a sound, its `.mp3`). */
  readonly key: string;
  /** Manifest files the slot stands for (a sound: `.mp3` and `.ogg`). */
  readonly files: readonly string[];
  readonly kind: AssetSlotKind;
  readonly group: AssetGroupId;
  readonly width: number | null;
  readonly height: number | null;
  /** Size of the built-in file (the larger one of a sound pair). */
  readonly bytes: number;
  readonly frames: number | null;
  readonly durationMs: number | null;
}

export const ASSET_GROUPS = [
  { id: 'brand', title: 'Логотип и значки приложения', prefixes: ['icons/'] },
  { id: 'subjects', title: 'Значки предметов', prefixes: ['game/subjects'] },
  {
    id: 'heroes',
    title: 'Герои',
    prefixes: ['game/characters/', 'game/fitting-room/', 'game/special.', 'game/heroes.'],
  },
  { id: 'animations', title: 'Анимации героев', prefixes: ['game/animated/'] },
  { id: 'night-hotel', title: 'Комната «Ночной отель»', prefixes: ['game/rooms/night-hotel/'] },
  {
    id: 'astro',
    title: 'Комната Astro',
    prefixes: ['game/rooms/astro-', 'game/rooms/room-astro-'],
  },
  {
    id: 'rebound',
    title: 'Комната Rebound',
    prefixes: ['game/rooms/rebound-', 'game/rooms/room-rebound-'],
  },
  { id: 'rooms', title: 'Комнаты', prefixes: ['game/rooms/'] },
  { id: 'celebrations', title: 'Праздники и серия занятий', prefixes: ['celebrations/'] },
  { id: 'rewards', title: 'Награды', prefixes: ['rewards/'] },
  { id: 'sounds', title: 'Звуки интерфейса', prefixes: ['game/ui-audio/'] },
  { id: 'wishes', title: 'Желания и билетики', prefixes: ['game/wishes', 'game/report-'] },
  { id: 'menu', title: 'Меню', prefixes: ['game/menu/'] },
  { id: 'other', title: 'Прочее', prefixes: [''] },
] as const;

export type AssetGroupId = (typeof ASSET_GROUPS)[number]['id'];

const manifest = manifestJson as Record<string, ManifestEntry>;

const groupOf = (key: string): AssetGroupId =>
  ASSET_GROUPS.find((group) => group.prefixes.some((prefix) => key.startsWith(prefix)))?.id ??
  'other';

const kindOf = (entry: ManifestEntry): AssetSlotKind | null => {
  if (entry.kind === 'audio') return 'audio';
  if (entry.kind === 'image') return entry.animated ? 'animation' : 'image';
  return null;
};

const stemOf = (key: string): string => key.replace(/\.[a-z0-9]+$/i, '');

function buildSlots(): AssetSlot[] {
  const slots: AssetSlot[] = [];
  const sounds = new Map<string, string[]>();
  for (const [key, entry] of Object.entries(manifest)) {
    const kind = kindOf(entry);
    if (kind === 'audio') {
      const stem = stemOf(key);
      sounds.set(stem, [...(sounds.get(stem) ?? []), key]);
    } else if (kind) {
      slots.push({
        key,
        files: [key],
        kind,
        group: groupOf(key),
        width: entry.w ?? null,
        height: entry.h ?? null,
        bytes: entry.bytes ?? 0,
        frames: entry.frames ?? null,
        durationMs: entry.durationMs ?? null,
      });
    }
  }
  for (const files of sounds.values()) {
    const sorted = [...files].sort(
      (a, b) => Number(b.endsWith('.mp3')) - Number(a.endsWith('.mp3')),
    );
    const key = sorted[0] ?? '';
    slots.push({
      key,
      files: sorted,
      kind: 'audio',
      group: groupOf(key),
      width: null,
      height: null,
      bytes: Math.max(...sorted.map((file) => manifest[file]?.bytes ?? 0)),
      frames: null,
      durationMs: null,
    });
  }
  const order = new Map<AssetGroupId, number>(ASSET_GROUPS.map((group, i) => [group.id, i]));
  return slots.sort(
    (a, b) => (order.get(a.group) ?? 0) - (order.get(b.group) ?? 0) || a.key.localeCompare(b.key),
  );
}

/** All replaceable built-in files, ordered by group and path. */
export const ASSET_SLOTS: readonly AssetSlot[] = buildSlots();

const bySlotKey = new Map(ASSET_SLOTS.map((slot) => [slot.key, slot]));
const byFile = new Map(ASSET_SLOTS.flatMap((slot) => slot.files.map((file) => [file, slot])));

/** The slot with this id (`game/rooms/room-bright.webp`, `game/ui-audio/x.mp3`). */
export const assetSlot = (key: string): AssetSlot | undefined => bySlotKey.get(key);

/** The slot a served file belongs to (`…/x.ogg` → the sound slot `…/x.mp3`). */
export const assetSlotOfFile = (file: string): AssetSlot | undefined => byFile.get(file);
