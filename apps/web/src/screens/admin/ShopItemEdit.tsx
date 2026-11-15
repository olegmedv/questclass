// /admin/shop/new and /admin/shop/:id — one shop item: kind, name, price, «Показывать в
// магазине», the picture (built-in art or an upload), the animation (built-in or an upload) and,
// for a ticket, what it gives (a wish or Robux). Every change raises the item's version: a
// purchase made from an older version is refused. Below the form: the item's other built-in files
// (a scene's layers and sounds, the first frame of the animation), replaced in place.
import {
  ROOM_CATEGORIES,
  type CatalogItemDto,
  type CatalogLibraryDto,
  type ItemKind,
  type RewardType,
  type RoomCategory,
  type Sprite,
} from '@questclass/shared/catalog/dto';
import {
  ArrowLeft,
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Grid,
  Inline,
  Notice,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  useToast,
} from '@questclass/ui';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { errorText } from '../../features/admin/forms';
import { ItemArt, StillArt } from '../../features/admin-shop/ItemArt';
import { ItemFiles } from '../../features/admin-shop/ItemFiles';
import {
  useCatalogItem,
  useCatalogItems,
  useCreateItem,
  useLibrary,
  useUpdateItem,
} from '../../features/admin-shop/queries';
import { UploadField } from '../../features/admin-shop/UploadField';
import { AdminPage } from '../../templates/AdminShell';
import { KIND_LABEL } from './ShopItems';

const ROOM_CATEGORY_LABEL: Readonly<Record<RoomCategory, string>> = {
  day: 'Дневные',
  night: 'Ночные',
  special: 'Специальные',
};

/** Everything an admin may set (`EDITABLE_ITEM_FIELDS`). */
interface Draft {
  kind: ItemKind;
  title: string;
  description: string;
  price: number | null;
  active: boolean;
  characterKey: string | null;
  roomKey: string | null;
  animationKey: string | null;
  imageKey: string | null;
  sprite: Sprite | null;
  imageUploadId: number | null;
  animationUploadId: number | null;
  roomCategory: RoomCategory | null;
  rewardType: RewardType | null;
  rewardAmount: number | null;
}

const ASSET_PREFIX = '/assets/';

export function draftOf(item: CatalogItemDto): Draft {
  const ticketKey =
    item.ticket && item.ticket.uploadId === null && item.ticket.image.startsWith(ASSET_PREFIX)
      ? item.ticket.image.slice(ASSET_PREFIX.length)
      : null;
  return {
    kind: item.kind,
    title: item.title,
    description: item.description,
    price: item.price,
    active: item.active,
    characterKey: item.hero?.characterKey ?? null,
    roomKey: item.room?.roomKey ?? null,
    animationKey: item.animation?.key ?? null,
    imageKey: ticketKey,
    sprite: ticketKey ? (item.ticket?.sprite ?? null) : null,
    imageUploadId: item.hero?.uploadId ?? item.room?.uploadId ?? item.ticket?.uploadId ?? null,
    animationUploadId: item.animation?.uploadId ?? null,
    roomCategory: item.roomCategory,
    rewardType: item.rewardType,
    rewardAmount: item.rewardAmount,
  };
}

const emptyDraft: Draft = {
  kind: 'outfit',
  title: '',
  description: '',
  price: 100,
  active: false,
  characterKey: null,
  roomKey: null,
  animationKey: null,
  imageKey: null,
  sprite: null,
  imageUploadId: null,
  animationUploadId: null,
  roomCategory: null,
  rewardType: null,
  rewardAmount: null,
};

/** The fields of the kind: a picture of another kind is dropped before saving. */
function bodyOf(draft: Draft) {
  return {
    kind: draft.kind,
    title: draft.title,
    description: draft.description,
    price: draft.price ?? 0,
    active: draft.active,
    characterKey: draft.kind === 'outfit' ? draft.characterKey : null,
    roomKey: draft.kind === 'room' ? draft.roomKey : null,
    animationKey: draft.kind === 'ticket' ? null : draft.animationKey,
    imageKey: draft.kind === 'ticket' ? draft.imageKey : null,
    sprite: draft.kind === 'ticket' && draft.imageKey ? draft.sprite : null,
    imageUploadId: draft.imageUploadId,
    animationUploadId: draft.kind === 'ticket' ? null : draft.animationUploadId,
    roomCategory: draft.kind === 'room' ? draft.roomCategory : null,
    rewardType: draft.kind === 'ticket' ? draft.rewardType : null,
    rewardAmount:
      draft.kind === 'ticket' && draft.rewardType === 'robux' ? draft.rewardAmount : null,
  };
}

