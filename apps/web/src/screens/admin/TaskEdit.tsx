// /admin/tasks/:id — one task: publication (with the reasons it cannot be published yet), the
// common fields, the type's own settings (its Editor), assignments to learners, then the
// type's own sections (question bank, transcript…), all through the task-type registry.
import { findTaskTypeContract } from '@questclass/shared/tasks/registry';
import { taskUpdateSchema, type TaskDto, type TaskStatus } from '@questclass/shared/tasks/dto';
import {
  ArrowLeft,
  Badge,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  DateTimeInput,
  EmptyState,
  Field,
  Grid,
  Inline,
  Modal,
  Notice,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  useToast,
} from '@questclass/ui';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { isApiError } from '../../api/client';
import { errorText, formatDateTime, issuesByField } from '../../features/admin/forms';
import {
  TASK_STATUS_LABEL,
  useAdminSubjects,
  useAdminTask,
  useAssignment,
  useDeleteTask,
  useUpdateTask,
} from '../../features/admin-tasks/queries';
import { useLearners } from '../../features/users/queries';
import { taskTypes } from '../../task-types/registry';
import { AdminPage } from '../../templates/AdminShell';
import { STATUS_TONE, typeLabel } from './Tasks';

/** ISO date-time → the value of a `datetime-local` input in the browser's zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Reasons from the server's 422 `cannot_publish`. */
function publishProblems(error: unknown): string[] | null {
  if (!isApiError(error) || error.code !== 'cannot_publish') return null;
  const errors = (error.details as { errors?: unknown } | undefined)?.errors;
  return Array.isArray(errors) ? errors.map(String) : [error.message];
}

