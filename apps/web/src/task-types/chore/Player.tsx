// Player of the `chore` type (a real-life deed): «Я сделал» → «Ждёт проверки» → «Засчитано»
// (with a celebration) or «Не засчитано: комментарий». A repeatable chore pays once per day or
// week; the server decides the period, the Player only shows its state.
import { CHORE_TYPE, type ChoreRepeat } from '@questclass/shared/task-types/chore/contract';
import type { ChoreCompletionDto, ChoreStatusDto } from '@questclass/shared/task-types/chore/dto';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Celebration,
  Check,
  Flag,
  Gift,
  Inline,
  Notice,
  ResultSummary,
  RewardLine,
  Spinner,
  Stack,
  Text,
  type Step,
} from '@questclass/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { api, isApiError } from '../../api/client';
import { useSound } from '../../features/sound/useSound';
import { refreshLearnerData } from '../../features/tasks/queries';
import { TaskPlayer } from '../../templates/TaskPlayer';
import type { TaskPlayerProps, WebTaskType } from '../registry';

export const choreKeys = {
  status: (taskId: number) => ['me', 'chores', taskId] as const,
};

/** While a report waits for the parent, its fate is checked every half a minute. */
const PENDING_REFRESH_MS = 30_000;

/** A celebration is shown for an approval this recent that this device has not celebrated. */
const CELEBRATE_WITHIN_MS = 3 * 24 * 60 * 60 * 1000;

const CELEBRATION_PREFIX = 'quest-chore-celebration-v1';

export const choreCelebrationKey = (completion: Pick<ChoreCompletionDto, 'learnerId' | 'id'>) =>
  `${CELEBRATION_PREFIX}:${completion.learnerId}:${completion.id}`;

function wasCelebrated(completion: ChoreCompletionDto): boolean {
  try {
    return localStorage.getItem(choreCelebrationKey(completion)) !== null;
  } catch {
    return false;
  }
}

function markCelebrated(completion: ChoreCompletionDto): void {
  try {
    localStorage.setItem(choreCelebrationKey(completion), '1');
  } catch {
    // Private mode: the celebration may show again, nothing else breaks.
  }
}

/** An approval worth celebrating on this device now. */
export function shouldCelebrate(
  completion: ChoreCompletionDto | null,
  now: number = Date.now(),
): completion is ChoreCompletionDto {
  if (completion?.status !== 'approved' || !completion.reviewedAt) return false;
  if (now - Date.parse(completion.reviewedAt) > CELEBRATE_WITHIN_MS) return false;
  return !wasCelebrated(completion);
}

const REPEAT_TEXT: Record<ChoreRepeat, string> = {
  once: 'Сделай дело и нажми «Я сделал». Родитель проверит и начислит награду.',
  daily: 'Это дело можно делать каждый день. Награда — один раз в день.',
  weekly: 'Это дело можно делать каждую неделю. Награда — один раз в неделю.',
};

const AGAIN_TEXT: Record<Exclude<ChoreRepeat, 'once'>, string> = {
  daily: 'Сегодня уже засчитано. Завтра можно снова.',
  weekly: 'На этой неделе уже засчитано. На следующей неделе можно снова.',
};

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

function choreSteps(completion: ChoreCompletionDto | null): Step[] {
  const status = completion?.status ?? null;
  const reported = status === 'pending' || status === 'approved';
  return [
    {
      id: 'deed',
      label: 'Сделать',
      icon: <Flag />,
      status: reported ? 'done' : 'current',
    },
    {
      id: 'review',
      label: 'Проверка родителя',
      icon: <Check />,
      status: status === 'approved' ? 'done' : status === 'pending' ? 'current' : 'todo',
    },
    {
      id: 'reward',
      label: 'Награда',
      icon: <Gift />,
      status: status === 'approved' ? 'done' : 'todo',
    },
  ];
}

function statusBadge(completion: ChoreCompletionDto) {
  switch (completion.status) {
    case 'pending':
      return <Badge tone="info">Ждёт проверки</Badge>;
    case 'approved':
      return <Badge tone="success">Засчитано</Badge>;
    case 'rejected':
      return <Badge tone="danger">Не засчитано</Badge>;
  }
}

/** Earlier reports of this chore (not the current one), newest first. */
function History({ items }: { readonly items: readonly ChoreCompletionDto[] }) {
  if (items.length === 0) return null;
  return (
    <Card title="Раньше" headingLevel={3} padding="md">
      <Stack as="ul" gap="sm" aria-label="Раньше">
        {items.map((item) => (
          <li key={item.id}>
            <Inline justify="between" gap="sm">
              <Text size="sm">{date(item.createdAt)}</Text>
              {statusBadge(item)}
            </Inline>
            {item.status === 'rejected' && item.note && (
              <Text size="sm" tone="muted">
                {item.note}
              </Text>
            )}
          </li>
        ))}
      </Stack>
    </Card>
  );
}

