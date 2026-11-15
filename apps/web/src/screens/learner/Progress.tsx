// «Мой прогресс» (SPEC §3 «ProgressView»): level, XP, coins and done tasks, the study streak,
// the tasks passed, and the history of every XP and coin (the ledger), page by page.
import type { LedgerEntryDto } from '@questclass/shared/economy/dto';
import {
  ActionList,
  Button,
  ButtonLink,
  Card,
  Stack,
  Text,
  Trophy,
  type Column,
} from '@questclass/ui';
import { useMemo } from 'react';
import { dateText, ledgerLabel, useMyLedger } from '../../features/rewards/queries';
import { StreakPanel } from '../../features/streak/StreakPanel';
import { useLearnerTasks, useMyProgress, useSubjects } from '../../features/tasks/queries';
import { useWallet } from '../../features/wallet/queries';
import { ProgressView } from '../../templates/ProgressView';

const number = (value: number) => value.toLocaleString('ru-RU');
const signed = (value: number) =>
  value > 0 ? `+${number(value)}` : value < 0 ? number(value) : '—';

interface HistoryRow {
  readonly id: number;
  readonly date: string;
  readonly what: string;
  readonly xp: number;
  readonly coins: number;
}

const COLUMNS: readonly Column<HistoryRow>[] = [
  {
    key: 'what',
    header: 'За что',
    render: (row) => (
      <Stack gap="xs">
        <Text size="sm">{row.what}</Text>
        <Text size="xs" tone="muted">
          {row.date}
        </Text>
      </Stack>
    ),
  },
  { key: 'xp', header: 'XP', align: 'end', render: (row) => signed(row.xp) },
  { key: 'coins', header: 'Монеты', align: 'end', render: (row) => signed(row.coins) },
];

export function Progress() {
  const wallet = useWallet();
  const progress = useMyProgress();
  const tasks = useLearnerTasks();
  const subjects = useSubjects();
  const ledger = useMyLedger();

  const titles = useMemo(
    () => new Map((tasks.data ?? []).map((task) => [String(task.id), task.title] as const)),
    [tasks.data],
  );
  const subjectNames = useMemo(
    () => new Map((subjects.data ?? []).map((s) => [s.id, s.name] as const)),
    [subjects.data],
  );
  const done = (progress.data?.tasks ?? [])
    .filter((task) => task.completed)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const rows: HistoryRow[] = (ledger.data?.pages ?? [])
    .flatMap((page) => page.items)
    .map((entry: LedgerEntryDto) => ({
      id: entry.id,
      date: dateText(entry.at),
      what: ledgerLabel(entry, titles),
      xp: entry.xp,
      coins: entry.coins,
    }));
  const data = wallet.data;

  return (
    <ProgressView
      title="Мой прогресс"
      description="Пройденные задания, серия занятий и все начисления."
      actions={
        <ButtonLink href="/rewards" size="sm" icon={<Trophy aria-hidden="true" />}>
          Мои награды
        </ButtonLink>
      }
      totalsLoading={!data || !progress.data}
      totals={[
        {
          id: 'level',
          label: 'Уровень',
          value: data?.level ?? 0,
          kind: 'level',
          hint: data ? `До ${data.level + 1}-го — ${number(data.xpToNext)} XP` : undefined,
        },
        { id: 'xp', label: 'Опыт', value: number(data?.xp ?? 0), kind: 'xp' },
        { id: 'coins', label: 'Монеты', value: number(data?.coins ?? 0), kind: 'coins' },
        { id: 'done', label: 'Заданий пройдено', value: done.length, kind: 'neutral' },
      ]}
      streak={<StreakPanel />}
      history={{
        caption: 'История начислений',
        columns: COLUMNS,
        rows,
        rowKey: (row) => row.id,
        loading: ledger.isPending,
        error: ledger.isError ? ledger.error.message : undefined,
        empty: 'Начислений пока нет. Пройди урок — и здесь появится первая награда.',
      }}
      historyFooter={
        ledger.hasNextPage && (
          <Button loading={ledger.isFetchingNextPage} onClick={() => void ledger.fetchNextPage()}>
            Показать ещё
          </Button>
        )
      }
    >
      <Card title="Пройдено" padding="md">
        {progress.isPending ? (
          <Text tone="muted">Загружаем…</Text>
        ) : (
          <ActionList
            label="Пройденные задания"
            items={done.map((task) => ({
              id: String(task.taskId),
              title: task.title,
              description: [
                task.subjectId === null ? null : subjectNames.get(task.subjectId),
                task.completedAt ? dateText(task.completedAt) : null,
                task.score !== null && task.total !== null
                  ? `верных ${task.score} из ${task.total}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · '),
              status: 'done',
            }))}
            empty="Пока ничего. Первый пройденный урок появится здесь."
          />
        )}
      </Card>
    </ProgressView>
  );
}