/** Built-in ticket pictures: the ones the catalog's tickets already use (a sprite cell each). */
function useTicketArts(enabled: boolean) {
  const tickets = useCatalogItems(enabled ? 'ticket' : null);
  return useMemo(() => {
    const arts = new Map<string, { key: string; sprite: Sprite | null; titles: string[] }>();
    for (const item of tickets.data ?? []) {
      const ticket = item.ticket;
      if (!ticket || ticket.uploadId !== null || !ticket.image.startsWith(ASSET_PREFIX)) continue;
      const key = ticket.image.slice(ASSET_PREFIX.length);
      const id = `${key}|${JSON.stringify(ticket.sprite)}`;
      const art = arts.get(id) ?? { key, sprite: ticket.sprite, titles: [] };
      art.titles.push(item.title);
      arts.set(id, art);
    }
    return [...arts.entries()].map(([id, art]) => ({ id, ...art }));
  }, [tickets.data]);
}

type Source = 'builtin' | 'upload';

function PictureFields({
  draft,
  set,
  library,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  library: CatalogLibraryDto;
}) {
  const [source, setSource] = useState<Source>(draft.imageUploadId === null ? 'builtin' : 'upload');
  const ticketArts = useTicketArts(draft.kind === 'ticket');
  const switchSource = (next: Source) => {
    setSource(next);
    set(
      next === 'upload'
        ? { characterKey: null, roomKey: null, imageKey: null, sprite: null }
        : { imageUploadId: null },
    );
  };
  const character = library.characters.find((item) => item.key === draft.characterKey);
  const room = library.rooms.find((item) => item.key === draft.roomKey);
  const ticketId = draft.imageKey ? `${draft.imageKey}|${JSON.stringify(draft.sprite)}` : '';
  const ticketArt = ticketArts.find((art) => art.id === ticketId);

  let builtin;
  if (draft.kind === 'outfit') {
    builtin = (
      <Field label="Герой">
        <Select
          placeholder="Выберите героя"
          options={library.characters.map((item) => ({ value: item.key, label: item.name }))}
          value={draft.characterKey ?? ''}
          onChange={(event) => set({ characterKey: event.currentTarget.value || null })}
        />
      </Field>
    );
  } else if (draft.kind === 'room') {
    builtin = (
      <Field label="Комната">
        <Select
          placeholder="Выберите комнату"
          options={library.rooms.map((item) => ({
            value: item.key,
            label: `${item.title} · ${ROOM_CATEGORY_LABEL[item.category]}`,
          }))}
          value={draft.roomKey ?? ''}
          onChange={(event) => set({ roomKey: event.currentTarget.value || null })}
        />
      </Field>
    );
  } else {
    builtin = (
      <Field label="Картинка билета">
        <Select
          placeholder="Выберите картинку"
          options={ticketArts.map((art) => ({
            value: art.id,
            label: `Как у «${art.titles.join('», «')}»`,
          }))}
          value={ticketId}
          onChange={(event) => {
            const art = ticketArts.find((item) => item.id === event.currentTarget.value);
            set({ imageKey: art?.key ?? null, sprite: art?.sprite ?? null });
          }}
        />
      </Field>
    );
  }

  const preview =
    source === 'builtin' ? (
      draft.kind === 'outfit' && character ? (
        <StillArt image={character.image} sprite={character.sprite} alt={character.name} />
      ) : draft.kind === 'room' && room ? (
        <StillArt image={room.thumb} alt={room.title} pixelated={false} />
      ) : draft.kind === 'ticket' && ticketArt ? (
        <StillArt
          image={`${ASSET_PREFIX}${ticketArt.key}`}
          sprite={ticketArt.sprite}
          alt="Картинка билета"
          pixelated={false}
        />
      ) : null
    ) : null;

  return (
    <Card title="Картинка">
      <Stack gap="md">
        <SegmentedControl
          label="Откуда картинка"
          options={[
            { value: 'builtin', label: 'Встроенная' },
            { value: 'upload', label: 'Своя загрузка' },
          ]}
          value={source}
          onChange={switchSource}
        />
        {source === 'builtin' ? (
          <>
            {builtin}
            {preview && <Grid min="xs">{preview}</Grid>}
          </>
        ) : (
          <UploadField
            label="Загруженная картинка"
            animated={false}
            value={draft.imageUploadId}
            onChange={(id) => set({ imageUploadId: id })}
          />
        )}
        {draft.kind === 'room' && (
          <Field
            label="Раздел комнат"
            hint={
              source === 'builtin'
                ? 'Пусто — как у выбранной комнаты.'
                : 'Обязательно для своей картинки.'
            }
          >
            <Select
              options={[
                { value: '', label: source === 'builtin' ? 'Как у комнаты' : 'Выберите раздел' },
                ...ROOM_CATEGORIES.map((category) => ({
                  value: category,
                  label: ROOM_CATEGORY_LABEL[category],
                })),
              ]}
              value={draft.roomCategory ?? ''}
              onChange={(event) =>
                set({ roomCategory: (event.currentTarget.value || null) as RoomCategory | null })
              }
            />
          </Field>
        )}
      </Stack>
    </Card>
  );
}

