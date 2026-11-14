// /admin/settings/secrets — API keys and tokens. Write-only: the page shows whether a key is set
// and when it changed; a value is typed in anew and never comes back from the server.
import { SECRETS } from '@questclass/shared/settings/registry';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Inline,
  KeyRound,
  Modal,
  Notice,
  Stack,
  Text,
  TextInput,
  useToast,
} from '@questclass/ui';
import { useState, type FormEvent } from 'react';
import { errorText, formatDateTime } from '../../features/admin/forms';
import { SettingsNav } from '../../features/settings/SettingsNav';
import {
  useClearSecret,
  useSecrets,
  useSetSecret,
  type SecretStatusDto,
} from '../../features/settings/queries';
import { AdminPage } from '../../templates/AdminShell';

function SecretCard({ status }: { status: SecretStatusDto }) {
  const def = SECRETS[status.key];
  const setSecret = useSetSecret();
  const clear = useClearSecret();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const label = def?.label ?? status.key;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() === '') {
      setError('Введите новое значение');
      return;
    }
    setError('');
    setSecret.mutate(
      { key: status.key, value: value.trim() },
      {
        onSuccess: () => {
          setValue('');
          toast.show(`«${label}» сохранён`, { tone: 'success' });
        },
      },
    );
  };

  return (
    <Card
      title={label}
      description={def?.description}
      actions={
        status.isSet ? <Badge tone="success">Задан</Badge> : <Badge tone="warning">Не задан</Badge>
      }
    >
      <form noValidate onSubmit={submit} aria-label={label}>
        <Stack gap="sm">
          {status.isSet && (
            <Text tone="muted" size="sm">
              Изменён {formatDateTime(status.updatedAt)}. Значение не показывается — его можно
              только ввести заново.
            </Text>
          )}
          {setSecret.isError && <Notice tone="danger">{errorText(setSecret.error)}</Notice>}
          <Field label={status.isSet ? 'Новое значение' : 'Значение'} error={error}>
            <TextInput
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(event) => setValue(event.currentTarget.value)}
            />
          </Field>
          <Inline>
            <Button type="submit" variant="primary" loading={setSecret.isPending}>
              Сохранить
            </Button>
            {status.isSet && (
              <Button variant="danger" onClick={() => setConfirmClear(true)}>
                Удалить
              </Button>
            )}
          </Inline>
        </Stack>
      </form>
      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title={`Удалить «${label}»?`}
        description="То, что пользуется этим ключом, перестанет работать, пока его не введут снова."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              loading={clear.isPending}
              onClick={() =>
                clear.mutate(status.key, {
                  onSettled: () => setConfirmClear(false),
                  onSuccess: () => toast.show(`«${label}» удалён`, { tone: 'success' }),
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

export function Secrets() {
  const secrets = useSecrets();
  return (
    <AdminPage
      title="Ключи API"
      description="Ключи сервисов и токены ботов хранятся зашифрованными и обратно не показываются."
    >
      <SettingsNav current="/admin/settings/secrets" />
      {secrets.isPending ? (
        <Card loading />
      ) : secrets.isError ? (
        <EmptyState
          tone="error"
          title="Не получилось загрузить ключи"
          description={errorText(secrets.error)}
          actions={<Button onClick={() => void secrets.refetch()}>Повторить</Button>}
        />
      ) : secrets.data.length === 0 ? (
        <EmptyState
          art={<KeyRound aria-hidden="true" />}
          title="Ключей пока нет"
          description="Ключи появятся вместе с функциями, которым они нужны (ИИ, Telegram, почта)."
        />
      ) : (
        <Stack gap="md">
          {secrets.data.map((status) => (
            <SecretCard key={status.key} status={status} />
          ))}
        </Stack>
      )}
    </AdminPage>
  );
}
