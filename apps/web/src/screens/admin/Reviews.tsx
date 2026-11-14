// /admin/reviews — what waits for the parent: chores reported «Я сделал» (approve pays the
// reward, reject sends a comment) and requests for another try at a failed test.
import type { RetryRequestDto } from '@questclass/shared/attempts/dto';
import type {
  ChoreCompletionDto,
  ChoreCompletionStatus,
} from '@questclass/shared/task-types/chore/dto';
import {
  Badge,
  Button,
  DataTable,
  Field,
  Inline,
  Modal,
  Notice,
  SegmentedControl,
  Stack,
  Tabs,
  Textarea,
  UiLink,
  VisuallyHidden,
  useToast,
  type Column,
} from '@questclass/ui';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorText, formatDateTime } from '../../features/admin/forms';
import {
  useApproveChore,
  useChoreReviews,
  useGrantRetry,
  useRejectChore,
  useRetryRequests,
} from '../../features/admin-progress/queries';
import { useUsers } from '../../features/users/queries';
import { AdminPage } from '../../templates/AdminShell';

type Queue = 'chores' | 'retries';

const CHORE_STATUS: Readonly<Record<ChoreCompletionStatus, string>> = {
  pending: 'Ждут проверки',
  approved: 'Засчитаны',
  rejected: 'Не засчитаны',
};

/** `once`, a day `2026-11-14` or a week `2026-W46`, in words. */
export function periodText(periodKey: string): string {
  if (periodKey === 'once') return 'один раз';
  const week = /^(\d{4})-W(\d{2})$/.exec(periodKey);
  if (week) return `неделя ${Number(week[2])}, ${week[1]}`;
  const [y, m, d] = periodKey.split('-');
  return d ? `${d}.${m}.${y}` : periodKey;
}

function RejectDialog({
  completion,
  onClose,
}: {
  completion: ChoreCompletionDto;
  onClose: () => void;
}) {
  const reject = useRejectChore();
  const toast = useToast();
  const [comment, setComment] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title={`Не засчитать «${completion.taskTitle}»?`}
      description="Ученик увидит «Не засчитано» и ваш комментарий и сможет отметить дело ещё раз."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="danger"
            loading={reject.isPending}
            onClick={() =>
              reject.mutate(
                { id: completion.id, comment },
                {
                  onSuccess: () => {
                    toast.show('Не засчитано', { tone: 'success' });
                    onClose();
                  },
                },
              )
            }
          >
            Не засчитать
          </Button>
        </>
      }
    >
      <Stack gap="md">
        {reject.isError && <Notice tone="danger">{errorText(reject.error)}</Notice>}
        <Field label="Комментарий" hint="Например, «Игрушки ещё на полу». Необязательно.">
          <Textarea
            rows={3}
            maxLength={300}
            value={comment}
            onChange={(event) => setComment(event.currentTarget.value)}
          />
        </Field>
      </Stack>
    </Modal>
  );
}

