// /admin/history — what happened: a learner's XP and coins (every reward, purchase, award,
// cancellation) and the admin actions of the installation, filtered by learner, kind and dates,
// a page at a time.
import {
  LEDGER_SOURCE_TYPES,
  type LedgerEntryDto,
  type LedgerSourceType,
} from '@questclass/shared/economy/dto';
import {
  Badge,
  Button,
  DataTable,
  Field,
  Grid,
  Inline,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  type Column,
} from '@questclass/ui';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorText, formatDateTime } from '../../features/admin/forms';
import {
  useAuditHistory,
  useLedgerHistory,
  type AuditRecordDto,
  type HistoryRange,
} from '../../features/admin-history/queries';
import { useUsers } from '../../features/users/queries';
import { AdminPage } from '../../templates/AdminShell';

export const SOURCE_LABEL: Readonly<Record<LedgerSourceType, string>> = {
  task: 'Задание',
  streak: 'Серия занятий',
  award: 'От родителя',
  chore: 'Дело',
  purchase: 'Покупка',
  coins_reset: 'Обнуление монет',
};

/** Russian names of the audit actions; an unknown one is shown as is. */
export const ACTION_LABEL: Readonly<Record<string, string>> = {
  'auth.setup_completed': 'Первый запуск',
  'device.trusted': 'Устройство стало детским',
  'device.revoked': 'Устройство отозвано',
  'user.created': 'Добавлен пользователь',
  'user.updated': 'Изменён пользователь',
  'user.deactivated': 'Пользователь отключён',
  'user.reactivated': 'Пользователь включён',
  'user.password_reset': 'Пароль сброшен из консоли',
  'user.password_changed': 'Свой пароль изменён',
  'setting.updated': 'Изменена настройка',
  'secret.updated': 'Изменён ключ API',
  'subject.created': 'Добавлен предмет',
  'subject.updated': 'Изменён предмет',
  'subject.deleted': 'Удалён предмет',
  'task.created': 'Создано задание',
  'task.updated': 'Изменено задание',
  'task.deleted': 'Удалено задание',
  'task.assigned': 'Задание назначено',
  'task.unassigned': 'Назначение снято',
  'question.created': 'Добавлен вопрос',
  'question.updated': 'Изменён вопрос',
  'question.archived': 'Вопрос в архиве',
  'question.imported': 'Загружен тест',
  'transcript.created': 'Добавлена расшифровка',
  'import.lesson': 'Импорт урока',
  'import_token.created': 'Выпущен токен импорта',
  'import_token.revoked': 'Отозван токен импорта',
  'task_revision.accepted': 'Ревизия принята',
  'task_revision.rejected': 'Ревизия отклонена',
  'progress.closed': 'Задание закрыто',
  'progress.reopened': 'Задание переоткрыто',
  'progress.reset': 'Прогресс сброшен',
  'ledger.coins_reset': 'Монеты обнулены',
  'attempt.retry_granted': 'Разрешена пересдача',
  'watch.confirmed': 'Просмотр подтверждён',
  'chore.approved': 'Дело засчитано',
  'chore.rejected': 'Дело не засчитано',
  'reward_reason.created': 'Добавлена причина наград',
  'reward_reason.updated': 'Изменена причина наград',
  'award.granted': 'Награда начислена',
  'award.cancelled': 'Награда отменена',
  'catalog_item.created': 'Добавлен товар',
  'catalog_item.updated': 'Изменён товар',
  'upload.created': 'Загружена картинка',
  'wish.fulfilled': 'Желание выдано',
};

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** `key: value` pairs of an audit payload, short. */
export function payloadText(payload: Readonly<Record<string, unknown>>): string {
  return Object.entries(payload)
    .map(([key, value]) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      return `${key}: ${text.length > 60 ? `${text.slice(0, 57)}…` : text}`;
    })
    .join(' · ');
}

function RangeFields({
  range,
  onChange,
}: {
  range: HistoryRange;
  onChange: (range: HistoryRange) => void;
}) {
  return (
    <>
      <Field label="С">
        <TextInput
          type="date"
          value={range.from}
          onChange={(event) => onChange({ ...range, from: event.currentTarget.value })}
        />
      </Field>
      <Field label="По">
        <TextInput
          type="date"
          value={range.to}
          onChange={(event) => onChange({ ...range, to: event.currentTarget.value })}
        />
      </Field>
    </>
  );
}

