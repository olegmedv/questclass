// /admin/progress/:learnerId — how a learner's tasks stand, and the parent's hand on them:
// close (with or without the reward), reopen («Пройти с мамой»), reset one task or everything,
// zero the coins, allow one more attempt, and the type's own actions (watch confirmation…).
import type { AttemptSummaryDto } from '@questclass/shared/attempts/dto';
import type { LockReason, ProgressState, TaskProgressDto } from '@questclass/shared/progress/dto';
import { settingFieldOf } from '@questclass/shared/settings/form';
import { SETTINGS } from '@questclass/shared/settings/registry';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Inline,
  Menu,
  MenuIcon,
  Modal,
  Notice,
  Select,
  Stack,
  StatChip,
  Switch,
  Text,
  TextInput,
  UiLink,
  VisuallyHidden,
  useToast,
  type BadgeTone,
  type Column,
} from '@questclass/ui';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { errorText, formatDateTime, newRequestId } from '../../features/admin/forms';
import {
  useCloseTask,
  useGrantRetry,
  useLearnerAttempts,
  useLearnerProgress,
  useLearnerStreak,
  useReopenTask,
  useResetCoins,
  useResetProgress,
} from '../../features/admin-progress/queries';
import { LearnerSelect } from '../../features/users/LearnerSelect';
import { useLearners } from '../../features/users/queries';
import { taskTypes } from '../../task-types/registry';
import { AdminPage } from '../../templates/AdminShell';
import { typeLabel } from './Tasks';

const STATE: Readonly<Record<ProgressState, { label: string; tone: BadgeTone }>> = {
  none: { label: 'Не начато', tone: 'neutral' },
  started: { label: 'Начато', tone: 'info' },
  passed: { label: 'Пройдено', tone: 'success' },
  closed: { label: 'Закрыто родителем', tone: 'gold' },
};

const LOCK: Readonly<Record<LockReason, string>> = {
  previous: 'ждёт предыдущий урок',
  rotation: 'ждёт очереди в круге предметов',
};

/** What a reset keeps and what it does not ask again (FEAT-009, FEAT-013). */
export const RESET_KEEPS =
  'Монеты, покупки и герой остаются. Просмотренное видео не сбрасывается: вопросы урока откроются без повторного просмотра.';

const CONFIRM_WORD = 'СБРОСИТЬ';

function stateBadge(row: TaskProgressDto) {
  const state = STATE[row.state];
  return (
    <Inline gap="xs">
      <Badge tone={state.tone}>{state.label}</Badge>
      {row.completed && row.state !== 'passed' && row.state !== 'closed' && (
        <Badge tone="success">пройдено раньше</Badge>
      )}
    </Inline>
  );
}

function CloseDialog({
  learnerId,
  row,
  onClose,
}: {
  learnerId: number;
  row: TaskProgressDto;
  onClose: () => void;
}) {
  const close = useCloseTask(learnerId);
  const toast = useToast();
  const [withReward, setWithReward] = useState(true);
  const [reason, setReason] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title={`Закрыть «${row.title}»?`}
      description="Задание будет считаться выполненным. Награда за задание платится один раз за всё время."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            loading={close.isPending}
            onClick={() =>
              close.mutate(
                {
                  taskId: row.taskId,
                  input: { withReward, ...(reason.trim() !== '' && { reason: reason.trim() }) },
                },
                {
                  onSuccess: ({ reward }) => {
                    toast.show(
                      reward.xp > 0 || reward.coins > 0
                        ? `Закрыто. Начислено: +${reward.xp} XP, +${reward.coins} монет`
                        : 'Закрыто без награды',
                      { tone: 'success' },
                    );
                    onClose();
                  },
                },
              )
            }
          >
            Закрыть задание
          </Button>
        </>
      }
    >
      <Stack gap="md">
        {close.isError && <Notice tone="danger">{errorText(close.error)}</Notice>}
        <Switch
          label="С наградой"
          description="Полная награда задания, если ученик её ещё не получал."
          checked={withReward}
          onChange={setWithReward}
        />
        <Field label="Причина" hint="Видна в истории, необязательно.">
          <TextInput
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        </Field>
      </Stack>
    </Modal>
  );
}

