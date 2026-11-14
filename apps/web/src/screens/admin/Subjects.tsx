// /admin/subjects — subjects of the lessons: name (unique regardless of case), icon (a built-in
// picture or the admin's own upload), order. A subject with lessons is archived instead of deleted.
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
  FileInput,
  IconPicker,
  ImageOff,
  Modal,
  Notice,
  NumberInput,
  Pencil,
  Plus,
  Stack,
  Switch,
  TextInput,
  VisuallyHidden,
  useToast,
  type Column,
  type IconPickerOption,
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
import { useUploadPicture, useUploads } from '../../features/admin-shop/queries';
import { subjectIconUrl } from '../../features/tasks/assets';
import { SubjectIcon } from '../../features/tasks/SubjectIcon';
import { AdminPage } from '../../templates/AdminShell';

const ICON_DIR = 'game/subjects-pixel/';

/** Built-in subject icons of the asset manifest, as icon keys (without `.webp`). */
export const SUBJECT_ICONS: readonly string[] = Object.keys(manifestJson as Record<string, unknown>)
  .filter((key) => key.startsWith(ICON_DIR) && key.endsWith('.webp'))
  .map((key) => key.slice(0, -'.webp'.length))
  .sort();

interface IconChoice {
  icon: string | null;
  iconUploadId: number | null;
}

interface Draft extends IconChoice {
  name: string;
  key: string;
  sort: number | null;
  archived: boolean;
}

const NO_ICON = '';
const ASSET = 'asset:';
const UPLOAD = 'upload:';

const choiceValue = ({ icon, iconUploadId }: IconChoice): string =>
  iconUploadId !== null ? `${UPLOAD}${iconUploadId}` : icon ? `${ASSET}${icon}` : NO_ICON;

function choiceOf(value: string): IconChoice {
  if (value.startsWith(UPLOAD)) {
    return { icon: null, iconUploadId: Number(value.slice(UPLOAD.length)) };
  }
  if (value.startsWith(ASSET)) return { icon: value.slice(ASSET.length), iconUploadId: null };
  return { icon: null, iconUploadId: null };
}

const uploadOption = (id: number, src: string): IconPickerOption => ({
  value: `${UPLOAD}${id}`,
  label: `Загрузка № ${id}`,
  src,
});

/**
 * The icon of a subject: tiles of the built-in pictures and of the admin's still uploads (the same
 * library as the shop's), plus a button that uploads a new picture and chooses it.
 */
function SubjectIconPicker({
  value,
  error,
  onChange,
}: {
  value: IconChoice;
  error?: string | undefined;
  onChange: (choice: IconChoice) => void;
}) {
  const uploads = useUploads();
  const upload = useUploadPicture();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const stills = (uploads.data ?? []).filter((item) => item.kind === 'image' && !item.animated);
  const options: IconPickerOption[] = [
    { value: NO_ICON, label: 'Без значка', icon: <ImageOff /> },
    ...SUBJECT_ICONS.map((icon) => ({
      value: `${ASSET}${icon}`,
      label: `Встроенный значок «${icon.slice(ICON_DIR.length)}»`,
      src: subjectIconUrl(icon) ?? '',
      pixelated: true,
    })),
    ...stills.map((item) => uploadOption(item.id, item.url)),
  ];
  // The current upload stays a tile while the list loads (or if it is not in the list).
  const chosen = value.iconUploadId;
  if (chosen !== null && !stills.some((item) => item.id === chosen)) {
    options.push(uploadOption(chosen, `/api/uploads/${chosen}`));
  }
  const failure =
    uploadError ??
    (upload.isError ? errorText(upload.error) : null) ??
    (uploads.isError ? errorText(uploads.error) : null);
  return (
    <IconPicker
      legend="Значок"
      hint="Встроенные значки и картинки, загруженные в кабинете. Своя картинка: PNG, JPEG или WebP до 2 МБ, лучше квадрат 256 × 256."
      error={error ?? failure ?? undefined}
      options={options}
      value={choiceValue(value)}
      loading={uploads.isPending}
      onChange={(next) => onChange(choiceOf(next))}
      footer={
        <FileInput
          accept="image/png,image/jpeg,image/webp"
          buttonLabel={upload.isPending ? 'Загружаем…' : 'Загрузить свою картинку'}
          disabled={upload.isPending}
          onChange={(files) => {
            const file = files[0];
            if (!file) return;
            setUploadError(null);
            upload.mutate(file, {
              onSuccess: (created) => {
                if (created.animated) {
                  setUploadError('Для значка нужна обычная картинка, не анимация');
                  return;
                }
                onChange({ icon: null, iconUploadId: created.id });
              },
            });
          }}
        />
      }
    />
  );
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
    icon: subject?.icon ?? null,
    iconUploadId: subject?.iconUploadId ?? null,
    sort: subject?.sort ?? null,
    archived: subject?.archived ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const { icon, iconUploadId } = draft;
    const done = () => {
      toast.show('Предмет сохранён', { tone: 'success' });
      onClose();
    };
    if (!subject) {
      const check = subjectCreateSchema.safeParse({
        name: draft.name,
        ...(draft.key.trim() !== '' && { key: draft.key.trim() }),
        icon,
        iconUploadId,
        ...(draft.sort !== null && { sort: draft.sort }),
      });
      if (!check.success) return setErrors(issuesByField(check.error.issues));
      setErrors({});
      create.mutate(check.data, { onSuccess: done });
      return;
    }
    const patch: Record<string, unknown> = {};
    if (draft.name.trim() !== subject.name) patch['name'] = draft.name;
    // Only the field that got a value: the server drops the other one itself.
    if (iconUploadId !== null && iconUploadId !== subject.iconUploadId) {
      patch['iconUploadId'] = iconUploadId;
    } else if (icon !== null && icon !== subject.icon) {
      patch['icon'] = icon;
    } else if (icon === null && iconUploadId === null) {
      if (subject.icon !== null) patch['icon'] = null;
      if (subject.iconUploadId !== null) patch['iconUploadId'] = null;
    }
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
          <SubjectIconPicker
            value={draft}
            error={errors['icon'] ?? errors['iconUploadId']}
            onChange={(choice) => setDraft((current) => ({ ...current, ...choice }))}
          />
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
      render: (subject) => <SubjectIcon subject={subject} size="sm" />,
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
