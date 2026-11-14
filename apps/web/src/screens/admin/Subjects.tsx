// /admin/subjects — subjects of the lessons: name (unique regardless of case), built-in icon,
// order. A subject with lessons is archived instead of deleted.
import manifestJson from '@questclass/shared/assets/manifest.json';
import {
  subjectCreateSchema,
  subjectUpdateSchema,
  type SubjectDto,
} from '@questclass/shared/tasks/dto';
import {
  Badge,
  Button,
  DataTable,
  Field,
  Inline,
  Modal,
  Notice,
  NumberInput,
  Pencil,
  Plus,
  Select,
  Stack,
  Switch,
  TextInput,
  VisuallyHidden,
  useToast,
  type Column,
} from '@questclass/ui';
import { useId, useState, type FormEvent } from 'react';
import { isApiError } from '../../api/client';
import { errorText, issuesByField } from '../../features/admin/forms';
import {
  useAdminSubjects,
  useCreateSubject,
  useDeleteSubject,
  useUpdateSubject,
} from '../../features/admin-tasks/queries';
import { SubjectIcon } from '../../features/tasks/SubjectIcon';
import { AdminPage } from '../../templates/AdminShell';

const ICON_DIR = 'game/subjects-pixel/';

/** Built-in subject icons of the asset manifest, as icon keys (without `.webp`). */
export const SUBJECT_ICONS: readonly string[] = Object.keys(manifestJson as Record<string, unknown>)
  .filter((key) => key.startsWith(ICON_DIR) && key.endsWith('.webp'))
  .map((key) => key.slice(0, -'.webp'.length))
  .sort();

interface Draft {
  name: string;
  key: string;
  icon: string;
  sort: number | null;
  archived: boolean;
}