function ResetTaskDialog({
  learnerId,
  row,
  onClose,
}: {
  learnerId: number;
  row: TaskProgressDto;
  onClose: () => void;
}) {
  const reset = useResetProgress(learnerId);
  const toast = useToast();
  const [requestId] = useState(newRequestId);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Сбросить «${row.title}»?`}
      description={`Попытки и прохождение этого задания забудутся — его можно пройти заново. ${RESET_KEEPS}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="danger"
            loading={reset.isPending}
            onClick={() =>
              reset.mutate(
                { taskId: row.taskId, requestId },
                {
                  onSuccess: () => {
                    toast.show('Задание сброшено', { tone: 'success' });
                    onClose();
                  },
                },
              )
            }
          >
            Сбросить
          </Button>
        </>
      }
    >
      {reset.isError && <Notice tone="danger">{errorText(reset.error)}</Notice>}
    </Modal>
  );
}

function ResetAllDialog({
  learnerId,
  name,
  onClose,
}: {
  learnerId: number;
  name: string;
  onClose: () => void;
}) {
  const reset = useResetProgress(learnerId);
  const toast = useToast();
  const [requestId] = useState(newRequestId);
  const [word, setWord] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title={`Сбросить весь прогресс: ${name}?`}
      description={`Все попытки, прохождения и серия занятий начнутся заново. ${RESET_KEEPS}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="danger"
            loading={reset.isPending}
            disabled={word.trim().toUpperCase() !== CONFIRM_WORD}
            onClick={() =>
              reset.mutate(
                { requestId },
                {
                  onSuccess: () => {
                    toast.show('Прогресс сброшен', { tone: 'success' });
                    onClose();
                  },
                },
              )
            }
          >
            Сбросить всё
          </Button>
        </>
      }
    >
      <Stack gap="md">
        {reset.isError && <Notice tone="danger">{errorText(reset.error)}</Notice>}
        <Field label={`Чтобы подтвердить, напишите ${CONFIRM_WORD}`}>
          <TextInput
            value={word}
            autoComplete="off"
            onChange={(event) => setWord(event.currentTarget.value)}
          />
        </Field>
      </Stack>
    </Modal>
  );
}

function CoinsDialog({
  learnerId,
  name,
  onClose,
}: {
  learnerId: number;
  name: string;
  onClose: () => void;
}) {
  const reset = useResetCoins(learnerId);
  const toast = useToast();
  const [requestId] = useState(newRequestId);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Обнулить монеты: ${name}?`}
      description="В журнал начислений ляжет одна запись, которая доводит монеты до нуля. Опыт, уровень и покупки не меняются."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="danger"
            loading={reset.isPending}
            onClick={() =>
              reset.mutate(requestId, {
                onSuccess: (entry) => {
                  toast.show(
                    entry.coins === 0 ? 'Монет и так не было' : `Списано монет: ${-entry.coins}`,
                    { tone: 'success' },
                  );
                  onClose();
                },
              })
            }
          >
            Обнулить
          </Button>
        </>
      }
    >
      {reset.isError && <Notice tone="danger">{errorText(reset.error)}</Notice>}
    </Modal>
  );
}

type Dialog = { kind: 'close' | 'reset'; row: TaskProgressDto } | { kind: 'reset-all' | 'coins' };

