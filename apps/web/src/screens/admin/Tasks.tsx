// /admin/tasks — every task with filters (subject, status, type, title), the counter of import
// revisions waiting for a decision, and a new task of any registered type.
import { TASK_TYPE_CONTRACTS, findTaskTypeContract } from '@questclass/shared/tasks/registry';
import {
  TASK_STATUSES,
  taskCreateSchema,
  type TaskDto,
  type TaskStatus,
} from '@questclass/shared/tasks/dto';
import {
  Badge,
  Button,
  ButtonLink,
  DataTable,
  Field,
  Grid,
  Modal,
  Notice,
  Plus,
  Search,
  Select,
  Stack,
  TextInput,
  UiLink,
  type BadgeTone,
  type Column,
} from '@questclass/ui';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { errorText, formatDay, issuesByField } from '../../features/admin/forms';
import {
  TASK_STATUS_LABEL,
  useAdminSubjects,
  useAdminTasks,
  useCreateTask,
  type TaskFilter,
} from '../../features/admin-tasks/queries';
import { useRevisions } from '../../features/imports/queries';
import { useLearners } from '../../features/users/queries';
import { AdminPage } from '../../templates/AdminShell';

export const STATUS_TONE: Readonly<Record<TaskStatus, BadgeTone>> = {
  draft: 'warning',
  published: 'success',
  archived: 'neutral',
};

export function typeLabel(type: string): string {
  return findTaskTypeContract(type)?.label ?? type;
}

function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const subjects = useAdminSubjects();
  const create = useCreateTask();
  const navigate = useNavigate();
  const [type, setType] = useState(TASK_TYPE_CONTRACTS[0]?.type ?? '');
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const check = taskCreateSchema.safeParse({
      type,
      title,
      subjectId: subjectId === '' ? null : Number(subjectId),
    });
    if (!check.success) {
      setErrors(issuesByField(check.error.issues));
      return;
    }
    setErrors({});
    create.mutate(check.data, { onSuccess: (task) => void navigate(`/admin/tasks/${task.id}`) });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Новое задание"
      description="Создаётся черновиком: ученики увидят его после публикации."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={create.isPending}>
            Создать
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit}>
        <Stack gap="md">
          {create.isError && <Notice tone="danger">{errorText(create.error)}</Notice>}
          <Field label="Тип">
            <Select
              options={TASK_TYPE_CONTRACTS.map((contract) => ({
                value: contract.type,
                label: contract.label,
              }))}
              value={type}
              onChange={(event) => setType(event.currentTarget.value)}
            />
          </Field>
          <Field label="Название" required error={errors['title']}>
            <TextInput
              value={title}
              maxLength={150}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </Field>
          <Field label="Предмет" error={errors['subjectId']}>
            <Select
              options={[
                { value: '', label: 'Без предмета' },
                ...(subjects.data ?? [])
                  .filter((subject) => !subject.archived)
                  .map((subject) => ({ value: String(subject.id), label: subject.name })),
              ]}
              value={subjectId}
              onChange={(event) => setSubjectId(event.currentTarget.value)}
            />
          </Field>
        </Stack>
      </form>
    </Modal>
  );
}

