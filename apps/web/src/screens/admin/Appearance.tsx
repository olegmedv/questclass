// /admin/appearance — «Оформление» (FEAT-061): every built-in picture, animation and sound of the
// app, by group; each can be replaced with an own file (or an earlier upload) and put back.
import type { AppearanceSlotDto } from '@questclass/shared/assets/appearance';
import { ASSET_GROUPS, type AssetSlotKind } from '@questclass/shared/assets/slots';
import {
  Accordion,
  Badge,
  Button,
  EmptyState,
  Field,
  FileInput,
  Grid,
  ItemCard,
  Modal,
  Notice,
  RotateCcw,
  Search,
  SegmentedControl,
  Select,
  Spinner,
  Stack,
  Text,
  TextInput,
  Volume2,
  useToast,
} from '@questclass/ui';
import { useMemo, useState } from 'react';
import { errorText, formatDateTime } from '../../features/admin/forms';
import { useUploads, type UploadDto } from '../../features/admin-shop/queries';
import {
  useAdminAppearance,
  useReplaceWithFile,
  useReplaceWithUpload,
  useRestoreBuiltin,
} from '../../features/appearance/queries';
import { AdminPage } from '../../templates/AdminShell';

const KIND_LABEL: Record<AssetSlotKind, string> = {
  image: 'Картинка',
  animation: 'Анимация',
  audio: 'Звук',
};

const ACCEPT: Record<AssetSlotKind, string> = {
  image: 'image/png,image/jpeg,image/webp',
  animation: 'image/webp',
  audio: 'audio/mpeg,audio/ogg,.mp3,.ogg',
};

const FORMAT_HINT: Record<AssetSlotKind, string> = {
  image: 'PNG, JPEG или WebP',
  animation: 'анимированный WebP',
  audio: 'MP3 (играет везде) или OGG',
};

const GROUP_TITLE = new Map<string, string>(ASSET_GROUPS.map((group) => [group.id, group.title]));

