// /admin/users — learners and adults of the family. There is no deletion: a user who is no
// longer needed (a test learner, a former admin) is switched off and keeps their history.
import type { UserDto } from '@questclass/shared/auth/dto';
import {
  userCreateRequestSchema,
  userUpdateRequestSchema,
  type UserRole,
} from '@questclass/shared/auth/schemas';
import {
  Badge,
  Button,
  DataTable,
  Field,
  Inline,
  Modal,
  Notice,
  Pencil,
  Plus,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  VisuallyHidden,
  useToast,
  type Column,
} from '@questclass/ui';
import { useId, useState, type FormEvent } from 'react';
import { useMe } from '../../api/queries/auth';
import { errorText, issuesByField } from '../../features/admin/forms';
import { ROLE_LABEL, useCreateUser, useUpdateUser, useUsers } from '../../features/users/queries';
import { AdminPage } from '../../templates/AdminShell';

interface Draft {
  role: UserRole;
  name: string;
  login: string;
  password: string;
  pin: string;
  active: boolean;
}

const emptyDraft: Draft = {
  role: 'learner',
  name: '',
  login: '',
  password: '',
  pin: '',
  active: true,
};

function draftOf(user: UserDto): Draft {
  return {
    ...emptyDraft,
    role: user.role,
    name: user.name,
    login: user.login ?? '',
    active: user.active,
  };
}

/** Only what the admin changed; an empty PIN or password field means «leave as is». */
function patchOf(user: UserDto, draft: Draft): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (draft.name.trim() !== user.name) patch['name'] = draft.name;
  if (user.role === 'admin' && draft.login.trim().toLowerCase() !== (user.login ?? '')) {
    patch['login'] = draft.login;
  }
  if (user.role === 'admin' && draft.password !== '') patch['password'] = draft.password;
  if (user.role === 'learner' && draft.pin !== '') patch['pin'] = draft.pin;
  if (draft.active !== user.active) patch['active'] = draft.active;
  return patch;
}

function UserDialog({
  user,
  isSelf,
  onClose,
}: {
  /** null = a new user. */
  user: UserDto | null;
  isSelf: boolean;
  onClose: () => void;
}) {
  const formId = useId();
  const create = useCreateUser();
  const update = useUpdateUser();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(user ? draftOf(user) : emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = user ? update : create;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      const input =
        draft.role === 'admin'
          ? { role: 'admin', name: draft.name, login: draft.login, password: draft.password }
          : { role: 'learner', name: draft.name, pin: draft.pin };
      const check = userCreateRequestSchema.safeParse(input);
      if (!check.success) {
        setErrors(issuesByField(check.error.issues));
        return;
      }
      setErrors({});
      create.mutate(check.data, {
        onSuccess: (created) => {
          toast.show(`${created.name}: добавлен`, { tone: 'success' });
          onClose();
        },
      });
      return;
    }
    const patch = patchOf(user, draft);
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    const check = userUpdateRequestSchema.safeParse(patch);
    if (!check.success) {
      setErrors(issuesByField(check.error.issues));
      return;
    }
    setErrors({});
    update.mutate(
      { id: user.id, patch: check.data },
      {
        onSuccess: (saved) => {
          toast.show(`${saved.name}: сохранено`, { tone: 'success' });
          onClose();
        },
      },
    );
  };

  const role = user?.role ?? draft.role;
  return (
    <Modal
      open
      onClose={onClose}
      title={user ? `Изменить: ${user.name}` : 'Новый пользователь'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={mutation.isPending}>
            {user ? 'Сохранить' : 'Добавить'}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit}>
        <Stack gap="md">
          {mutation.isError && <Notice tone="danger">{errorText(mutation.error)}</Notice>}
          {!user && (
            <SegmentedControl
              label="Кто это"
              options={[
                { value: 'learner', label: 'Ученик' },
                { value: 'admin', label: 'Взрослый' },
              ]}
              value={draft.role}
              onChange={(value) => set('role', value)}
            />
          )}
          <Field label="Имя" required error={errors['name']}>
            <TextInput
              value={draft.name}
              maxLength={40}
              autoComplete="off"
              onChange={(event) => set('name', event.currentTarget.value)}
            />
          </Field>
          {role === 'learner' ? (
            <Field
              label={user ? 'Новый PIN' : 'PIN'}
              required={!user}
              hint={
                user
                  ? `${user.hasPin ? 'Сейчас PIN задан.' : 'Сейчас PIN не задан.'} Оставьте пустым, чтобы не менять. После смены ученик войдёт заново.`
                  : 'От 4 до 8 цифр: с ним ученик входит на детском устройстве.'
              }
              error={errors['pin']}
            >
              <TextInput
                value={draft.pin}
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                onChange={(event) => set('pin', event.currentTarget.value.replace(/\D/g, ''))}
              />
            </Field>
          ) : (
            <>
              <Field label="Логин" required error={errors['login']}>
                <TextInput
                  value={draft.login}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={32}
                  onChange={(event) => set('login', event.currentTarget.value)}
                />
              </Field>
              {isSelf ? (
                <Text tone="muted" size="sm">
                  Свой пароль меняется в разделе «Профиль».
                </Text>
              ) : (
                <Field
                  label={user ? 'Новый пароль' : 'Пароль'}
                  required={!user}
                  hint={
                    user
                      ? 'Оставьте пустым, чтобы не менять. После смены все входы этого взрослого закроются.'
                      : 'Не короче 8 символов.'
                  }
                  error={errors['password']}
                >
                  <TextInput
                    type="password"
                    autoComplete="new-password"
                    value={draft.password}
                    onChange={(event) => set('password', event.currentTarget.value)}
                  />
                </Field>
              )}
            </>
          )}
          {user && !isSelf && (
            <Switch
              label="Может входить"
              description="Выключенный пользователь не входит и не виден на детском устройстве; его история остаётся."
              checked={draft.active}
              onChange={(checked) => set('active', checked)}
            />
          )}
          {errors[''] && <Notice tone="danger">{errors['']}</Notice>}
        </Stack>
      </form>
    </Modal>
  );
}

