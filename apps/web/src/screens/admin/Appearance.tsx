// /admin/appearance — «Оформление» (FEAT-061/063): the look of the whole app (the logo in every
// size, the streak celebration, the reward sound), then every other built-in file by where it
// shows, named by its owner (a shop item, a subject) with a link to the page that edits it.
import type { AppearanceSlotDto } from '@questclass/shared/assets/appearance';
import { APP_ASSETS, ASSET_AREAS, type AssetArea } from '@questclass/shared/assets/uses';
import {
  Accordion,
  Button,
  Card,
  EmptyState,
  Field,
  FileInput,
  Inline,
  Notice,
  RotateCcw,
  Search,
  SegmentedControl,
  Spinner,
  Stack,
  TextInput,
  UiLink,
  useToast,
} from '@questclass/ui';
import { useMemo, useState } from 'react';
import { errorText } from '../../features/admin/forms';
import {
  useAdminAppearance,
  useReplaceAllWithFile,
  useRestoreAll,
} from '../../features/appearance/queries';
import { SlotTiles, type SlotName } from '../../features/appearance/SlotTiles';
import { ACCEPT, slotSearchText } from '../../features/appearance/slotText';
import { AdminPage } from '../../templates/AdminShell';

/** Areas with a card of their own at the top; the rest is the list of sections below. */
const APP_AREAS: readonly AssetArea[] = ['brand', 'celebration', 'sounds'];

/** In the app's cards the files go as `APP_ASSETS` lists them: the main logo, the movie first. */
const APP_ORDER: readonly string[] = Object.values(APP_ASSETS).map((asset) => asset.file);
const appOrder = (slot: AppearanceSlotDto): number => {
  const index = APP_ORDER.findIndex((file) => slot.files.includes(file));
  return index < 0 ? APP_ORDER.length : index;
};
const SECTION_AREAS = ASSET_AREAS.filter((area) => !APP_AREAS.includes(area.id));

/** In a card of the app's own files: what the file is and where it shows. */
const byPart: SlotName = (slot) => {
  const use = slot.uses[0];
  return use ? { title: use.part, subtitle: use.place } : { title: slot.key, subtitle: '' };
};

/** The logo in all its sizes: one upload for every slot, each size also on its own. */
function LogoCard({ slots }: { slots: readonly AppearanceSlotDto[] }) {
  const toast = useToast();
  const replaceAll = useReplaceAllWithFile();
  const restoreAll = useRestoreAll();
  const keys = slots.map((slot) => slot.key);
  const replaced = slots.filter((slot) => slot.replacement).map((slot) => slot.key);
  const failure = [replaceAll, restoreAll].find((mutation) => mutation.isError)?.error;
  const busy = replaceAll.isPending || restoreAll.isPending;
  return (
    <Card
      title="Логотип"
      description="Шапка кабинета и ученика, экран входа, вкладка браузера, значок на телефоне. Один файл подходит для всех размеров — лучше квадратная картинка от 192 × 192."
    >
      <Stack gap="md">
        {failure !== undefined && <Notice tone="danger">{errorText(failure)}</Notice>}
        <SlotTiles slots={slots} name={byPart} />
        <Inline>
          <FileInput
            accept={ACCEPT.image}
            buttonLabel={
              replaceAll.isPending ? 'Загружаем…' : 'Загрузить логотип для всех размеров'
            }
            disabled={busy}
            onChange={(files) => {
              const file = files[0];
              if (file) {
                replaceAll.mutate(
                  { slots: keys, file },
                  { onSuccess: () => toast.show('Логотип заменён', { tone: 'success' }) },
                );
              }
            }}
          />
          {replaced.length > 0 && (
            <Button
              variant="ghost"
              icon={<RotateCcw aria-hidden="true" />}
              loading={restoreAll.isPending}
              disabled={busy}
              onClick={() =>
                restoreAll.mutate(replaced, {
                  onSuccess: () => toast.show('Встроенный логотип возвращён', { tone: 'success' }),
                })
              }
            >
              Вернуть встроенный логотип
            </Button>
          )}
        </Inline>
      </Stack>
    </Card>
  );
}

type Filter = 'all' | 'replaced';

/** Every other built-in file, by where it shows; a search across owners, parts and places. */
function Sections({ slots }: { slots: readonly AppearanceSlotDto[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const needle = query.trim().toLocaleLowerCase('ru-RU');
  const searching = needle !== '' || filter === 'replaced';
  const shown = slots.filter(
    (slot) =>
      (filter === 'all' || slot.replacement !== null) &&
      (needle === '' || slotSearchText(slot).includes(needle)),
  );
  const replacedCount = slots.filter((slot) => slot.replacement).length;
  const groups = SECTION_AREAS.map((area) => ({
    area,
    list: slots.filter((slot) => slot.area === area.id),
  })).filter(({ list }) => list.length > 0);
  return (
    <Card
      title="Картинки товаров и предметов"
      description={
        <>
          Удобнее менять там, где их редактируют: картинку, анимацию и части сцены — в карточке
          товара <UiLink href="/admin/shop">магазина</UiLink>, значки —{' '}
          <UiLink href="/admin/subjects">в предметах</UiLink>. Здесь они все сразу: в окне файла
          видно, где он показывается, и есть ссылка на товар.
        </>
      }
    >
      <Stack gap="md">
        <Field label="Поиск по названию товара, предмета или части" labelHidden>
          <TextInput
            icon={<Search />}
            placeholder="Поиск: Ночной отель, вампир, математика…"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </Field>
        <SegmentedControl
          label="Какие файлы показать"
          options={[
            { value: 'all', label: `Все (${slots.length})` },
            { value: 'replaced', label: `Заменённые (${replacedCount})` },
          ]}
          value={filter}
          onChange={setFilter}
        />
        {searching ? (
          shown.length > 0 ? (
            <SlotTiles slots={shown} />
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
            items={groups.map(({ area, list }) => {
              const replaced = list.filter((slot) => slot.replacement).length;
              return {
                id: area.id,
                title: `${area.title} · ${list.length}${replaced > 0 ? ` · заменено ${replaced}` : ''}`,
                content: <SlotTiles slots={list} />,
              };
            })}
          />
        )}
      </Stack>
    </Card>
  );
}

export function Appearance() {
  const slots = useAdminAppearance();
  const all = useMemo(() => slots.data ?? [], [slots.data]);
  const inArea = (area: AssetArea) =>
    all.filter((slot) => slot.area === area).sort((a, b) => appOrder(a) - appOrder(b));
  return (
    <AdminPage
      title="Оформление"
      description="Логотип, праздник за серию занятий и звуки — для всего приложения. Замена своим файлом видна всем при следующем открытии страницы; встроенный возвращается одной кнопкой."
    >
      {slots.isPending && <Spinner label="Загружаем список файлов" />}
      {slots.isError && <Notice tone="danger">{errorText(slots.error)}</Notice>}
      {slots.isSuccess && (
        <Stack gap="lg">
          <LogoCard slots={inArea('brand')} />
          <Card
            title="Праздник за серию занятий"
            description={
              <>
                Мультфильм в карточке «Серия занятий» на главной ученика. Сколько дней подряд и
                какой бонус — в <UiLink href="/admin/settings">настройках</UiLink>.
              </>
            }
          >
            <SlotTiles slots={inArea('celebration')} name={byPart} />
          </Card>
          <Card title="Звуки">
            <SlotTiles slots={inArea('sounds')} name={byPart} />
          </Card>
          <Sections slots={all.filter((slot) => !APP_AREAS.includes(slot.area))} />
        </Stack>
      )}
    </AdminPage>
  );
}