function AnimationFields({
  draft,
  set,
  library,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  library: CatalogLibraryDto;
}) {
  const kind = draft.kind === 'room' ? 'room' : 'hero';
  const own = draft.animationUploadId !== null;
  const [upload, setUpload] = useState(own);
  const value = upload ? 'upload' : draft.animationKey ? `key:${draft.animationKey}` : '';
  return (
    <Card
      title="Анимация"
      description={
        kind === 'hero'
          ? 'Живой герой двигается в примерочной и на главной.'
          : 'Анимация комнаты — горизонтальный WebP 3:2.'
      }
    >
      <Stack gap="md">
        <Field label="Как двигается">
          <Select
            options={[
              { value: '', label: 'Без анимации' },
              ...library.animations
                .filter((animation) => animation.kind === kind)
                .map((animation) => ({ value: `key:${animation.key}`, label: animation.name })),
              { value: 'upload', label: 'Своя анимация (загрузка)' },
            ]}
            value={value}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setUpload(next === 'upload');
              set({
                animationKey: next.startsWith('key:') ? next.slice(4) : null,
                animationUploadId: null,
              });
            }}
          />
        </Field>
        {upload && (
          <UploadField
            label="Загруженная анимация"
            animated
            value={draft.animationUploadId}
            onChange={(id) => set({ animationUploadId: id })}
          />
        )}
      </Stack>
    </Card>
  );
}

