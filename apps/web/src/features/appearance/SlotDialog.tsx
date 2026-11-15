// One replaceable built-in file (FEAT-059/062): where it shows (with links to the pages that edit
// its owners), what it is now, an own file or an earlier upload in its place, the built-in back.
import type { AppearanceSlotDto } from '@questclass/shared/assets/appearance';
import {
  ActionList,
  Button,
  Field,
  FileInput,
  Grid,
  ItemCard,
  Modal,
  Notice,
  RotateCcw,
  Select,
  Stack,
  Text,
  Volume2,
  useToast,
} from '@questclass/ui';
import { useLocation } from 'react-router';
import { errorText, formatDateTime } from '../admin/forms';
import { useUploads } from '../admin-shop/queries';
import { useReplaceWithFile, useReplaceWithUpload, useRestoreBuiltin } from './queries';
import { ACCEPT, FORMAT_HINT, builtinFacts, fits, kb, slotTitle, labelOfUse } from './slotText';

function play(url: string): void {
  void new Audio(url).play().catch(() => undefined);
}

/** A sound has no picture: a button that plays it. */
export function ListenButton({ url }: { url: string }) {
  return (
    <Button variant="ghost" icon={<Volume2 aria-hidden="true" />} onClick={() => play(url)}>
      Прослушать
    </Button>
  );
}

/** Where the file shows: linked rows for the owners an admin page edits, plain lines otherwise. */
function Uses({ slot }: { slot: AppearanceSlotDto }) {
  const { pathname } = useLocation();
  if (slot.uses.length === 0) {
    return (
      <Text tone="muted">
        Сейчас этот файл нигде не показывается: замена ничего не изменит, пока его снова не выберут.
      </Text>
    );
  }
  // A link to the page the dialog is open on leads nowhere: such a use is a plain line.
  const linked = slot.uses.filter((use) => use.href !== null && use.href !== pathname);
  const plain = slot.uses.filter((use) => !linked.includes(use));
  return (
    <Stack gap="sm">
      <Text weight="semibold">Где видно</Text>
      {plain.map((use) => (
        <Text key={`${use.part}|${use.place}`}>
          {labelOfUse(use)}: {use.place}
        </Text>
      ))}
      {linked.length > 0 && (
        <ActionList
          label="Где видно"
          items={linked.map((use, index) => ({
            id: `${index}`,
            title: labelOfUse(use),
            description: use.place,
            href: use.href ?? undefined,
          }))}
        />
      )}
    </Stack>
  );
}

export function SlotDialog({ slot, onClose }: { slot: AppearanceSlotDto; onClose: () => void }) {
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
  const first = slot.uses[0];
  const shared = slot.uses.length > 1;
  return (
    <Modal
      open
      onClose={onClose}
      title={first ? labelOfUse(first) : slotTitle(slot).title}
      description={`Файл ${slot.key}`}
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
        <Uses slot={slot} />
        {shared && (
          <Notice tone="info">
            Файл общий: замена видна везде из списка выше. Чтобы поменять только в одном месте,
            откройте его по ссылке и загрузите свою картинку там.
          </Notice>
        )}
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
          можно до двух встроенных. Замена видна при следующем открытии страницы.
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
        <Field label="Или выберите загруженный раньше">
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