export function Tasks() {
  const [filter, setFilter] = useState<TaskFilter>({});
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const tasks = useAdminTasks(filter);
  const subjects = useAdminSubjects();
  const learners = useLearners();
  const revisions = useRevisions(true);

  const subjectName = useMemo(
    () => new Map((subjects.data ?? []).map((subject) => [subject.id, subject.name])),
    [subjects.data],
  );
  const learnerName = useMemo(
    () => new Map((learners.data ?? []).map((learner) => [learner.id, learner.name])),
    [learners.data],
  );
  const needle = search.trim().toLocaleLowerCase('ru-RU');
  const rows = (tasks.data ?? []).filter(
    (task) => needle === '' || task.title.toLocaleLowerCase('ru-RU').includes(needle),
  );

  const columns: Column<TaskDto>[] = [
    {
      key: 'title',
      header: 'Название',
      render: (task) => <UiLink href={`/admin/tasks/${task.id}`}>{task.title}</UiLink>,
    },
    { key: 'type', header: 'Тип', secondary: true, render: (task) => typeLabel(task.type) },
    {
      key: 'subject',
      header: 'Предмет',
      secondary: true,
      render: (task) =>
        task.subjectId === null ? '—' : (subjectName.get(task.subjectId) ?? `№ ${task.subjectId}`),
    },
    {
      key: 'status',
      header: 'Статус',
      render: (task) => (
        <Badge tone={STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
      ),
    },
    {
      key: 'assignees',
      header: 'Кому',
      secondary: true,
      render: (task) =>
        task.assignees.length === 0
          ? 'Всем по порядку'
          : task.assignees.map((id) => learnerName.get(id) ?? `№ ${id}`).join(', '),
    },
    {
      key: 'lessonDate',
      header: 'Дата урока',
      secondary: true,
      render: (task) => formatDay(task.lessonDate),
    },
  ];

  const pending = revisions.data?.length ?? 0;
  return (
    <AdminPage
      title="Задания"
      description="Уроки, тесты и дела. Черновики видите только вы; ученики — опубликованные."
      actions={
        <Button
          variant="primary"
          icon={<Plus aria-hidden="true" />}
          onClick={() => setCreating(true)}
        >
          Новое задание
        </Button>
      }
    >
      {pending > 0 && (
        <Notice
          tone="warning"
          action={
            <ButtonLink href="/admin/tasks/revisions" size="sm">
              Открыть
            </ButtonLink>
          }
        >
          Импорт предлагает изменения опубликованных уроков: {pending}.
        </Notice>
      )}
      <Grid min="md" gap="sm" role="search" aria-label="Фильтры заданий">
        <Field label="Поиск" labelHidden>
          <TextInput
            icon={<Search />}
            placeholder="Название задания"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </Field>
        <Field label="Предмет" labelHidden>
          <Select
            options={[
              { value: '', label: 'Все предметы' },
              ...(subjects.data ?? []).map((subject) => ({
                value: String(subject.id),
                label: subject.name,
              })),
            ]}
            value={filter.subjectId === undefined ? '' : String(filter.subjectId)}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setFilter(({ subjectId: _, ...rest }) =>
                value === '' ? rest : { ...rest, subjectId: Number(value) },
              );
            }}
          />
        </Field>
        <Field label="Статус" labelHidden>
          <Select
            options={[
              { value: '', label: 'Все статусы' },
              ...TASK_STATUSES.map((status) => ({
                value: status,
                label: TASK_STATUS_LABEL[status],
              })),
            ]}
            value={filter.status ?? ''}
            onChange={(event) => {
              const value = event.currentTarget.value as TaskStatus | '';
              setFilter(({ status: _, ...rest }) =>
                value === '' ? rest : { ...rest, status: value },
              );
            }}
          />
        </Field>
        <Field label="Тип" labelHidden>
          <Select
            options={[
              { value: '', label: 'Все типы' },
              ...TASK_TYPE_CONTRACTS.map((contract) => ({
                value: contract.type,
                label: contract.label,
              })),
            ]}
            value={filter.type ?? ''}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setFilter(({ type: _, ...rest }) => (value === '' ? rest : { ...rest, type: value }));
            }}
          />
        </Field>
      </Grid>
      <DataTable
        caption="Задания"
        captionHidden
        columns={columns}
        rows={rows}
        rowKey={(task) => task.id}
        loading={tasks.isPending}
        error={tasks.isError ? errorText(tasks.error) : undefined}
        empty={needle || Object.keys(filter).length > 0 ? 'Ничего не нашлось' : 'Заданий пока нет'}
      />
      {creating && <NewTaskDialog onClose={() => setCreating(false)} />}
    </AdminPage>
  );
}