function ItemForm({ item }: { item: CatalogItemDto | null }) {
  const library = useLibrary();
  const create = useCreateItem();
  const update = useUpdateItem(item?.id ?? 0);
  const navigate = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => (item ? draftOf(item) : emptyDraft));
  const [titleError, setTitleError] = useState('');
  const mutation = item ? update : create;
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.title.trim() === '') {
      setTitleError('Название не может быть пустым');
      return;
    }
    setTitleError('');
    const body = bodyOf(draft);
    if (!item) {
      create.mutate(body, {
        onSuccess: (created) => {
          toast.show('Товар создан', { tone: 'success' });
          void navigate(`/admin/shop/${created.id}`, { replace: true });
        },
      });
      return;
    }
    const before = bodyOf(draftOf(item));
    const patch = Object.fromEntries(
      Object.entries(body).filter(
        ([key, value]) =>
          JSON.stringify(value) !== JSON.stringify(before[key as keyof typeof before]),
      ),
    );
    if (Object.keys(patch).length === 0) return;
    update.mutate(patch, {
      onSuccess: (saved) => {
        setDraft(draftOf(saved));
        toast.show(`Сохранено, версия ${saved.version}`, { tone: 'success' });
      },
    });
  };

  return (
    <form noValidate onSubmit={submit} aria-label="Товар">
      <Stack gap="lg">
        <Card title="Основное">
          <Stack gap="md">
            {item ? (
              <Text tone="muted">
                Тип: {KIND_LABEL[item.kind]}. Версия {item.version} — покупка по старой версии не
                пройдёт, ученик увидит новую цену.
              </Text>
            ) : (
              <SegmentedControl
                label="Тип товара"
                options={(Object.keys(KIND_LABEL) as ItemKind[]).map((kind) => ({
                  value: kind,
                  label: KIND_LABEL[kind],
                }))}
                value={draft.kind}
                onChange={(kind) =>
                  set({
                    kind,
                    ...(kind === 'ticket' && !draft.rewardType && { rewardType: 'wish' }),
                  })
                }
              />
            )}
            <Field label="Название" required error={titleError}>
              <TextInput
                value={draft.title}
                maxLength={100}
                onChange={(event) => set({ title: event.currentTarget.value })}
              />
            </Field>
            <Field label="Описание">
              <Textarea
                rows={2}
                maxLength={800}
                value={draft.description}
                onChange={(event) => set({ description: event.currentTarget.value })}
              />
            </Field>
            <Field label="Цена, монет" hint="От 0 до 100 000.">
              <NumberInput
                value={draft.price}
                min={0}
                max={100_000}
                step={10}
                onChange={(price) => set({ price })}
              />
            </Field>
            <Switch
              label="Показывать в магазине ребёнка"
              description="Выключенный товар не продаётся; купленное остаётся у учеников."
              checked={draft.active}
              onChange={(active) => set({ active })}
            />
          </Stack>
        </Card>
        {library.isPending ? (
          <Card loading />
        ) : library.isError ? (
          <Notice tone="danger">{errorText(library.error)}</Notice>
        ) : (
          <>
            <PictureFields
              key={`${draft.kind}-picture`}
              draft={draft}
              set={set}
              library={library.data}
            />
            {draft.kind !== 'ticket' && (
              <AnimationFields
                key={`${draft.kind}-animation`}
                draft={draft}
                set={set}
                library={library.data}
              />
            )}
          </>
        )}
        {draft.kind === 'ticket' && (
          <Card title="Что даёт билет">
            <Stack gap="md">
              <SegmentedControl
                label="Награда"
                options={[
                  { value: 'wish', label: 'Желание' },
                  { value: 'robux', label: 'Robux' },
                ]}
                value={draft.rewardType ?? 'wish'}
                onChange={(rewardType) => set({ rewardType })}
              />
              {draft.rewardType === 'robux' ? (
                <Field label="Robux за одну покупку" hint="Отдельно от цены в монетах.">
                  <NumberInput
                    value={draft.rewardAmount}
                    min={1}
                    max={100_000}
                    step={50}
                    onChange={(rewardAmount) => set({ rewardAmount })}
                  />
                </Field>
              ) : (
                <Text tone="muted">
                  Одно желание: ученик просит «Хочу использовать», вы подтверждаете выполнение.
                </Text>
              )}
            </Stack>
          </Card>
        )}
        {mutation.isError && <Notice tone="danger">{errorText(mutation.error)}</Notice>}
        <Inline>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {item ? 'Сохранить' : 'Создать товар'}
          </Button>
        </Inline>
      </Stack>
    </form>
  );
}

export function ShopItemEdit() {
  const params = useParams();
  const id = params.id && params.id !== 'new' ? Number(params.id) : null;
  const item = useCatalogItem(id);
  const back = (
    <ButtonLink href="/admin/shop" variant="ghost" icon={<ArrowLeft aria-hidden="true" />}>
      Весь магазин
    </ButtonLink>
  );
  if (id === null) {
    return (
      <AdminPage title="Новый товар" actions={back}>
        <ItemForm item={null} />
      </AdminPage>
    );
  }
  if (item.isPending || item.isError) {
    return (
      <AdminPage title="Товар" actions={back}>
        {item.isPending ? (
          <Card loading />
        ) : (
          <EmptyState
            tone="error"
            title="Не получилось загрузить"
            description={errorText(item.error)}
          />
        )}
      </AdminPage>
    );
  }
  const data = item.data;
  return (
    <AdminPage
      title={data.title}
      description={
        <>
          {KIND_LABEL[data.kind]} · версия {data.version}
          {data.seedKey ? ' · из стартового каталога' : ''}{' '}
          {data.animated && <Badge tone="live">Живой</Badge>}
        </>
      }
      actions={back}
    >
      <Grid min="xs">
        <ItemArt item={data} />
      </Grid>
      <ItemForm key={data.id} item={data} />
      <ItemFiles item={data} />
    </AdminPage>
  );
}