function Attempts({ learnerId, tasks }: { learnerId: number; tasks: readonly TaskProgressDto[] }) {
  const [taskId, setTaskId] = useState<number | null>(null);
  const attempts = useLearnerAttempts(learnerId, taskId);
  const title = useMemo(() => new Map(tasks.map((task) => [task.taskId, task.title])), [tasks]);
  const columns: Column<AttemptSummaryDto>[] = [
    {
      key: 'task',
      header: 'Задание',
      render: (attempt) => (
        <UiLink href={`/admin/attempts/${attempt.id}`}>
          {title.get(attempt.taskId) ?? `Задание № ${attempt.taskId}`}
        </UiLink>
      ),
    },
    {
      key: 'startedAt',
      header: 'Начата',
      secondary: true,
      render: (attempt) => formatDateTime(attempt.startedAt),
    },
    {
      key: 'result',
      header: 'Результат',
      render: (attempt) =>
        attempt.status === 'in_progress' ? (
          <Badge tone="info">идёт</Badge>
        ) : attempt.status === 'abandoned' ? (
          <Badge>брошена при сбросе</Badge>
        ) : (
          <Inline gap="xs">
            <Text as="span">
              {attempt.correct ?? 0} из {attempt.total}
            </Text>
            {attempt.passed ? (
              <Badge tone="success">зачёт</Badge>
            ) : (
              <Badge tone="danger">не зачёт</Badge>
            )}
          </Inline>
        ),
    },
  ];
  return (
    <Card
      title="Попытки"
      description="Вопросы попытки — снимок на момент начала: правки банка их не меняют."
    >
      <Stack gap="md">
        <Field label="Задание">
          <Select
            options={[
              { value: '', label: 'Все задания' },
              ...tasks.map((task) => ({ value: String(task.taskId), label: task.title })),
            ]}
            value={taskId === null ? '' : String(taskId)}
            onChange={(event) =>
              setTaskId(event.currentTarget.value === '' ? null : Number(event.currentTarget.value))
            }
          />
        </Field>
        <DataTable
          caption="Список попыток"
          captionHidden
          columns={columns}
          rows={attempts.data ?? []}
          rowKey={(attempt) => attempt.id}
          loading={attempts.isPending}
          error={attempts.isError ? errorText(attempts.error) : undefined}
          empty="Попыток пока нет"
        />
      </Stack>
    </Card>
  );
}