function MoreButton({
  hasNext,
  loading,
  onClick,
}: {
  hasNext: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  if (!hasNext) return null;
  return (
    <Inline>
      <Button loading={loading} onClick={onClick}>
        Показать ещё
      </Button>
    </Inline>
  );
}

function LedgerHistory({ learners }: { learners: { id: number; name: string }[] }) {
  const [learnerId, setLearnerId] = useState<number | null>(null);
  const [type, setType] = useState<LedgerSourceType | ''>('');
  const [range, setRange] = useState<HistoryRange>({ from: '', to: '' });
  const current = learnerId ?? learners[0]?.id ?? null;
  const ledger = useLedgerHistory({ learnerId: current, type, ...range });
  const rows = ledger.data?.pages.flatMap((page) => page.items) ?? [];
  const columns: Column<LedgerEntryDto>[] = [
    { key: 'at', header: 'Когда', render: (entry) => formatDateTime(entry.at) },
    {
      key: 'source',
      header: 'Что',
      render: (entry) => (
        <Stack gap="xs">
          <span>{SOURCE_LABEL[entry.sourceType]}</span>
          {entry.note && (
            <Text as="span" tone="muted" size="sm">
              {entry.note}
            </Text>
          )}
        </Stack>
      ),
    },
    {
      key: 'amount',
      header: 'XP и монеты',
      render: (entry) => `${signed(entry.xp)} XP, ${signed(entry.coins)} монет`,
    },
    {
      key: 'mark',
      header: 'Отметка',
      secondary: true,
      render: (entry) =>
        entry.reversesId !== null ? (
          <Badge tone="warning">отмена записи № {entry.reversesId}</Badge>
        ) : entry.reversedById !== null ? (
          <Badge>отменено</Badge>
        ) : null,
    },
  ];
  return (
    <Stack gap="md">
      <Grid min="sm" gap="sm" role="search" aria-label="Фильтры начислений">
        <Field label="Ученик">
          <Select
            options={learners.map((learner) => ({
              value: String(learner.id),
              label: learner.name,
            }))}
            value={current === null ? '' : String(current)}
            onChange={(event) => setLearnerId(Number(event.currentTarget.value))}
          />
        </Field>
        <Field label="Тип">
          <Select
            options={[
              { value: '', label: 'Все начисления' },
              ...LEDGER_SOURCE_TYPES.map((value) => ({ value, label: SOURCE_LABEL[value] })),
            ]}
            value={type}
            onChange={(event) => setType(event.currentTarget.value as LedgerSourceType | '')}
          />
        </Field>
        <RangeFields range={range} onChange={setRange} />
      </Grid>
      <DataTable
        caption="Начисления"
        captionHidden
        columns={columns}
        rows={rows}
        rowKey={(entry) => entry.id}
        loading={current !== null && ledger.isPending}
        error={ledger.isError ? errorText(ledger.error) : undefined}
        empty={current === null ? 'Учеников пока нет' : 'Начислений нет'}
      />
      <MoreButton
        hasNext={ledger.hasNextPage}
        loading={ledger.isFetchingNextPage}
        onClick={() => void ledger.fetchNextPage()}
      />
    </Stack>
  );
}

function AuditHistory({
  names,
  learners,
}: {
  names: ReadonlyMap<number, string>;
  learners: { id: number; name: string }[];
}) {
  const [learnerId, setLearnerId] = useState<number | null>(null);
  const [action, setAction] = useState('');
  const [range, setRange] = useState<HistoryRange>({ from: '', to: '' });
  const audit = useAuditHistory({ learnerId, action, ...range });
  const rows = audit.data?.pages.flatMap((page) => page.items) ?? [];
  const columns: Column<AuditRecordDto>[] = [
    { key: 'at', header: 'Когда', render: (record) => formatDateTime(record.at) },
    {
      key: 'action',
      header: 'Действие',
      render: (record) => (
        <Stack gap="xs">
          <span>{ACTION_LABEL[record.action] ?? record.action}</span>
          <Text as="span" tone="muted" size="sm">
            {payloadText(record.payload)}
          </Text>
        </Stack>
      ),
    },
    {
      key: 'actor',
      header: 'Кто',
      secondary: true,
      render: (record) =>
        record.actorId === null ? 'Система' : (names.get(record.actorId) ?? `№ ${record.actorId}`),
    },
    {
      key: 'learner',
      header: 'Ученик',
      secondary: true,
      render: (record) =>
        record.learnerId === null ? '—' : (names.get(record.learnerId) ?? `№ ${record.learnerId}`),
    },
  ];
  return (
    <Stack gap="md">
      <Grid min="sm" gap="sm" role="search" aria-label="Фильтры действий">
        <Field label="Ученик">
          <Select
            options={[
              { value: '', label: 'Все' },
              ...learners.map((learner) => ({ value: String(learner.id), label: learner.name })),
            ]}
            value={learnerId === null ? '' : String(learnerId)}
            onChange={(event) =>
              setLearnerId(
                event.currentTarget.value === '' ? null : Number(event.currentTarget.value),
              )
            }
          />
        </Field>
        <Field label="Действие">
          <Select
            options={[
              { value: '', label: 'Все действия' },
              ...Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label })),
            ]}
            value={action}
            onChange={(event) => setAction(event.currentTarget.value)}
          />
        </Field>
        <RangeFields range={range} onChange={setRange} />
      </Grid>
      <DataTable
        caption="Действия"
        captionHidden
        columns={columns}
        rows={rows}
        rowKey={(record) => record.id}
        loading={audit.isPending}
        error={audit.isError ? errorText(audit.error) : undefined}
        empty="Действий нет"
      />
      <MoreButton
        hasNext={audit.hasNextPage}
        loading={audit.isFetchingNextPage}
        onClick={() => void audit.fetchNextPage()}
      />
    </Stack>
  );
}

export function History() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'actions' ? 'actions' : 'ledger';
  const users = useUsers();
  const names = useMemo(
    () => new Map((users.data ?? []).map((user) => [user.id, user.name])),
    [users.data],
  );
  const learners = (users.data ?? []).filter((user) => user.role === 'learner');
  return (
    <AdminPage
      title="История"
      description="Начисления учеников и действия в кабинете. Ничего не удаляется: отмена — отдельная запись."
    >
      <Tabs
        label="Что показать"
        items={[
          { id: 'ledger', label: 'Начисления' },
          { id: 'actions', label: 'Действия' },
        ]}
        value={tab}
        onChange={(id) => setParams(id === 'ledger' ? {} : { tab: id }, { replace: true })}
      >
        {tab === 'ledger' ? (
          users.isPending ? null : (
            <LedgerHistory learners={learners} />
          )
        ) : (
          <AuditHistory names={names} learners={learners} />
        )}
      </Tabs>
    </AdminPage>
  );
}