const kb = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1024))} КБ`;
const nameOf = (slot: AppearanceSlotDto): string => slot.key.slice(slot.key.lastIndexOf('/') + 1);

/** «700 × 700 · 79 КБ», «Анимация 10,1 с · 6 МБ», «Звук · 112 КБ». */
function builtinFacts(slot: AppearanceSlotDto): string {
  const { width, height, bytes, durationMs } = slot.builtin;
  const size = width && height ? `${width} × ${height}` : KIND_LABEL[slot.kind];
  const length = durationMs === null ? null : `${(durationMs / 1000).toLocaleString('ru-RU')} с`;
  return [size, length, kb(bytes)].filter(Boolean).join(' · ');
}

function fits(slot: AppearanceSlotDto, upload: UploadDto): boolean {
  if (slot.kind === 'audio') return upload.kind === 'audio';
  return upload.kind === 'image' && upload.animated === (slot.kind === 'animation');
}

function play(url: string): void {
  void new Audio(url).play().catch(() => undefined);
}

/** A sound has no picture: a button that plays it. */
function ListenButton({ url }: { url: string }) {
  return (
    <Button variant="ghost" icon={<Volume2 aria-hidden="true" />} onClick={() => play(url)}>
      Прослушать
    </Button>
  );
}

function SlotCard({ slot, onOpen }: { slot: AppearanceSlotDto; onOpen: () => void }) {
  const name = nameOf(slot);
  return (
    <ItemCard
      title={name}
      subtitle={builtinFacts(slot)}
      media={slot.kind === 'audio' ? <Volume2 aria-hidden="true" /> : { src: slot.url, alt: '' }}
      badge={slot.replacement ? <Badge tone="success">Своя</Badge> : undefined}
      onClick={onOpen}
      actionLabel={`Заменить: ${name}`}
    />
  );
}

function SlotDialog({ slot, onClose }: { slot: AppearanceSlotDto; onClose: () => void }) {
  const toast = useToast();
  const uploads = useUploads();
  const withFile = useReplaceWithFile();
  const withUpload = useReplaceWithUpload();
  const restore = useRestoreBuiltin();
  const fitting = (uploads.data ?? []).filter(
    (upload) => fits(slot, upload) && upload.id !== slot.replacement?.uploadId,
  );
  const failure = [withFile, withUpload, restore].find((mutation) => mutation.isError)?.error;
  const busy = withFile.isPending || withUpload.isPending || restore.isPending;
  const done = (text: string) => () => toast.show(text, { tone: 'success' });
  const replacement = slot.replacement;
  return (
    <Modal
      open
      onClose={onClose}
      title={nameOf(slot)}
      description={`${GROUP_TITLE.get(slot.group) ?? ''} · ${slot.key}`}
      footer={
        <>
          {replacement && (
            <Button
              variant="danger"
              icon={<RotateCcw aria-hidden="true" />}
              loading={restore.isPending}
              disabled={busy}
              onClick={() =>
                restore.mutate(slot.key, { onSuccess: done('Встроенный файл возвращён') })
              }
            >
              Вернуть встроенный
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Готово
          </Button>
        </>
      }
    >
      <Stack gap="md">
        {failure !== undefined && <Notice tone="danger">{errorText(failure)}</Notice>}
        <Grid min="sm">
          <ItemCard
            title={replacement ? 'Сейчас: своя' : 'Сейчас: встроенный'}
            subtitle={
              replacement
                ? `Загрузка № ${replacement.uploadId} · ${kb(replacement.sizeBytes)} · ${formatDateTime(replacement.updatedAt)}`
                : builtinFacts(slot)
            }
            media={
              slot.kind === 'audio' ? <ListenButton url={slot.url} /> : { src: slot.url, alt: '' }
            }
          />
        </Grid>
        <Text tone="muted">
          Встроенный: {builtinFacts(slot)}. Своя: {FORMAT_HINT[slot.kind]}, лучше такого же размера;
          можно до двух встроенных. Иконку вкладки браузер может обновить не сразу.
        </Text>
        <Field label="Загрузить свой файл">
          <FileInput
            accept={ACCEPT[slot.kind]}
            buttonLabel={withFile.isPending ? 'Загружаем…' : 'Выбрать файл'}
            disabled={busy}
            onChange={(files) => {
              const file = files[0];
              if (file) {
                withFile.mutate({ slot: slot.key, file }, { onSuccess: done('Файл заменён') });
              }
            }}
          />
        </Field>
        <Field
          label="Или выберите загруженный раньше"
          hint="Например, один логотип для всех размеров иконки."
        >
          <Select
            options={fitting.map((upload) => ({
              value: String(upload.id),
              label: `№ ${upload.id} · ${kb(upload.sizeBytes)} · ${formatDateTime(upload.createdAt)}`,
            }))}
            placeholder={fitting.length === 0 ? 'Подходящих загрузок нет' : 'Выберите загрузку'}
            value=""
            disabled={busy || fitting.length === 0}
            onChange={(event) => {
              const uploadId = Number(event.currentTarget.value);
              if (uploadId > 0) {
                withUpload.mutate(
                  { slot: slot.key, uploadId },
                  { onSuccess: done('Файл заменён') },
                );
              }
            }}
          />
        </Field>
      </Stack>
    </Modal>
  );
}

type Filter = 'all' | 'replaced';

export function Appearance() {
  const slots = useAdminAppearance();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const all = useMemo(() => slots.data ?? [], [slots.data]);
  const open = all.find((slot) => slot.key === openKey) ?? null;
  const needle = query.trim().toLocaleLowerCase('ru-RU');
  const searching = needle !== '' || filter === 'replaced';
  const shown = all.filter(
    (slot) =>
      (filter === 'all' || slot.replacement !== null) &&
      (needle === '' ||
        slot.key.toLocaleLowerCase('ru-RU').includes(needle) ||
        (GROUP_TITLE.get(slot.group) ?? '').toLocaleLowerCase('ru-RU').includes(needle)),
  );
  const replacedCount = all.filter((slot) => slot.replacement).length;
  const cards = (list: readonly AppearanceSlotDto[]) => (
    <Grid min="xs">
      {list.map((slot) => (
        <SlotCard key={slot.key} slot={slot} onOpen={() => setOpenKey(slot.key)} />
      ))}
    </Grid>
  );
  const groups = ASSET_GROUPS.map((group) => ({
    group,
    list: all.filter((slot) => slot.group === group.id),
  })).filter(({ list }) => list.length > 0);

  return (
    <AdminPage
      title="Оформление"
      description="Любую встроенную картинку, анимацию или звук можно заменить своим файлом — без правки кода. Замена видна всем при следующем открытии страницы; вернуть встроенный — одной кнопкой."
    >
      <Stack gap="lg">
        <Stack gap="md">
          <Field label="Поиск по имени файла или группе" labelHidden>
            <TextInput
              icon={<Search />}
              placeholder="Поиск: logo, room, night-hotel…"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </Field>
          <SegmentedControl
            label="Какие файлы показать"
            options={[
              { value: 'all', label: `Все (${all.length})` },
              { value: 'replaced', label: `Заменённые (${replacedCount})` },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </Stack>
        {slots.isPending && <Spinner label="Загружаем список файлов" />}
        {slots.isError && <Notice tone="danger">{errorText(slots.error)}</Notice>}
        {slots.isSuccess &&
          (searching ? (
            shown.length > 0 ? (
              cards(shown)
            ) : (
              <EmptyState
                title={
                  filter === 'replaced' && needle === ''
                    ? 'Пока ничего не заменено'
                    : 'Ничего не нашлось'
                }
              />
            )
          ) : (
            <Accordion
              multiple
              items={groups.map(({ group, list }) => {
                const replaced = list.filter((slot) => slot.replacement).length;
                return {
                  id: group.id,
                  title: `${group.title} · ${list.length}${replaced > 0 ? ` · заменено ${replaced}` : ''}`,
                  content: cards(list),
                };
              })}
            />
          ))}
      </Stack>
      {open && <SlotDialog slot={open} onClose={() => setOpenKey(null)} />}
    </AdminPage>
  );
}