export function Users() {
  const me = useMe();
  const users = useUsers();
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<UserDto | 'new' | null>(null);
  const rows = (users.data ?? []).filter((user) => showInactive || user.active);
  const inactiveCount = (users.data ?? []).filter((user) => !user.active).length;

  const columns: Column<UserDto>[] = [
    {
      key: 'name',
      header: 'Имя',
      render: (user) => (user.id === me.data?.id ? `${user.name} (вы)` : user.name),
    },
    { key: 'role', header: 'Роль', render: (user) => ROLE_LABEL[user.role] },
    {
      key: 'access',
      header: 'Вход',
      secondary: true,
      render: (user) =>
        user.role === 'admin' ? (user.login ?? '—') : user.hasPin ? 'PIN задан' : 'Нет PIN',
    },
    {
      key: 'status',
      header: 'Статус',
      render: (user) =>
        user.active ? <Badge tone="success">Активен</Badge> : <Badge>Отключён</Badge>,
    },
    {
      key: 'actions',
      header: <VisuallyHidden>Действия</VisuallyHidden>,
      align: 'end',
      render: (user) => (
        <Button
          size="sm"
          icon={<Pencil aria-hidden="true" />}
          aria-label={`Изменить: ${user.name}`}
          onClick={() => setEditing(user)}
        >
          Изменить
        </Button>
      ),
    },
  ];

  return (
    <AdminPage
      title="Пользователи"
      description="Ученики и взрослые. Удаления нет — только отключение: история остаётся."
      actions={
        <Button
          variant="primary"
          icon={<Plus aria-hidden="true" />}
          onClick={() => setEditing('new')}
        >
          Добавить
        </Button>
      }
    >
      <Inline>
        <Switch
          label={`Показать отключённых (${inactiveCount})`}
          checked={showInactive}
          onChange={setShowInactive}
        />
      </Inline>
      <DataTable
        caption="Пользователи"
        captionHidden
        columns={columns}
        rows={rows}
        rowKey={(user) => user.id}
        loading={users.isPending}
        error={users.isError ? errorText(users.error) : undefined}
        empty="Пользователей пока нет"
      />
      {editing && (
        <UserDialog
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === me.data?.id}
          onClose={() => setEditing(null)}
        />
      )}
    </AdminPage>
  );
}