function ProgressOf({ learnerId, name }: { learnerId: number; name: string }) {
  const progress = useLearnerProgress(learnerId);
  const streak = useLearnerStreak(learnerId);
  const reopen = useReopenTask(learnerId);
  const grant = useGrantRetry();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [state, setState] = useState<ProgressState | ''>('');

  if (progress.isPending) return <Card loading />;
  if (progress.isError) {
    return (
      <EmptyState
        tone="error"
        title="Не получилось загрузить прогресс"
        description={errorText(progress.error)}
      />
    );
  }
  const data = progress.data;
  const modeField = settingFieldOf(SETTINGS['progress.unlockMode'].schema);
  const modeLabel =
    modeField.kind === 'enum'
      ? (modeField.options.find((option) => option.value === data.mode)?.label ?? data.mode)
      : data.mode;
  const rows = data.tasks.filter((row) => state === '' || row.state === state);

  const actionsOf = (row: TaskProgressDto) => [
    {
      id: 'close',
      label: 'Закрыть…',
      disabled: row.state === 'closed' || row.state === 'passed',
      onSelect: () => setDialog({ kind: 'close', row }),
    },
    {
      id: 'reopen',
      label: 'Переоткрыть («Пройти с мамой»)',
      disabled: !row.completed,
      onSelect: () =>
        reopen.mutate(row.taskId, {
          onSuccess: () => toast.show('Задание переоткрыто', { tone: 'success' }),
          onError: (error) => toast.show(errorText(error), { tone: 'error' }),
        }),
    },
    {
      id: 'retry',
      label: 'Разрешить ещё попытку',
      onSelect: () =>
        grant.mutate(
          { learnerId, taskId: row.taskId },
          {
            onSuccess: () => toast.show('Ещё одна попытка разрешена', { tone: 'success' }),
            onError: (error) => toast.show(errorText(error), { tone: 'error' }),
          },
        ),
    },
    {
      id: 'reset',
      label: 'Сбросить…',
      disabled: row.state === 'none' && !row.completed,
      onSelect: () => setDialog({ kind: 'reset', row }),
    },
  ];

  const columns: Column<TaskProgressDto>[] = [
    {
      key: 'title',
      header: 'Задание',
      render: (row) => (
        <Stack gap="xs">
          <UiLink href={`/admin/tasks/${row.taskId}`}>{row.title}</UiLink>
          <Text as="span" tone="muted" size="sm">
            {typeLabel(row.type)}
            {row.assigned ? ' · назначено' : ''}
            {row.closedReason ? ` · «${row.closedReason}»` : ''}
          </Text>
        </Stack>
      ),
    },
    { key: 'state', header: 'Состояние', render: stateBadge },
    {
      key: 'score',
      header: 'Результат',
      secondary: true,
      render: (row) => (row.score === null ? '—' : `${row.score} из ${row.total ?? '?'}`),
    },
    {
      key: 'access',
      header: 'Доступ',
      secondary: true,
      render: (row) =>
        row.available ? 'открыто' : `закрыто: ${row.lockReason ? LOCK[row.lockReason] : 'пока'}`,
    },
    {
      key: 'actions',
      header: <VisuallyHidden>Действия</VisuallyHidden>,
      align: 'end',
      render: (row) => (
        <Inline gap="xs" justify="end" nowrap>
          {taskTypes.renderProgressActions({ learnerId, progress: row })}
          <Menu
            label={`Действия: ${row.title}`}
            trigger={<MenuIcon aria-hidden="true" />}
            align="end"
            items={actionsOf(row)}
          />
        </Inline>
      ),
    },
  ];

  return (
    <Stack gap="lg">
      <Card>
        <Inline gap="md">
          {data.assignedTotal > 0 && (
            <StatChip
              kind="neutral"
              label="Задания от родителя"
              showLabel
              value={`${data.assignedDone} из ${data.assignedTotal}`}
            />
          )}
          <StatChip
            kind="neutral"
            label="Серия занятий, дней"
            showLabel
            value={streak.data?.current ?? '…'}
          />
          <Text tone="muted" size="sm">
            Как открываются задания: {modeLabel}.
          </Text>
        </Inline>
      </Card>
      <Field label="Состояние">
        <Select
          options={[
            { value: '', label: 'Все задания' },
            ...Object.entries(STATE).map(([value, { label }]) => ({ value, label })),
          ]}
          value={state}
          onChange={(event) => setState(event.currentTarget.value as ProgressState | '')}
        />
      </Field>
      <DataTable
        caption={`Задания: ${name}`}
        captionHidden
        columns={columns}
        rows={rows}
        rowKey={(row) => row.taskId}
        empty={state === '' ? 'Ученику пока не видно ни одного задания' : 'Таких заданий нет'}
      />
      <Attempts learnerId={learnerId} tasks={data.tasks} />
      <Card title="Сброс" tone="danger" description={RESET_KEEPS}>
        <Inline>
          <Button variant="danger" onClick={() => setDialog({ kind: 'reset-all' })}>
            Сбросить весь прогресс
          </Button>
          <Button variant="danger" onClick={() => setDialog({ kind: 'coins' })}>
            Обнулить монеты
          </Button>
        </Inline>
      </Card>
      {dialog?.kind === 'close' && (
        <CloseDialog learnerId={learnerId} row={dialog.row} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'reset' && (
        <ResetTaskDialog learnerId={learnerId} row={dialog.row} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'reset-all' && (
        <ResetAllDialog learnerId={learnerId} name={name} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'coins' && (
        <CoinsDialog learnerId={learnerId} name={name} onClose={() => setDialog(null)} />
      )}
    </Stack>
  );
}

export function LearnerProgress() {
  const params = useParams();
  const navigate = useNavigate();
  const learners = useLearners();
  const learnerId = params.learnerId ? Number(params.learnerId) : null;
  const learner = learners.data?.find((user) => user.id === learnerId) ?? null;
  const first = learners.data?.find((user) => user.active) ?? learners.data?.[0];

  if (learnerId === null && first) {
    return <Navigate to={`/admin/progress/${first.id}`} replace />;
  }
  return (
    <AdminPage
      title="Прогресс"
      description="Как идут задания ученика. Закрыть, переоткрыть или сбросить можно по каждому."
    >
      {learners.isError ? (
        <EmptyState
          tone="error"
          title="Не получилось загрузить учеников"
          description={errorText(learners.error)}
        />
      ) : learners.data?.length === 0 ? (
        <EmptyState
          title="Учеников пока нет"
          description="Добавьте ученика в разделе «Пользователи»."
        />
      ) : (
        <>
          <LearnerSelect
            learners={learners.data ?? []}
            value={learnerId}
            onChange={(id) => void navigate(`/admin/progress/${id}`)}
          />
          {learnerId !== null && learners.data && !learner ? (
            <EmptyState title="Такого ученика нет" />
          ) : learner ? (
            <ProgressOf key={learner.id} learnerId={learner.id} name={learner.name} />
          ) : (
            <Card loading />
          )}
        </>
      )}
    </AdminPage>
  );
}
