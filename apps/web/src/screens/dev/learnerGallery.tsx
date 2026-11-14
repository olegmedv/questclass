// Gallery sections of the learner's game screens (shop, wishes, hero). Kept apart from
// UiGallery.tsx so the gallery file only grows by one line per group; rendered at the end of
// /dev/ui (new sections go last: inserting above shifts every section below).
import {
  Badge,
  Button,
  CategoryFilter,
  Clapperboard,
  Grid,
  House,
  LayoutGrid,
  Moon,
  Placeholder,
  Send,
  Shirt,
  ShopItemCard,
  ShopMark,
  SpriteImage,
  Stack,
  Sun,
  Text,
  Ticket,
  WishCard,
  type CategoryOption,
} from '@questclass/ui';
import { useState, type ComponentType, type ReactNode } from 'react';

type StateName = 'default' | 'disabled' | 'loading' | 'empty' | 'error';

/** The gallery's Demo (one section with the five states). */
export type GalleryDemo = ComponentType<{
  id: string;
  title: string;
  description?: string;
  states: Record<StateName, ReactNode | { readonly na: string }>;
}>;

const TICKETS = '/assets/game/wishes-transparent-v1.webp';
const SPACE = '/assets/game/fitting-room/space-original.webp';
const ROOM = '/assets/game/rooms/room-mart-islands-thumb.webp';

const SECTIONS: readonly CategoryOption<'all' | 'heroes' | 'rooms' | 'wishes'>[] = [
  { value: 'all', label: 'Всё', icon: <LayoutGrid /> },
  { value: 'heroes', label: 'Герои', icon: <Shirt />, tone: 'blue' },
  { value: 'rooms', label: 'Комнаты', icon: <House />, tone: 'green' },
  { value: 'wishes', label: 'Желания', icon: <Ticket />, tone: 'pink' },
];

const ROOM_FILTERS: readonly CategoryOption<'day' | 'night' | 'animated'>[] = [
  { value: 'day', label: 'День', icon: <Sun />, tone: 'gold' },
  { value: 'night', label: 'Ночь', icon: <Moon />, tone: 'violet' },
  { value: 'animated', label: 'Анимированные', icon: <Clapperboard />, tone: 'teal' },
];

function FilterDemo() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]['value']>('rooms');
  const [room, setRoom] = useState<(typeof ROOM_FILTERS)[number]['value']>('night');
  return (
    <Stack gap="sm">
      <CategoryFilter
        label="Разделы (демо)"
        options={SECTIONS}
        value={section}
        onChange={setSection}
      />
      <CategoryFilter
        size="sm"
        label="Комнаты (демо)"
        options={ROOM_FILTERS}
        value={room}
        onChange={setRoom}
      />
    </Stack>
  );
}

const roomMarks = (
  <>
    <ShopMark icon={<Sun />} label="Дневная комната" />
    <ShopMark tone="teal" icon={<Clapperboard />} label="Анимированная комната" />
  </>
);

export function ShopSections({ Demo }: { readonly Demo: GalleryDemo }) {
  return (
    <>
      <Demo
        id="category-filter"
        title="CategoryFilter"
        description="Разделы магазина: значок, подпись, цвет раздела и галочка выбранного; стрелки двигают выбор."
        states={{
          default: <FilterDemo />,
          disabled: (
            <CategoryFilter
              label="Разделы (недоступно)"
              options={SECTIONS}
              value="all"
              onChange={() => {}}
              disabled
            />
          ),
          loading: { na: 'варианты фильтра известны заранее' },
          empty: { na: 'фильтр без вариантов не показывается' },
          error: { na: 'фильтр не загружает данные' },
        }}
      />

      <Demo
        id="shop-item-card"
        title="ShopItemCard"
        description="Карточка магазина: превью, метки раздела и анимации, название открывает «Подробнее», цена — покупка."
        states={{
          default: (
            <Grid min="sm">
              <ShopItemCard
                title="Космонавт"
                media={<SpriteImage src={SPACE} alt="Космонавт" />}
                price={40}
                onBuy={() => {}}
                onDetails={() => {}}
              />
              <ShopItemCard
                title="Острова Марта"
                media={<SpriteImage src={ROOM} alt="Острова Марта" />}
                mediaShape="wide"
                marks={roomMarks}
                live
                price={200}
                onBuy={() => {}}
                onDetails={() => {}}
              />
            </Grid>
          ),
          disabled: (
            <Grid min="sm">
              <ShopItemCard
                title="Острова Марта"
                media={<SpriteImage src={ROOM} alt="Острова Марта" />}
                mediaShape="wide"
                marks={roomMarks}
                live
                price={200}
                missingCoins={150}
                onBuy={() => {}}
                onDetails={() => {}}
              />
            </Grid>
          ),
          loading: (
            <Grid min="sm">
              <ShopItemCard title="" price={0} loading />
            </Grid>
          ),
          empty: (
            <Grid min="sm">
              <ShopItemCard
                title="Свой образ"
                media={<Placeholder kind="upload" label="Картинка товара" />}
                price={80}
                onBuy={() => {}}
              />
            </Grid>
          ),
          error: (
            <Grid min="sm">
              <ShopItemCard
                title="Космонавт"
                media={<SpriteImage src={SPACE} alt="Космонавт" />}
                price={40}
                buying
                onBuy={() => {}}
              />
            </Grid>
          ),
        }}
      />

      <Demo
        id="wish-card"
        title="WishCard и SpriteImage"
        description="«Мои желания»: картинка билета (ячейка спрайта), остаток, статус и «Хочу использовать»."
        states={{
          default: (
            <WishCard
              title="Robux"
              amount="300 Robux"
              description="300 Robux от родителя."
              picture={
                <SpriteImage src={TICKETS} sprite={{ cols: 2, rows: 2, col: 1, row: 0 }} alt="" />
              }
              status={<Badge tone="success">Куплено · можно использовать</Badge>}
              action={<Button icon={<Send aria-hidden="true" />}>Хочу использовать</Button>}
            />
          ),
          disabled: (
            <WishCard
              title="Картошка и наггетсы"
              amount="Билетов: 2"
              picture={
                <SpriteImage src={TICKETS} sprite={{ cols: 2, rows: 2, col: 0, row: 0 }} alt="" />
              }
              status={<Badge tone="info">Просьба отправлена</Badge>}
              action={
                <Text size="sm" tone="muted">
                  Родитель получил твою просьбу.
                </Text>
              }
            />
          ),
          loading: (
            <WishCard
              title="Robux"
              amount="300 Robux"
              picture={
                <SpriteImage src={TICKETS} sprite={{ cols: 2, rows: 2, col: 1, row: 0 }} alt="" />
              }
              action={<Button loading>Хочу использовать</Button>}
            />
          ),
          empty: (
            <WishCard
              title="Своё желание"
              amount="Билетов: 1"
              picture={<Placeholder kind="upload" label="Картинка товара" size="sm" />}
            />
          ),
          error: { na: 'ошибка просьбы — Notice под кнопкой' },
        }}
      />
    </>
  );
}