function Chores({ names }: { names: ReadonlyMap<number, string> }) {
  const [status, setStatus] = useState<ChoreCompletionStatus>('pending');
  const reviews = useChoreReviews(status);
  const approve = useApproveChore();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<ChoreCompletionDto | null>(null);
  const columns: Column<ChoreCompletionDto>[] = [
    {
      key: 'learner',
      header: 'Ученик',
      render: (row) => names.get(row.learnerId) ?? `№ ${row.learnerId}`,
    },
    { key: 'task', header: 'Дело', render: (row) => row.taskTitle },
    { key: 'period', header: 'За', secondary: true, render: (row) => periodText(row.periodKey) },
    {
      key: 'createdAt',
      header: 'Отмечено',
      secondary: true,
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'actions',
      header: <VisuallyHidden>Решение</VisuallyHidden>,
      align: 'end',
      render: (row) =>
        row.status === 'pending' ? (
          <Inline gap="xs" justify="end">
            <Button
              size="sm"
              variant="primary"
              aria-label={`Засчитать: ${row.taskTitle}`}
              loading={approve.isPending && approve.variables === row.id}
              onClick={() =>
                approve.mutate(row.id, {
                  onSuccess: (done) =>
                    toast.show(
                      done.reward
                        ? `Засчитано: +${done.reward.xp} XP, +${done.reward.coins} монет`
                        : 'Засчитано',
                      { tone: 'success' },
                    ),
                  onError: (error) => toast.show(errorText(error), { tone: 'error' }),
                })
              }
            >
              Засчитать
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Не засчитать: ${row.taskTitle}`}
              onClick={() => setRejecting(row)}
            >
              Не засчитать
            </Button>
          </Inline>
        ) : row.status === 'approved' ? (
          <Badge tone="success">
            засчитано{row.reward ? `: +${row.reward.xp} XP, +${row.reward.coins}` : ''}
          </Badge>
        ) : (
          <Badge>не засчитано{row.note ? ` — «${row.note}»` : ''}</Badge>
        ),
    },
  ];
  return (
    <Stack gap="md">
      <SegmentedControl
        label="Какие отметки показать"
        size="sm"
        options={Object.entries(CHORE_STATUS).map(([value, label]) => ({
          value: value as ChoreCompletionStatus,
          label,
        }))}
        value={status}
        onChange={setStatus}
      />
      <DataTable
        caption="Дела"
        captionHidden
        columns={columns}
        rows={reviews.data ?? []}
        rowKey={(row) => row.id}
        loading={reviews.isPending}
        error={reviews.isError ? errorText(reviews.error) : undefined}
        empty={status === 'pending' ? 'Проверять нечего' : 'Пока пусто'}
      />
      {rejecting && <RejectDialog completion={rejecting} onClose={() => setRejecting(null)} />}
    </Stack>
  );
}

function Retries({ names }: { names: ReadonlyMap<number, string> }) {
  const requests = useRetryRequests('open');
  const grant = useGrantRetry();
  const toast = useToast();
  const columns: Column<RetryRequestDto>[] = [
    {
      key: 'learner',
      header: 'Ученик',
      render: (row) => names.get(row.learnerId) ?? `№ ${row.learnerId}`,
    },
    {
      key: 'task',
      header: 'Тест',
      render: (row) =>
        row.attemptId === null ? (
          row.taskTitle
        ) : (
          <UiLink href={`/admin/attempts/${row.attemptId}`}>{row.taskTitle}</UiLink>
        ),
    },
    {
      key: 'createdAt',
      header: 'Попросил',
      secondary: true,
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'actions',
      header: <VisuallyHidden>Решение</VisuallyHidden>,
      align: 'end',
      render: (row) => (
        <Button
          size="sm"
          variant="primary"
          aria-label={`Разрешить пересдачу: ${row.taskTitle}`}
          loading={grant.isPending && grant.variables?.taskId === row.taskId}
          onClick={() =>
            grant.mutate(
              { learnerId: row.learnerId, taskId: row.taskId },
              {
                onSuccess: () => toast.show('Пересдача разрешена', { tone: 'success' }),
                onError: (error) => toast.show(errorText(error), { tone: 'error' }),
              },
            )
          }
        >
          Разрешить пересдачу
        </Button>
      ),
    },
  ];
  return (
    <DataTable
      caption="Просьбы о пересдаче"
      captionHidden
      columns={columns}
      rows={requests.data ?? []}
      rowKey={(row) => row.id}
      loading={requests.isPending}
      error={requests.isError ? errorText(requests.error) : undefined}
      empty="Просьб нет"
    />
  );
}

export function Reviews() {
  const [params, setParams] = useSearchParams();
  const queue: Queue = params.get('queue') === 'retries' ? 'retries' : 'chores';
  const users = useUsers();
  const chores = useChoreReviews('pending');
  const retries = useRetryRequests('open');
  const names = useMemo(
    () => new Map((users.data ?? []).map((user) => [user.id, user.name])),
    [users.data],
  );
  return (
    <AdminPage
      title="Проверки"
      description="Дела, которые ученики отметили сделанными, и просьбы о ещё одной попытке теста."
    >
      <Tabs
        label="Очереди"
        items={[
          { id: 'chores', label: 'Дела', count: chores.data?.length },
          { id: 'retries', label: 'Пересдачи', count: retries.data?.length },
        ]}
        value={queue}
        onChange={(id) => setParams(id === 'chores' ? {} : { queue: id }, { replace: true })}
      >
        {queue === 'chores' ? <Chores names={names} /> : <Retries names={names} />}
      </Tabs>
    </AdminPage>
  );
}