function Publication({ task }: { task: TaskDto }) {
  const update = useUpdateTask(task.id);
  const remove = useDeleteTask();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const setStatus = (status: TaskStatus, done: string) =>
    update.mutate({ status }, { onSuccess: () => toast.show(done, { tone: 'success' }) });
  const problems = update.isError ? publishProblems(update.error) : null;
  const deleteError =
    remove.isError && isApiError(remove.error) && remove.error.code === 'has_history'
      ? 'У задания есть история (попытки, награды) — его можно только убрать в архив.'
      : remove.isError
        ? errorText(remove.error)
        : null;
  return (
    <Card
      title="Публикация"
      actions={<Badge tone={STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>}
    >
      <Stack gap="md">
        <Text tone="muted">
          {task.status === 'draft' &&
            'Черновик видите только вы. После публикации задание появится у учеников.'}
          {task.status === 'published' &&
            `Опубликовано ${formatDateTime(task.publishedAt)}. Ученики его видят.`}
          {task.status === 'archived' && 'В архиве: ученики его не видят, история сохранена.'}
        </Text>
        {problems && (
          <Notice tone="warning">
            <Stack gap="xs">
              <Text weight="semibold">Пока нельзя опубликовать:</Text>
              <Stack as="ul" gap="xs" aria-label="Что мешает публикации">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </Stack>
            </Stack>
          </Notice>
        )}
        {update.isError && !problems && <Notice tone="danger">{errorText(update.error)}</Notice>}
        {deleteError && <Notice tone="warning">{deleteError}</Notice>}
        <Inline>
          {task.status === 'draft' && (
            <Button
              variant="primary"
              loading={update.isPending}
              onClick={() => setStatus('published', 'Задание опубликовано')}
            >
              Опубликовать
            </Button>
          )}
          {task.status === 'published' && (
            <Button
              loading={update.isPending}
              onClick={() => setStatus('draft', 'Снято с публикации')}
            >
              Снять с публикации
            </Button>
          )}
          {task.status !== 'archived' && (
            <Button variant="ghost" onClick={() => setStatus('archived', 'Задание в архиве')}>
              В архив
            </Button>
          )}
          {task.status === 'archived' && (
            <Button
              loading={update.isPending}
              onClick={() => setStatus('draft', 'Задание снова черновик')}
            >
              Вернуть в черновики
            </Button>
          )}
          {task.status === 'draft' && (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Удалить
            </Button>
          )}
        </Inline>
      </Stack>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Удалить «${task.title}»?`}
        description="Удалить можно только задание без истории. Иначе — в архив."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(task.id, {
                  onSuccess: () => void navigate('/admin/tasks', { replace: true }),
                  onSettled: () => setConfirmDelete(false),
                })
              }
            >
              Удалить
            </Button>
          </>
        }
      />
    </Card>
  );
}

interface Draft {
  title: string;
  description: string;
  subjectId: string;
  xp: number | null;
  coins: number | null;
  releaseAt: string;
  lessonDate: string;
  sort: number | null;
}

const draftOf = (task: TaskDto): Draft => ({
  title: task.title,
  description: task.description,
  subjectId: task.subjectId === null ? '' : String(task.subjectId),
  xp: task.xp,
  coins: task.coins,
  releaseAt: toLocalInput(task.releaseAt),
  lessonDate: task.lessonDate ?? '',
  sort: task.sort,
});

function MainFields({ task }: { task: TaskDto }) {
  const update = useUpdateTask(task.id);
  const subjects = useAdminSubjects();
  const toast = useToast();
  const [draft, setDraft] = useState(() => draftOf(task));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const saved = draftOf(task);
    const patch: Record<string, unknown> = {};
    if (draft.title !== saved.title) patch['title'] = draft.title;
    if (draft.description !== saved.description) patch['description'] = draft.description;
    if (draft.subjectId !== saved.subjectId) {
      patch['subjectId'] = draft.subjectId === '' ? null : Number(draft.subjectId);
    }
    if (draft.xp !== saved.xp) patch['xp'] = draft.xp;
    if (draft.coins !== saved.coins) patch['coins'] = draft.coins;
    if (draft.releaseAt !== saved.releaseAt) patch['releaseAt'] = fromLocalInput(draft.releaseAt);
    if (draft.lessonDate !== saved.lessonDate) {
      patch['lessonDate'] = draft.lessonDate === '' ? null : draft.lessonDate;
    }
    if (draft.sort !== saved.sort) patch['sort'] = draft.sort;
    if (Object.keys(patch).length === 0) return;
    const check = taskUpdateSchema.safeParse(patch);
    if (!check.success) {
      setErrors(issuesByField(check.error.issues));
      return;
    }
    setErrors({});
    update.mutate(check.data, {
      onSuccess: (fresh) => {
        setDraft(draftOf(fresh));
        toast.show('Сохранено', { tone: 'success' });
      },
    });
  };

  const subjectOptions = (subjects.data ?? []).filter(
    (subject) => !subject.archived || String(subject.id) === draft.subjectId,
  );
  return (
    <Card title="Основное">
      <form noValidate onSubmit={submit} aria-label="Основное">
        <Stack gap="md">
          {update.isError && <Notice tone="danger">{errorText(update.error)}</Notice>}
          <Field label="Название" required error={errors['title']}>
            <TextInput
              value={draft.title}
              maxLength={150}
              onChange={(event) => set('title', event.currentTarget.value)}
            />
          </Field>
          <Field label="Описание" error={errors['description']}>
            <Textarea
              rows={3}
              maxLength={1500}
              showCount
              value={draft.description}
              onChange={(event) => set('description', event.currentTarget.value)}
            />
          </Field>
          <Field label="Предмет" error={errors['subjectId']}>
            <Select
              options={[
                { value: '', label: 'Без предмета' },
                ...subjectOptions.map((subject) => ({
                  value: String(subject.id),
                  label: subject.name,
                })),
              ]}
              value={draft.subjectId}
              onChange={(event) => set('subjectId', event.currentTarget.value)}
            />
          </Field>
          <Grid min="sm" gap="md">
            <Field label="Награда: XP" hint="От 0 до 1000." error={errors['xp']}>
              <NumberInput
                value={draft.xp}
                min={0}
                max={1000}
                onChange={(value) => set('xp', value)}
              />
            </Field>
            <Field label="Награда: монеты" hint="От 0 до 1000." error={errors['coins']}>
              <NumberInput
                value={draft.coins}
                min={0}
                max={1000}
                onChange={(value) => set('coins', value)}
              />
            </Field>
          </Grid>
          <Grid min="sm" gap="md">
            <Field
              label="Открыть не раньше"
              hint="Пусто — сразу после публикации."
              error={errors['releaseAt']}
            >
              <DateTimeInput
                value={draft.releaseAt}
                onChange={(event) => set('releaseAt', event.currentTarget.value)}
              />
            </Field>
            <Field
              label="Дата урока"
              hint="Показывается ученику: «Урок от …»."
              error={errors['lessonDate']}
            >
              <TextInput
                type="date"
                value={draft.lessonDate}
                onChange={(event) => set('lessonDate', event.currentTarget.value)}
              />
            </Field>
          </Grid>
          <Field label="Порядок" hint="Меньше — раньше внутри предмета." error={errors['sort']}>
            <NumberInput
              value={draft.sort}
              min={0}
              max={1_000_000}
              onChange={(value) => set('sort', value)}
            />
          </Field>
          <Inline>
            <Button type="submit" variant="primary" loading={update.isPending}>
              Сохранить
            </Button>
          </Inline>
        </Stack>
      </form>
    </Card>
  );
}

function TypeSettings({ task }: { task: TaskDto }) {
  const update = useUpdateTask(task.id);
  const toast = useToast();
  const [config, setConfig] = useState<unknown>(task.config);
  const [error, setError] = useState('');
  // A saved config (or one changed by an import) replaces the draft.
  const [base, setBase] = useState<unknown>(task.config);
  if (base !== task.config) {
    setBase(task.config);
    setConfig(task.config);
  }
  const contract = findTaskTypeContract(task.type);
  const dirty = JSON.stringify(config) !== JSON.stringify(task.config);
  const save = () => {
    const check = contract?.configSchema.safeParse(config);
    if (check && !check.success) {
      setError(check.error.issues[0]?.message ?? 'Некорректные настройки');
      return;
    }
    setError('');
    update.mutate(
      { config: check ? check.data : config },
      { onSuccess: () => toast.show('Настройки задания сохранены', { tone: 'success' }) },
    );
  };
  return (
    <Card title={`Настройки: ${typeLabel(task.type)}`}>
      <Stack gap="md">
        {taskTypes.renderEditor(task.type, {
          config,
          onChange: setConfig,
          disabled: update.isPending,
        })}
        {error && <Notice tone="danger">{error}</Notice>}
        {update.isError && <Notice tone="danger">{errorText(update.error)}</Notice>}
        {taskTypes.hasEditor(task.type) && dirty && (
          <Inline>
            <Button variant="primary" loading={update.isPending} onClick={save}>
              Сохранить настройки
            </Button>
            <Button variant="ghost" onClick={() => setConfig(task.config)}>
              Отменить
            </Button>
          </Inline>
        )}
      </Stack>
    </Card>
  );
}

function Assignments({ task }: { task: TaskDto }) {
  const learners = useLearners();
  const assignment = useAssignment(task.id);
  const active = (learners.data ?? []).filter(
    (learner) => learner.active || task.assignees.includes(learner.id),
  );
  return (
    <Card
      title="Кому назначено"
      description={
        task.assignees.length === 0
          ? 'Никому лично: задание видят все ученики и открывают по порядку.'
          : 'Назначенное открыто ученику сразу и стоит первым.'
      }
    >
      <Stack gap="sm">
        {assignment.isError && <Notice tone="danger">{errorText(assignment.error)}</Notice>}
        {learners.isPending ? (
          <Text tone="muted">Загружаем учеников…</Text>
        ) : active.length === 0 ? (
          <Text tone="muted">Учеников пока нет — их добавляют в «Пользователях».</Text>
        ) : (
          active.map((learner) => (
            <Checkbox
              key={learner.id}
              label={learner.name}
              description={learner.active ? undefined : 'отключён'}
              checked={task.assignees.includes(learner.id)}
              disabled={assignment.isPending}
              onChange={(assigned) => assignment.mutate({ learnerId: learner.id, assigned })}
            />
          ))
        )}
      </Stack>
    </Card>
  );
}

export function TaskEdit() {
  const id = Number(useParams().id);
  const task = useAdminTask(id);
  const back = (
    <ButtonLink href="/admin/tasks" variant="ghost" icon={<ArrowLeft aria-hidden="true" />}>
      Все задания
    </ButtonLink>
  );
  if (task.isPending) {
    return (
      <AdminPage title="Задание" actions={back}>
        <Card loading />
      </AdminPage>
    );
  }
  if (task.isError) {
    return (
      <AdminPage title="Задание" actions={back}>
        <EmptyState
          tone="error"
          title={
            isApiError(task.error) && task.error.status === 404
              ? 'Задание не найдено'
              : 'Не получилось загрузить'
          }
          description={errorText(task.error)}
        />
      </AdminPage>
    );
  }
  const data = task.data;
  return (
    <AdminPage
      title={data.title}
      description={`${typeLabel(data.type)}${data.externalId ? ` · из импорта (${data.externalId})` : ''}`}
      actions={back}
    >
      <Publication task={data} />
      <MainFields key={`main-${data.id}`} task={data} />
      <TypeSettings key={`type-${data.id}`} task={data} />
      <Assignments task={data} />
      {taskTypes.renderSections({ task: data })}
    </AdminPage>
  );
}
