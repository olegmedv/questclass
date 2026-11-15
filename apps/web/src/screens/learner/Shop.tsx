// «Магазин желаний» (spec/02 §2.5): filters «Всё / Герои / Комнаты / Желания» with sub-filters,
// cards with live heroes by the play button, «Ещё N монет», the confirmation and toasts. After a
// ticket «Мои желания» open.
import type { ShopItemDto } from '@questclass/shared/shop/dto';
import {
  Button,
  ButtonLink,
  CategoryFilter,
  Clapperboard,
  House,
  LayoutGrid,
  Moon,
  Notice,
  PartyPopper,
  Play,
  Shirt,
  ShopItemCard,
  ShopMark,
  ShopPreview,
  Sparkles,
  Stack,
  StatChip,
  Sun,
  Text,
  Ticket,
  useToast,
  Users,
  type CategoryOption,
} from '@questclass/ui';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ALL_ITEMS,
  filterItems,
  newRequestId,
  PURCHASE_TOASTS,
  ROOM_CATEGORY_LABELS,
  type HeroFilter,
  type RoomFilter,
  type ShopFilter,
  type ShopSection,
} from '../../features/shop/model';
import { PurchaseDialog, type PurchaseIntent } from '../../features/shop/PurchaseDialog';
import { useShop } from '../../features/shop/queries';
import { ShopItemMedia } from '../../features/shop/ShopItemMedia';
import { Catalog } from '../../templates/Catalog';

const SECTIONS: readonly CategoryOption<ShopSection>[] = [
  { value: 'all', label: 'Всё', icon: <LayoutGrid /> },
  { value: 'heroes', label: 'Герои', icon: <Shirt />, tone: 'blue' },
  { value: 'rooms', label: 'Комнаты', icon: <House />, tone: 'green' },
  { value: 'wishes', label: 'Желания', icon: <Ticket />, tone: 'pink' },
];

const HERO_FILTERS: readonly CategoryOption<HeroFilter>[] = [
  { value: 'all', label: 'Все персонажи', icon: <Users /> },
  { value: 'ordinary', label: 'Обычные', icon: <Shirt />, tone: 'blue' },
  { value: 'animated', label: 'Анимированные', icon: <Play />, tone: 'teal' },
];

const ROOM_ICONS = { day: <Sun />, night: <Moon />, special: <Sparkles /> } as const;

const ROOM_FILTERS: readonly CategoryOption<RoomFilter>[] = [
  { value: 'all', label: 'Все комнаты', icon: <House /> },
  { value: 'day', label: 'День', icon: ROOM_ICONS.day, tone: 'gold' },
  { value: 'night', label: 'Ночь', icon: ROOM_ICONS.night, tone: 'violet' },
  { value: 'special', label: 'Специальные', icon: ROOM_ICONS.special, tone: 'pink' },
  { value: 'animated', label: 'Анимированные', icon: <PartyPopper />, tone: 'teal' },
];

function marksOf(item: ShopItemDto): ReactNode {
  const marks: ReactNode[] = [];
  if (item.kind === 'room' && item.roomCategory) {
    marks.push(
      <ShopMark
        key="category"
        icon={ROOM_ICONS[item.roomCategory]}
        label={ROOM_CATEGORY_LABELS[item.roomCategory]}
      />,
    );
  }
  if (item.animated) {
    marks.push(
      <ShopMark
        key="animated"
        tone="teal"
        icon={<Clapperboard />}
        label={item.kind === 'room' ? 'Анимированная комната' : 'Живой герой'}
      />,
    );
  }
  return marks.length > 0 ? marks : null;
}

const shapeOf = (item: ShopItemDto) => (item.kind === 'room' ? 'wide' : 'square');

export function Shop() {
  const shop = useShop();
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ShopFilter>(ALL_ITEMS);
  const [details, setDetails] = useState<ShopItemDto | null>(null);
  const [intent, setIntent] = useState<PurchaseIntent | null>(null);
  const coins = shop.data?.coins ?? 0;
  const items = shop.data ? filterItems(shop.data.items, filter) : [];

  const filters = (
    <Stack gap="sm">
      <CategoryFilter
        label="Разделы магазина"
        options={SECTIONS}
        value={filter.section}
        onChange={(section) => setFilter({ ...filter, section })}
      />
      {filter.section === 'heroes' && (
        <CategoryFilter
          size="sm"
          label="Какие герои"
          options={HERO_FILTERS}
          value={filter.heroes}
          onChange={(heroes) => setFilter({ ...filter, heroes })}
        />
      )}
      {filter.section === 'rooms' && (
        <>
          <CategoryFilter
            size="sm"
            label="Какие комнаты"
            options={ROOM_FILTERS}
            value={filter.rooms}
            onChange={(rooms) => setFilter({ ...filter, rooms })}
          />
          <Text size="sm" tone="muted">
            Комнату можно менять отдельно от персонажа. Покупка остаётся у тебя.
          </Text>
        </>
      )}
      {coins < 0 && (
        <Notice tone="warning">
          Пока не хватает монет: баланс ниже нуля. Выполни задания, чтобы снова покупать.
        </Notice>
      )}
    </Stack>
  );

  return (
    <>
      <Catalog<ShopItemDto, string>
        title="Магазин желаний"
        description="За монеты: персонажи, комнаты, Robux и желания."
        actions={
          <>
            <StatChip
              kind="coins"
              label="монет"
              showLabel
              value={coins.toLocaleString('ru-RU')}
              loading={shop.isPending}
            />
            <ButtonLink href="/wishes" size="sm" icon={<Ticket aria-hidden="true" />}>
              Мои желания
            </ButtonLink>
          </>
        }
        filters={filters}
        items={items}
        itemKey={(item) => String(item.id)}
        loading={shop.isPending}
        error={shop.isError ? shop.error.message : undefined}
        onRetry={() => void shop.refetch()}
        empty={{
          title: 'Здесь пока нет новых покупок',
          description: 'Загляни в другую категорию.',
        }}
        renderItem={(item) => (
          <ShopItemCard
            title={item.title}
            media={<ShopItemMedia item={item} />}
            mediaShape={shapeOf(item)}
            marks={marksOf(item)}
            live={item.animated}
            price={item.price}
            missingCoins={item.missingCoins}
            onDetails={() => setDetails(item)}
            onBuy={() => setIntent({ item, requestId: newRequestId() })}
          />
        )}
        details={{
          item: details,
          title: (item) => item.title,
          render: (item) => (
            <Stack gap="md">
              <ShopPreview shape={shapeOf(item)}>
                <ShopItemMedia item={item} />
              </ShopPreview>
              {item.description && <Text>{item.description}</Text>}
              <Text weight="bold">Цена: {item.price.toLocaleString('ru-RU')} монет</Text>
            </Stack>
          ),
          footer: () => (
            <Button variant="primary" onClick={() => setDetails(null)}>
              Понятно
            </Button>
          ),
          onClose: () => setDetails(null),
        }}
      />
      <PurchaseDialog
        intent={intent}
        coins={coins}
        onClose={() => setIntent(null)}
        onBought={(_, item) => {
          setIntent(null);
          toast.show(PURCHASE_TOASTS[item.kind], { tone: 'success' });
          if (item.kind === 'ticket') void navigate('/wishes');
        }}
      />
    </>
  );
}
