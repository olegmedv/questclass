// The learner types the PIN on a trusted device.
import type { ProfileDto } from '@questclass/shared/auth/dto';
import { ArrowLeft, AuthFrame, Avatar, Button, PinPad, Stack, Text } from '@questclass/ui';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { isApiError } from '../../api/client';
import { useLearnerLogin } from '../../api/queries/auth';
import { afterLoginPath, AuthBrand, formatWait, useRetryCountdown } from './common';

export interface PinEntryProps {
  readonly profile: ProfileDto;
  readonly onBack: () => void;
}

function messageOf(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === 'invalid_pin') return 'Неверный PIN. Попробуй ещё раз.';
    if (error.code === 'device_not_trusted') {
      return 'Это устройство больше не детское. Попроси родителя включить его снова.';
    }
    if (error.status === 404) return 'Такого ученика больше нет. Выбери другого.';
    return error.message;
  }
  return 'Не получилось войти';
}

export function PinEntry({ profile, onBack }: PinEntryProps) {
  const login = useLearnerLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const countdown = useRetryCountdown();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const submit = (value: string) => {
    setError('');
    login.mutate(
      { userId: profile.id, pin: value },
      {
        onSuccess: (me) =>
          void navigate(afterLoginPath(me.role, location.state), { replace: true }),
        onError: (err) => {
          setPin('');
          if (!countdown.start(err)) setError(messageOf(err));
        },
      },
    );
  };

  const shownError = countdown.active
    ? `Слишком много попыток. Подожди ${formatWait(countdown.left)}.`
    : error;

  return (
    <AuthFrame
      brand={<AuthBrand />}
      title={`Привет, ${profile.name}!`}
      description="Введи свой PIN."
      footer={
        <Button variant="ghost" size="sm" icon={<ArrowLeft aria-hidden="true" />} onClick={onBack}>
          Другой ученик
        </Button>
      }
    >
      <Stack gap="md" align="center">
        <Avatar name={profile.name} src={profile.avatar} size="xl" />
        <Text tone="muted" size="sm">
          PIN — от 4 до 8 цифр
        </Text>
        <PinPad
          label={`PIN ученика ${profile.name}`}
          value={pin}
          onChange={setPin}
          onSubmit={submit}
          loading={login.isPending}
          disabled={countdown.active}
          error={shownError}
        />
      </Stack>
    </AuthFrame>
  );
}
