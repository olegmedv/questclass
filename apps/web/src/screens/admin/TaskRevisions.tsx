// /admin/tasks/revisions — what a new import proposes for lessons that are already published:
// the list, and one revision with the question diff, conflicts with the admin's edits and the
// «Принять» / «Отклонить» decision (FEAT-012 API).
import type {
  QuestionOutcomeDto,
  RevisionQuestionDiffDto,
  RevisionStatus,
  RevisionSummaryDto,
} from '@questclass/shared/import/manifest';
import {
  ArrowLeft,
  Badge,
  Button,
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  Grid,
  Inline,
  Notice,
  Stack,
  Tabs,
  Text,
  UiLink,
  useToast,
  type BadgeTone,
  type Column,
} from '@questclass/ui';
import { useState } from 'react';
import { useParams } from 'react-router';
import { errorText, formatDateTime } from '../../features/admin/forms';
import { useDecideRevision, useRevision, useRevisions } from '../../features/imports/queries';
import { QuestionView } from '../../features/questions/QuestionView';
import { AdminPage } from '../../templates/AdminShell';

const STATUS: Readonly<Record<RevisionStatus, { label: string; tone: BadgeTone }>> = {
  pending: { label: 'Ждёт решения', tone: 'warning' },
  accepted: { label: 'Принята', tone: 'success' },
  rejected: { label: 'Отклонена', tone: 'neutral' },
  superseded: { label: 'Заменена новой', tone: 'neutral' },
};

const CHANGE: Readonly<
  Record<RevisionQuestionDiffDto['change'], { label: string; tone: BadgeTone; hint: string }>
> = {
  created: { label: 'Новый', tone: 'success', hint: 'Появится в банке после принятия.' },
  updated: { label: 'Изменён', tone: 'info', hint: 'Заменит текущую версию после принятия.' },
  removed: { label: 'Убран', tone: 'warning', hint: 'Уйдёт в архив после принятия.' },
  conflict: {
    label: 'Конфликт',
    tone: 'danger',
    hint: 'Этот вопрос вы правили сами: импорт его не трогает, ваша версия остаётся.',
  },
};

