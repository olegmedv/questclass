// /admin/wishes — handing out what learners bought: Robux in any part of what is left («сейчас
// осталось / после отметки»), wishes one at a time («Подтвердить выполнение»). The amount the
// admin saw goes with the request: if something changed meanwhile, the server refuses.
import type { WishGroupDto, LearnerWishesDto } from '@questclass/shared/wishes/dto';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Grid,
  Inline,
  ItemCard,
  NumberInput,
  Stack,
  Tabs,
  Text,
  useToast,
} from '@questclass/ui';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { isApiError } from '../../api/client';
import { errorText, formatDateTime, newRequestId } from '../../features/admin/forms';
import { StillArt } from '../../features/admin-shop/ItemArt';
import { useFulfill, useWishQueue } from '../../features/admin-shop/queries';
import { AdminPage } from '../../templates/AdminShell';

function GroupCard({ learnerId, group }: { learnerId: number; group: WishGroupDto }) {
  const fulfill = useFulfill(learnerId);
  const toast = useToast();
  const robux = group.rewardType === 'robux';
  const [amount, setAmount] = useState<number | null>(robux ? group.remaining : 1);
  const [requestId, setRequestId] = useState(newRequestId);
  const give = amount ?? 0;
  const after = Math.max(0, group.remaining - give);

  const submit = () =>
    fulfill.mutate(
      { groupKey: group.groupKey, amount: give, expectedRemaining: group.remaining, requestId },
      {
        onSuccess: (receipt) => {
          setRequestId(newRequestId());
          toast.show(robux ? `Выдано ${receipt.amount} Robux` : `«${group.title}»: выполнено`, {
            tone: 'success',
          });
        },
        onError: (error) => {
          setRequestId(newRequestId());
          toast.show(
            isApiError(error) && error.code === 'remaining_changed'
              ? 'Остаток изменился — список обновлён, проверьте ещё раз'
              : errorText(error),
            { tone: 'error' },
          );
        },
      },
    );

  return (
    <ItemCard
      title={group.title}
      subtitle={group.description || undefined}
      media={
        group.ticket ? (
          <StillArt
            image={group.ticket.image}
            sprite={group.ticket.sprite}
            alt={group.title}
            pixelated={false}
          />
        ) : undefined
      }
      badge={group.status === 'requested' ? <Badge tone="warning">Просит сейчас</Badge> : undefined}
      footer={
        <Stack gap="sm">
          {group.requestedAt && (
            <Text size="sm" tone="muted">
              Просьба отправлена {formatDateTime(group.requestedAt)}
            </Text>
          )}
          {robux ? (
            <>
              <Field label={`Выдать Robux: ${group.title}`} labelHidden>
                <NumberInput
                  value={amount}
                  min={1}
                  max={group.remaining}
                  step={50}
                  onChange={setAmount}
                />
              </Field>
              <Text size="sm">
                Сейчас осталось: {group.remaining} · После отметки: {after}
              </Text>
              <Button
                variant="primary"
                size="sm"
                loading={fulfill.isPending}
                disabled={give < 1 || give > group.remaining}
                onClick={submit}
              >
                Выдать Robux
              </Button>
            </>
          ) : (
            <>
              <Text size="sm">Осталось желаний: {group.remaining}</Text>
              <Button variant="primary" size="sm" loading={fulfill.isPending} onClick={submit}>
                Подтвердить выполнение
              </Button>
            </>
          )}
        </Stack>
      }
    />
  );
}

function LearnerQueue({ entry }: { entry: LearnerWishesDto }) {
  return (
    <Card title={entry.learnerName}>
      <Grid as="ul" min="md" aria-label={`Желания: ${entry.learnerName}`}>
        {entry.groups.map((group) => (
          <li key={`${group.groupKey}-${group.remaining}`}>
            <GroupCard learnerId={entry.learnerId} group={group} />
          </li>
        ))}
      </Grid>
    </Card>
  );
}

export function WishFulfillment() {
  const [params, setParams] = useSearchParams();
  const status = params.get('show') === 'remaining' ? 'remaining' : 'open';
  const queue = useWishQueue(status);
  const open = useWishQueue('open');
  const requested = (open.data ?? []).reduce(
    (count, entry) => count + entry.groups.filter((group) => group.status === 'requested').length,
    0,
  );
  return (
    <AdminPage
      title="Выдача желаний"
      description="Ученики покупают билеты в магазине и просят «Хочу использовать». Здесь вы отмечаете, что выдали."
    >
      <Tabs
        label="Что показать"
        variant="underline"
        items={[
          { id: 'open', label: 'Просят сейчас', count: open.data ? requested : undefined },
          { id: 'remaining', label: 'Всё невыданное' },
        ]}
        value={status}
        onChange={(id) => setParams(id === 'open' ? {} : { show: id }, { replace: true })}
      />
      {queue.isError ? (
        <EmptyState
          tone="error"
          title="Не получилось загрузить"
          description={errorText(queue.error)}
        />
      ) : queue.isPending ? (
        <Card loading />
      ) : queue.data.length === 0 ? (
        <EmptyState
          title={status === 'open' ? 'Никто ничего не просит' : 'Всё выдано'}
          description={
            status === 'open'
              ? 'Когда ученик нажмёт «Хочу использовать», просьба появится здесь.'
              : undefined
          }
        />
      ) : (
        <Stack gap="lg">
          {queue.data.map((entry) => (
            <LearnerQueue key={entry.learnerId} entry={entry} />
          ))}
        </Stack>
      )}
      <Inline>
        <Text tone="muted" size="sm">
          Выданное ученик видит в «Моих желаниях» → «Выданы родителем».
        </Text>
      </Inline>
    </AdminPage>
  );
}
