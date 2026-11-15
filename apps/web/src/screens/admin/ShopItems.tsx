// /admin/shop — the shared catalog of the shop: looks of the hero, rooms and tickets (wishes,
// Robux). Every item opens in its editor; an item is switched off, never deleted.
import type { CatalogItemDto, ItemKind } from '@questclass/shared/catalog/dto';
import {
  Badge,
  ButtonLink,
  EmptyState,
  Grid,
  Inline,
  ItemCard,
  Plus,
  Skeleton,
  Switch,
  Tabs,
} from '@questclass/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { errorText } from '../../features/admin/forms';
import { ItemArt } from '../../features/admin-shop/ItemArt';
import { useCatalogItems } from '../../features/admin-shop/queries';
import { AdminPage } from '../../templates/AdminShell';

export const KIND_LABEL: Readonly<Record<ItemKind, string>> = {
  outfit: 'Образ',
  room: 'Комната',
  ticket: 'Билет',
};

export function priceText(item: CatalogItemDto): string {
  const price = item.price === 0 ? 'бесплатно' : `${item.price} монет`;
  return item.rewardType === 'robux' && item.rewardAmount
    ? `${price} · ${item.rewardAmount} Robux`
    : price;
}

export function ShopItems() {
  const [kind, setKind] = useState<ItemKind | 'all'>('all');
  const [onSale, setOnSale] = useState(false);
  const items = useCatalogItems(kind === 'all' ? null : kind);
  const navigate = useNavigate();
  const rows = (items.data ?? []).filter((item) => !onSale || item.active);
  return (
    <AdminPage
      title="Магазин"
      description="Общий для всех учеников каталог. Товар не удаляется — его выключают."
      actions={
        <ButtonLink href="/admin/shop/new" variant="primary" icon={<Plus aria-hidden="true" />}>
          Новый товар
        </ButtonLink>
      }
    >
      <Tabs
        label="Тип товара"
        variant="underline"
        items={[
          { id: 'all', label: 'Все' },
          { id: 'outfit', label: 'Образы' },
          { id: 'room', label: 'Комнаты' },
          { id: 'ticket', label: 'Билеты' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <Inline>
        <Switch label="Только то, что в магазине" checked={onSale} onChange={setOnSale} />
      </Inline>
      {items.isError ? (
        <EmptyState
          tone="error"
          title="Не получилось загрузить"
          description={errorText(items.error)}
        />
      ) : items.isPending ? (
        <Grid min="xs">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} ratio="3 / 4" />
          ))}
        </Grid>
      ) : rows.length === 0 ? (
        <EmptyState title="Товаров нет" />
      ) : (
        <Grid as="ul" min="xs" aria-label="Товары">
          {rows.map((item) => (
            <li key={item.id}>
              <ItemCard
                title={item.title}
                subtitle={`${KIND_LABEL[item.kind]} · ${priceText(item)}`}
                media={<ItemArt item={item} />}
                badge={item.animated ? <Badge tone="live">Живой</Badge> : undefined}
                footer={
                  <Inline gap="xs">
                    {item.active ? <Badge tone="success">В магазине</Badge> : <Badge>Скрыт</Badge>}
                    {item.starter && <Badge tone="info">Стартовый</Badge>}
                  </Inline>
                }
                actionLabel={`Изменить: ${item.title}`}
                onClick={() => void navigate(`/admin/shop/${item.id}`)}
              />
            </li>
          ))}
        </Grid>
      )}
    </AdminPage>
  );
}
