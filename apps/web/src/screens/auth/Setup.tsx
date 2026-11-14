// /setup — the very first start: the one-time setup token from the server log creates the first
// admin, who is signed in right away.
import { AuthFrame, Button, ButtonLink, Field, Notice, Stack, TextInput } from '@questclass/ui';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { isApiError } from '../../api/client';
import { useSetup, useSetupStatus } from '../../api/queries/auth';
import { AuthBrand, fieldErrorsOf, formatWait, useRetryCountdown } from './common';

const LOGIN_RULE = /^[a-z0-9._-]{3,32}$/;

export interface SetupWelcomeState {
  readonly welcome: true;
}

export function Setup() {
  const status = useSetupStatus();
  const setup = useSetup();
  const navigate = useNavigate();
  const countdown = useRetryCountdown();
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<'already' | 'other' | null>(null);
  const [message, setMessage] = useState('');

  // Already set up (and not by this form a moment ago): the parent logs in instead.
  const alreadyDone = status.data?.needed === false && !setup.isPending && !setup.isSuccess;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalizedLogin = login.trim().toLowerCase();
    const found: Record<string, string> = {};
    if (!token.trim()) found['token'] = 'Введите код установки';
    if (!LOGIN_RULE.test(normalizedLogin)) {
      found['login'] = 'Логин: 3–32 символа, латиница, цифры, точка, дефис';
    }
    if (password.length < 8) found['password'] = 'Пароль не короче 8 символов';
    setErrors(found);
    setProblem(null);
    if (Object.keys(found).length > 0) return;
    setup.mutate(
      {
        token: token.trim(),
        login: normalizedLogin,
        password,
        ...(name.trim() && { name: name.trim() }),
      },
      {
        onSuccess: () => {
          const state: SetupWelcomeState = { welcome: true };
          void navigate('/admin/device', { replace: true, state });
        },
        onError: (error) => {
          if (countdown.start(error)) return;
          if (isApiError(error) && error.code === 'invalid_setup_token') {
            setErrors({ token: 'Код не подходит. Скопируйте его из журнала сервера целиком.' });
          } else if (isApiError(error) && error.code === 'already_set_up') {
            setProblem('already');
          } else if (isApiError(error) && error.status === 400) {
            setErrors(fieldErrorsOf(error));
          } else {
            setProblem('other');
            setMessage(error instanceof Error ? error.message : 'Не получилось');
          }
        },
      },
    );
  };

  if (alreadyDone) return <Navigate to="/login?as=admin" replace />;

  return (
    <AuthFrame
      brand={<AuthBrand />}
      title="Первый запуск"
      description="Создайте учётную запись родителя. Код установки сервер печатает в журнал при запуске."
    >
      <form noValidate onSubmit={submit}>
        <Stack gap="md">
          {countdown.active && (
            <Notice tone="warning">
              Слишком много попыток. Попробуйте через {formatWait(countdown.left)}.
            </Notice>
          )}
          {problem === 'already' && (
            <Notice
              tone="warning"
              action={
                <ButtonLink href="/login?as=admin" size="sm">
                  Войти
                </ButtonLink>
              }
            >
              Первый админ уже создан.
            </Notice>
          )}
          {problem === 'other' && <Notice tone="danger">{message}</Notice>}
          <Field
            label="Код установки"
            hint="Строка после «One-time setup token:» в журнале контейнера"
            error={errors['token']}
            required
          >
            <TextInput
              value={token}
              onChange={(e) => setToken(e.currentTarget.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Как к вам обращаться" hint="Например, Мама" error={errors['name']}>
            <TextInput
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              autoComplete="name"
            />
          </Field>
          <Field
            label="Логин"
            hint="Латиница, цифры, точка и дефис"
            error={errors['login']}
            required
          >
            <TextInput
              value={login}
              onChange={(e) => setLogin(e.currentTarget.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field label="Пароль" hint="Не короче 8 символов" error={errors['password']} required>
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoComplete="new-password"
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            block
            loading={setup.isPending}
            disabled={countdown.active}
          >
            Создать и войти
          </Button>
        </Stack>
      </form>
    </AuthFrame>
  );
}
