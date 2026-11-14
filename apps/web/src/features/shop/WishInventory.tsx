// «Мои желания»: bought tickets grouped by reward (all Robux together), «Хочу использовать» and
// the history of what the parent handed out (spec/02 §2.6). Used by the wishes page and the
// «Билетики» tab of «Мои награды».
import type { WishGroupDto } from '@questclass/shared/wishes/dto';
import {
  Accordion,
  ActionList,
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Heading,
  Inline,
  Notice,
  Placeholder,
  Send,
  ShoppingBag,
  Skeleton,
  SpriteImage,
  Stack,
  Text,
  Ticket,
  WishCard,
} from '@questclass/ui';
import { assetUrl } from '../tasks/assets';
import { remainingText } from './model';
import { useMyWishes, useWishRequest } from './queries';

const ROBUX_ICON = assetUrl('game/report-robux.svg');

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

function GroupPicture({ group }: { readonly group: WishGroupDto }) {
  if (group.ticket?.image) {
    return <SpriteImage src={group.ticket.image} sprite={group.ticket.sprite} alt="" />;
  }
  if (group.rewardType === 'robux') return <SpriteImage src={ROBUX_ICON} alt="" />;
  return <Placeholder kind="upload" label="Картинка товара" size="sm" />;
}

function GroupCard({ group }: { readonly group: WishGroupDto }) {
  const request = useWishRequest();
  const ready = group.status === 'ready';
  return (
    <WishCard
      title={group.title}
      amount={remainingText(group)}
      description={group.description || undefined}
      picture={<GroupPicture group={group} />}
      status={
        ready ? (
          <Badge tone="success">Куплено · можно использовать</Badge>
        ) : (
          <Badge tone="info">Просьба отправлена</Badge>
        )
      }
      action={
        ready ? (
          <Stack gap="sm">
            <Button
              icon={<Send aria-hidden="true" />}
              loading={request.isPending && request.variables === group.groupKey}
              onClick={() => request.mutate(group.groupKey)}
            >
              Хочу использовать
            </Button>
            {request.isError && <Notice tone="danger">{request.error.message}</Notice>}
          </Stack>
        ) : (
          <Text size="sm" tone="muted">
            Родитель получил твою просьбу.
          </Text>
        )
      }
    />
  );
}

export function WishInventory({ headingLevel = 2 }: { readonly headingLevel?: 2 | 3 }) {
  const wishes = useMyWishes();
  if (wishes.isPending) {
    return (
      <Stack gap="md" aria-busy="true" aria-label="Загрузка">
        <Skeleton lines={3} />
        <Skeleton lines={3} />
      </Stack>
    );
  }
  if (wishes.isError) {
    return (
      <EmptyState
        tone="error"
        title="Не получилось загрузить"
        description={wishes.error.message}
        actions={<Button onClick={() => void wishes.refetch()}>Повторить</Button>}
      />
    );
  }
  const groups = wishes.data.pages[0]?.groups ?? [];
  const receipts = wishes.data.pages.flatMap((page) => page.history.items);
  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Inline gap="sm" nowrap>
          <Ticket aria-hidden="true" />
          <Heading level={headingLevel} size="md">
            Купленные желания
          </Heading>
        </Inline>
        {groups.length > 0 && (
          <Text tone="muted">Нажми «Хочу использовать», чтобы сообщить родителю.</Text>
        )}
      </Stack>
      {groups.length === 0 ? (
        <EmptyState
          title="Пока нет неиспользованных наград"
          description="Новые билетики можно купить в магазине."
          actions={
            <ButtonLink href="/shop" icon={<ShoppingBag aria-hidden="true" />}>
              В магазин
            </ButtonLink>
          }
        />
      ) : (
        <Stack as="ul" gap="md" aria-label="Купленные желания">
          {groups.map((group) => (
            <li key={group.groupKey}>
              <GroupCard group={group} />
            </li>
          ))}
        </Stack>
      )}
      <Accordion
        items={[
          {
            id: 'history',
            title: 'Получено',
            content: (
              <Stack gap="md">
                <ActionList
                  label="Получено"
                  items={receipts.map((receipt) => ({
                    id: String(receipt.id),
                    title:
                      receipt.rewardType === 'robux'
                        ? `${receipt.amount.toLocaleString('ru-RU')} Robux`
                        : `${receipt.title} · ${receipt.amount}`,
                    description: `Выданы родителем · ${date(receipt.at)}`,
                    status: 'done',
                  }))}
                  empty="Родитель пока ничего не выдал."
                />
                {wishes.hasNextPage && (
                  <Button
                    loading={wishes.isFetchingNextPage}
                    onClick={() => void wishes.fetchNextPage()}
                  >
                    Показать ещё
                  </Button>
                )}
              </Stack>
            ),
          },
        ]}
      />
    </Stack>
  );
}