/** «новых 2 · изменено 1 · конфликтов 1». */
export function outcomeText(questions: QuestionOutcomeDto): string {
  const parts = [
    questions.created.length > 0 ? `новых ${questions.created.length}` : null,
    questions.updated.length > 0 ? `изменено ${questions.updated.length}` : null,
    questions.removed.length > 0 ? `убрано ${questions.removed.length}` : null,
    questions.conflicts.length > 0 ? `конфликтов ${questions.conflicts.length}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'вопросы без изменений';
}

function mediaText(revision: RevisionSummaryDto): string | null {
  if (revision.mediaId === null && revision.imagesMediaId === null) return null;
  return revision.mediaReady ? 'Новое видео загружено' : 'Новое видео ещё загружается';
}

export function TaskRevisions() {
  const [pendingOnly, setPendingOnly] = useState(true);
  const revisions = useRevisions(pendingOnly);
  const columns: Column<RevisionSummaryDto>[] = [
    {
      key: 'task',
      header: 'Урок',
      render: (revision) => (
        <UiLink href={`/admin/tasks/revisions/${revision.id}`}>{revision.taskTitle}</UiLink>
      ),
    },
    {
      key: 'changes',
      header: 'Что меняется',
      secondary: true,
      render: (revision) =>
        [outcomeText(revision.questions), mediaText(revision)].filter(Boolean).join(' · '),
    },
    {
      key: 'createdAt',
      header: 'Пришла',
      secondary: true,
      render: (revision) => formatDateTime(revision.createdAt),
    },
    {
      key: 'status',
      header: 'Статус',
      render: (revision) => (
        <Badge tone={STATUS[revision.status].tone}>{STATUS[revision.status].label}</Badge>
      ),
    },
  ];
  return (
    <AdminPage
      title="Ревизии импорта"
      description="Повторный импорт опубликованного урока не меняет его сразу: сначала вы смотрите разницу."
      actions={
        <ButtonLink href="/admin/tasks" variant="ghost" icon={<ArrowLeft aria-hidden="true" />}>
          Все задания
        </ButtonLink>
      }
    >
      <Tabs
        label="Какие ревизии показать"
        variant="underline"
        items={[
          { id: 'pending', label: 'Ждут решения' },
          { id: 'all', label: 'Все' },
        ]}
        value={pendingOnly ? 'pending' : 'all'}
        onChange={(id) => setPendingOnly(id === 'pending')}
      />
      <DataTable
        caption="Ревизии"
        captionHidden
        columns={columns}
        rows={revisions.data ?? []}
        rowKey={(revision) => revision.id}
        loading={revisions.isPending}
        error={revisions.isError ? errorText(revisions.error) : undefined}
        empty={pendingOnly ? 'Решать нечего' : 'Ревизий ещё не было'}
      />
    </AdminPage>
  );
}

function DiffCard({ item }: { item: RevisionQuestionDiffDto }) {
  const change = CHANGE[item.change];
  return (
    <Card
      as="article"
      headingLevel={3}
      title={`Вопрос «${item.key}»`}
      description={change.hint}
      actions={<Badge tone={change.tone}>{change.label}</Badge>}
    >
      <Grid min="md" gap="md">
        <Stack gap="xs">
          <Text tone="muted" size="sm" weight="semibold">
            Сейчас{item.current ? ` (версия ${item.current.version})` : ''}
          </Text>
          {item.current ? <QuestionView question={item.current} /> : <Text tone="subtle">—</Text>}
        </Stack>
        <Stack gap="xs">
          <Text tone="muted" size="sm" weight="semibold">
            Предлагает импорт
          </Text>
          {item.proposed ? <QuestionView question={item.proposed} /> : <Text tone="subtle">—</Text>}
        </Stack>
      </Grid>
    </Card>
  );
}

export function TaskRevision() {
  const id = Number(useParams().id);
  const revision = useRevision(id);
  const decide = useDecideRevision(id);
  const toast = useToast();
  const back = (
    <ButtonLink
      href="/admin/tasks/revisions"
      variant="ghost"
      icon={<ArrowLeft aria-hidden="true" />}
    >
      Все ревизии
    </ButtonLink>
  );
  if (revision.isPending || revision.isError) {
    return (
      <AdminPage title="Ревизия импорта" actions={back}>
        {revision.isPending ? (
          <Card loading />
        ) : (
          <EmptyState
            tone="error"
            title="Не получилось загрузить"
            description={errorText(revision.error)}
          />
        )}
      </AdminPage>
    );
  }
  const data = revision.data;
  const media = mediaText(data);
  return (
    <AdminPage
      title={`Ревизия: ${data.taskTitle}`}
      description={`Пришла ${formatDateTime(data.createdAt)} · ${outcomeText(data.questions)}`}
      actions={back}
    >
      <Card
        title="Решение"
        actions={<Badge tone={STATUS[data.status].tone}>{STATUS[data.status].label}</Badge>}
      >
        <Stack gap="md">
          {media && (
            <Text>
              {media}
              {data.currentMediaId !== null ? ' — заменит текущее после принятия.' : '.'}
            </Text>
          )}
          {data.questions.conflicts.length > 0 && (
            <Notice tone="warning">
              Конфликтов: {data.questions.conflicts.length}. Эти вопросы вы правили сами — принятие
              их не изменит.
            </Notice>
          )}
          {decide.isError && <Notice tone="danger">{errorText(decide.error)}</Notice>}
          {data.status === 'pending' ? (
            <Inline>
              <Button
                variant="primary"
                loading={decide.isPending && decide.variables === 'acceptance'}
                disabled={decide.isPending}
                onClick={() =>
                  decide.mutate('acceptance', {
                    onSuccess: () => toast.show('Ревизия принята', { tone: 'success' }),
                  })
                }
              >
                Принять
              </Button>
              <Button
                variant="danger"
                loading={decide.isPending && decide.variables === 'rejection'}
                disabled={decide.isPending}
                onClick={() =>
                  decide.mutate('rejection', {
                    onSuccess: () => toast.show('Ревизия отклонена', { tone: 'success' }),
                  })
                }
              >
                Отклонить
              </Button>
            </Inline>
          ) : (
            <Text tone="muted">Решение принято {formatDateTime(data.decidedAt)}.</Text>
          )}
          <Inline>
            <ButtonLink href={`/admin/tasks/${data.taskId}`} size="sm">
              Открыть урок
            </ButtonLink>
          </Inline>
        </Stack>
      </Card>
      {data.diff.length === 0 ? (
        <EmptyState title="Вопросы не меняются" />
      ) : (
        <Stack gap="md" aria-label="Разница вопросов">
          {data.diff.map((item) => (
            <DiffCard key={item.key} item={item} />
          ))}
        </Stack>
      )}
    </AdminPage>
  );
}
