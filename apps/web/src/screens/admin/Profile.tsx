// /admin/profile — the signed-in admin: who they are and the change of their own password. The
// current password is asked again; other signed-in browsers of this admin are signed out.
import { passwordChangeRequestSchema } from '@questclass/shared/auth/schemas';
import {
  Button,
  Card,
  Field,
  Inline,
  Notice,
  Stack,
  Text,
  TextInput,
  useToast,
} from '@questclass/ui';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, isApiError } from '../../api/client';
import { useMe } from '../../api/queries/auth';
import { errorText, issuesByField } from '../../features/admin/forms';
import { AdminPage } from '../../templates/AdminShell';

interface Draft {
  current: string;
  next: string;
  repeat: string;
}

const emptyDraft: Draft = { current: '', next: '', repeat: '' };

function useChangePassword() {
  return useMutation({
    mutationFn: (input: { current: string; next: string }) =>
      api<undefined>('/api/me/password', { method: 'PUT', json: input }),
  });
}

/** Where a refusal of the server belongs: a field, or the whole form. */
function serverErrors(error: unknown): Record<string, string> {
  if (!isApiError(error)) return { '': errorText(error) };
  if (error.code === 'invalid_password') return { current: error.message };
  if (error.code === 'same_password') return { next: error.message };
  if (error.status === 429) {
    const wait = error.retryAfterSec;
    return {
      '': wait ? `${error.message}: через ${Math.ceil(wait / 60)} мин.` : error.message,
    };
  }
  return { '': errorText(error) };
}

export function Profile() {
  const me = useMe();
  const change = useChangePassword();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof Draft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const check = passwordChangeRequestSchema.safeParse({
      current: draft.current,
      next: draft.next,
    });
    const found = check.success ? {} : issuesByField(check.error.issues);
    if (draft.repeat !== draft.next) found['repeat'] = 'Пароли не совпадают';
    setErrors(found);
    if (!check.success || Object.keys(found).length > 0) return;
    change.mutate(check.data, {
      onSuccess: () => {
        setDraft(emptyDraft);
        toast.show('Пароль изменён. Входы на других устройствах закрыты.', { tone: 'success' });
      },
      onError: (error) => setErrors(serverErrors(error)),
    });
  };

  return (
    <AdminPage title="Профиль" description="Ваш вход в кабинет родителя.">
      <Card title={me.data?.name ?? ''} description="Имя и логин меняются в «Пользователях».">
        <Text tone="muted">Роль: взрослый (кабинет родителя).</Text>
      </Card>
      <Card title="Сменить пароль">
        <form noValidate onSubmit={submit} aria-label="Сменить пароль">
          <Stack gap="md">
            {errors[''] && <Notice tone="danger">{errors['']}</Notice>}
            <Field label="Текущий пароль" required error={errors['current']}>
              <TextInput
                type="password"
                autoComplete="current-password"
                value={draft.current}
                onChange={(event) => set('current', event.currentTarget.value)}
              />
            </Field>
            <Field
              label="Новый пароль"
              required
              hint="Не короче 8 символов."
              error={errors['next']}
            >
              <TextInput
                type="password"
                autoComplete="new-password"
                value={draft.next}
                onChange={(event) => set('next', event.currentTarget.value)}
              />
            </Field>
            <Field label="Новый пароль ещё раз" required error={errors['repeat']}>
              <TextInput
                type="password"
                autoComplete="new-password"
                value={draft.repeat}
                onChange={(event) => set('repeat', event.currentTarget.value)}
              />
            </Field>
            <Text tone="muted" size="sm">
              После смены на других устройствах нужно будет войти заново; здесь вход сохранится.
            </Text>
            <Inline>
              <Button type="submit" variant="primary" loading={change.isPending}>
                Сменить пароль
              </Button>
            </Inline>
          </Stack>
        </form>
      </Card>
    </AdminPage>
  );
}