function SubjectDialog({ subject, onClose }: { subject: SubjectDto | null; onClose: () => void }) {
  const formId = useId();
  const create = useCreateSubject();
  const update = useUpdateSubject();
  const remove = useDeleteSubject();
  const toast = useToast();
  const mutation = subject ? update : create;
  const [draft, setDraft] = useState<Draft>({
    name: subject?.name ?? '',
    key: subject?.key ?? '',
    icon: subject?.icon ?? '',
    sort: subject?.sort ?? null,
    archived: subject?.archived ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const icon = draft.icon === '' ? null : draft.icon;
    const done = () => {
      toast.show('Предмет сохранён', { tone: 'success' });
      onClose();
    };
    if (!subject) {
      const check = subjectCreateSchema.safeParse({
        name: draft.name,
        ...(draft.key.trim() !== '' && { key: draft.key.trim() }),
        icon,
        ...(draft.sort !== null && { sort: draft.sort }),
      });
      if (!check.success) return setErrors(issuesByField(check.error.issues));
      setErrors({});
      create.mutate(check.data, { onSuccess: done });
      return;
    }
    const patch: Record<string, unknown> = {};
    if (draft.name.trim() !== subject.name) patch['name'] = draft.name;
    if (icon !== subject.icon) patch['icon'] = icon;
    if (draft.sort !== null && draft.sort !== subject.sort) patch['sort'] = draft.sort;
    if (draft.archived !== subject.archived) patch['archived'] = draft.archived;
    if (Object.keys(patch).length === 0) return onClose();
    const check = subjectUpdateSchema.safeParse(patch);
    if (!check.success) return setErrors(issuesByField(check.error.issues));
    setErrors({});
    update.mutate({ id: subject.id, patch: check.data }, { onSuccess: done });
  };

  const removeError =
    remove.isError && isApiError(remove.error) && remove.error.code === 'has_history'
      ? 'У предмета есть задания или история — его можно только убрать в архив.'
      : remove.isError
        ? errorText(remove.error)
        : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={subject ? `Предмет «${subject.name}»` : 'Новый предмет'}
      footer={
        <>
          {subject && (
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(subject.id, {
                  onSuccess: () => {
                    toast.show('Предмет удалён', { tone: 'success' });
                    onClose();
                  },
                })
              }
            >
              Удалить
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={mutation.isPending}>
            Сохранить
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit}>
        <Stack gap="md">
          {mutation.isError && <Notice tone="danger">{errorText(mutation.error)}</Notice>}
          {removeError && <Notice tone="warning">{removeError}</Notice>}
          <Field label="Название" required error={errors['name']}>
            <TextInput
              value={draft.name}
              maxLength={80}
              onChange={(event) => set('name', event.currentTarget.value)}
            />
          </Field>
          {!subject && (
            <Field
              label="Ключ"
              hint="Латиницей, например music: по нему предмет узнают импорт и настройки. Пусто — придумается сам."
              error={errors['key']}
            >
              <TextInput
                value={draft.key}
                spellCheck={false}
                maxLength={40}
                onChange={(event) => set('key', event.currentTarget.value)}
              />
            </Field>
          )}
          <Field label="Значок" error={errors['icon']}>
            <Select
              options={[
                { value: '', label: 'Без значка' },
                ...SUBJECT_ICONS.map((icon) => ({
                  value: icon,
                  label: icon.slice(ICON_DIR.length),
                })),
              ]}
              value={draft.icon}
              onChange={(event) => set('icon', event.currentTarget.value)}
            />
          </Field>
          <Inline>
            <SubjectIcon
              subject={{
                id: 0,
                key: draft.key,
                name: draft.name,
                icon: draft.icon === '' ? null : draft.icon,
                sort: 0,
                archived: false,
              }}
            />
          </Inline>
          <Field label="Порядок" hint="Меньше — раньше в списках." error={errors['sort']}>
            <NumberInput
              value={draft.sort}
              min={0}
              max={100_000}
              onChange={(value) => set('sort', value)}
            />
          </Field>
          {subject && (
            <Switch
              label="В архиве"
              description="Предмет и его задания не видны ученикам; история остаётся."
              checked={draft.archived}
              onChange={(checked) => set('archived', checked)}
            />
          )}
        </Stack>
      </form>
    </Modal>
  );
}

export function Subjects() {
  const subjects = useAdminSubjects();
  const [editing, setEditing] = useState<SubjectDto | 'new' | null>(null);
  const columns: Column<SubjectDto>[] = [
    {
      key: 'icon',
      header: <VisuallyHidden>Значок</VisuallyHidden>,
      render: (subject) => <SubjectIcon subject={subject} />,
    },
    { key: 'name', header: 'Название' },
    { key: 'key', header: 'Ключ', secondary: true },
    { key: 'sort', header: 'Порядок', secondary: true, align: 'end' },
    {
      key: 'status',
      header: 'Статус',
      render: (subject) =>
        subject.archived ? <Badge>В архиве</Badge> : <Badge tone="success">Активен</Badge>,
    },
    {
      key: 'actions',
      header: <VisuallyHidden>Действия</VisuallyHidden>,
      align: 'end',
      render: (subject) => (
        <Button
          size="sm"
          icon={<Pencil aria-hidden="true" />}
          aria-label={`Изменить: ${subject.name}`}
          onClick={() => setEditing(subject)}
        >
          Изменить
        </Button>
      ),
    },
  ];
  return (
    <AdminPage
      title="Предметы"
      description="Названия не повторяются (без учёта регистра). Предмет с заданиями не удаляется — только в архив."
      actions={
        <Button
          variant="primary"
          icon={<Plus aria-hidden="true" />}
          onClick={() => setEditing('new')}
        >
          Добавить предмет
        </Button>
      }
    >
      <DataTable
        caption="Предметы"
        captionHidden
        columns={columns}
        rows={subjects.data ?? []}
        rowKey={(subject) => subject.id}
        loading={subjects.isPending}
        error={subjects.isError ? errorText(subjects.error) : undefined}
        empty="Предметов пока нет"
      />
      {editing && (
        <SubjectDialog
          subject={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </AdminPage>
  );
}
