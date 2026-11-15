// /login?as=admin — the parent signs in with login and password.
import {
  AuthFrame,
  Button,
  ButtonLink,
  Field,
  Notice,
  Stack,
  TextInput,
  Users,
} from '@questclass/ui';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { isApiError } from '../../api/client';
import { useAdminLogin } from '../../api/queries/auth';
import { afterLoginPath, AuthBrand, formatWait, useRetryCountdown } from './common';

export function AdminLogin() {
  const login = useAdminLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const countdown = useRetryCountdown();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }
    setError('');
    login.mutate(
      { login: name.trim().toLowerCase(), password },
      {
        onSuccess: (me) =>
          void navigate(afterLoginPath(me.role, location.state), { replace: true }),
        onError: (err) => {
          if (countdown.start(err)) return;
          setPassword('');
          setError(
            isApiError(err) && err.code === 'invalid_credentials'
              ? 'Неверный логин или пароль'
              : err instanceof Error
                ? err.message
                : 'Не получилось войти',
          );
        },
      },
    );
  };

  return (
    <AuthFrame
      brand={<AuthBrand />}
      title="Вход для родителя"
      description="Кабинет: задания, награды, магазин и настройки."
      footer={
        <ButtonLink href="/login" variant="ghost" size="sm" icon={<Users aria-hidden="true" />}>
          К выбору ученика
        </ButtonLink>
      }
    >
      <form noValidate onSubmit={submit}>
        <Stack gap="md">
          {countdown.active ? (
            <Notice tone="warning">
              Слишком много попыток. Попробуйте через {formatWait(countdown.left)}.
            </Notice>
          ) : (
            error && <Notice tone="danger">{error}</Notice>
          )}
          <Field label="Логин">
            <TextInput
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field label="Пароль">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoComplete="current-password"
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            block
            loading={login.isPending}
            disabled={countdown.active}
          >
            Войти
          </Button>
        </Stack>
      </form>
    </AuthFrame>
  );
}