export function ChorePlayer({ task, subject, progress }: TaskPlayerProps) {
  const client = useQueryClient();
  const sound = useSound();
  const status = useQuery({
    queryKey: choreKeys.status(task.id),
    queryFn: () => api<ChoreStatusDto>(`/api/tasks/${task.id}/chore-completions`),
    refetchInterval: (query) =>
      query.state.data?.current?.status === 'pending' ? PENDING_REFRESH_MS : false,
    refetchOnWindowFocus: true,
  });
  const report = useMutation({
    mutationFn: () =>
      api<ChoreCompletionDto>(`/api/tasks/${task.id}/chore-completions`, { method: 'POST' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: choreKeys.status(task.id) });
      void refreshLearnerData(client);
    },
  });
  const [celebrating, setCelebrating] = useState<ChoreCompletionDto | null>(null);
  const [checkedApproval, setCheckedApproval] = useState<number | null>(null);

  const current = status.data?.current ?? null;
  // A fresh approval is celebrated once on this device (decided when it first shows up).
  if (current?.status === 'approved' && current.id !== checkedApproval) {
    setCheckedApproval(current.id);
    if (shouldCelebrate(current)) setCelebrating(current);
  }
  useEffect(() => {
    if (!celebrating) return;
    markCelebrated(celebrating);
    // The reward changed the numbers in the header.
    void refreshLearnerData(client);
  }, [celebrating, client]);

  const frame = (body: ReactNode, actions?: ReactNode) => (
    <TaskPlayer
      title={task.title}
      subject={subject?.name}
      backHref="/"
      steps={choreSteps(current)}
      actions={actions}
    >
      {body}
    </TaskPlayer>
  );

  if (status.isPending) {
    return frame(
      <Inline justify="center">
        <Spinner size="lg" label="Загружаем дело" />
      </Inline>,
    );
  }
  if (status.isError) {
    return frame(
      <Stack gap="md">
        <Notice tone="danger">{status.error.message}</Notice>
        <Inline>
          <Button variant="primary" onClick={() => void status.refetch()}>
            Повторить
          </Button>
          <ButtonLink href="/">К урокам</ButtonLink>
        </Inline>
      </Stack>,
    );
  }

  const { repeat, items } = status.data;
  const locked = progress?.available === false;
  const earlier = items.filter((item) => item.id !== current?.id);
  const reportError =
    report.isError &&
    (isApiError(report.error) && report.error.code === 'task_locked'
      ? 'Это дело ещё не открыто.'
      : `Не получилось отправить. ${report.error.message}`);

  const intro = (
    <Card padding="lg">
      <Stack gap="md">
        {task.description && <Text>{task.description}</Text>}
        <Text tone="muted">{REPEAT_TEXT[repeat]}</Text>
        <RewardLine label="Награда за дело" xp={task.xp} coins={task.coins} />
      </Stack>
    </Card>
  );
  const reportButton = (label: string) => (
    <Button
      variant="primary"
      size="lg"
      icon={<Check aria-hidden="true" />}
      disabled={locked}
      loading={report.isPending}
      onClick={() => report.mutate()}
    >
      {label}
    </Button>
  );

  let body;
  let actions;
  if (current?.status === 'pending') {
    body = (
      <ResultSummary tone="partial" title="Ждёт проверки">
        <p>Ты отметил, что сделал это дело. Родитель проверит и начислит награду.</p>
        <p>Отправлено {date(current.createdAt)}.</p>
      </ResultSummary>
    );
    actions = <ButtonLink href="/">К урокам</ButtonLink>;
  } else if (current?.status === 'approved') {
    body = (
      <ResultSummary
        tone="success"
        title="Засчитано"
        reward={
          current.reward && (
            <RewardLine label="Награда" xp={current.reward.xp} coins={current.reward.coins} />
          )
        }
      >
        <p>Родитель подтвердил: дело сделано.</p>
        {repeat !== 'once' && <p>{AGAIN_TEXT[repeat]}</p>}
      </ResultSummary>
    );
    actions = <ButtonLink href="/">К урокам</ButtonLink>;
  } else if (current?.status === 'rejected') {
    body = (
      <Stack gap="md">
        <ResultSummary tone="retry" title="Не засчитано">
          {current.note ? (
            <p>Комментарий родителя: {current.note}</p>
          ) : (
            <p>Родитель не засчитал это дело.</p>
          )}
          <p>Доделай и нажми «Я сделал» ещё раз.</p>
        </ResultSummary>
        {intro}
      </Stack>
    );
    actions = reportButton('Я сделал');
  } else {
    body = intro;
    actions = reportButton('Я сделал');
  }

  return (
    <>
      {frame(
        <Stack gap="md">
          {locked && <Notice tone="info">Это дело ещё не открыто.</Notice>}
          {reportError && <Notice tone="danger">{reportError}</Notice>}
          {body}
          <History items={earlier} />
        </Stack>,
        actions,
      )}
      {celebrating && (
        <Celebration
          variant="pass"
          open
          onClose={() => setCelebrating(null)}
          title="Засчитано!"
          message={`«${task.title}» — родитель подтвердил, что дело сделано.`}
          reward={celebrating.reward ?? {}}
          onReward={() => sound.play('complete')}
        />
      )}
    </>
  );
}

export const choreTaskType: WebTaskType = {
  type: CHORE_TYPE,
  label: 'Дело',
  Player: ChorePlayer,
};
