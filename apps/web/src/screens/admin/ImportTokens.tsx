// /admin/settings/import-tokens — tokens of lesson-prep (the import tool on the admin's
// computer). A new token is shown once, right after it is issued; afterwards only its name.
import type { ImportTokenDto, IssuedImportTokenDto } from '@questclass/shared/import/manifest';
import {
  Badge,
  Button,
  Card,
  Copy,
  DataTable,
  Field,
  Modal,
  Notice,
  Plus,
  Stack,
  Text,
  Textarea,
  TextInput,
  VisuallyHidden,
  useToast,
  type Column,
} from '@questclass/ui';
import { useState, type FormEvent } from 'react';
import { errorText, formatDateTime } from '../../features/admin/forms';
import {
  useImportTokens,
  useIssueImportToken,
  useRevokeImportToken,
} from '../../features/imports/queries';
import { SettingsNav } from '../../features/settings/SettingsNav';
import { AdminPage } from '../../templates/AdminShell';

/** The lesson-prep settings file with this server and the token, ready to paste. */
export function lessonPrepConfig(server: string, token: string): string {
  return JSON.stringify({ server, token }, null, 2);
}

function IssuedToken({ issued, onClose }: { issued: IssuedImportTokenDto; onClose: () => void }) {
  const toast = useToast();
  const config = lessonPrepConfig(window.location.origin, issued.token);
  const copy = (text: string, what: string) => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => toast.show(`${what} скопирован`, { tone: 'success' }))
      .catch(() =>
        toast.show('Не получилось скопировать — выделите текст вручную', { tone: 'error' }),
      );
  };
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={false}
      size="lg"
      title={`Токен «${issued.name}»`}
      description="Скопируйте его сейчас: больше он не покажется. Потерянный токен отзовите и выпустите новый."
      footer={
        <Button variant="primary" onClick={onClose}>
          Я сохранил токен
        </Button>
      }
    >
      <Stack gap="md">
        <Field label="Токен">
          <TextInput readOnly value={issued.token} spellCheck={false} />
        </Field>
        <Button icon={<Copy aria-hidden="true" />} onClick={() => copy(issued.token, 'Токен')}>
          Скопировать токен
        </Button>
        <Field
          label="Файл настроек lesson-prep"
          hint="Сохраните как ~/.questclass/lesson-prep.json на компьютере, где готовятся уроки."
        >
          <Textarea readOnly rows={4} value={config} spellCheck={false} />
        </Field>
        <Button icon={<Copy aria-hidden="true" />} onClick={() => copy(config, 'Файл настроек')}>
          Скопировать файл настроек
        </Button>
      </Stack>
    </Modal>
  );
}

export function ImportTokens() {
  const tokens = useImportTokens();
  const issue = useIssueImportToken();
  const revoke = useRevokeImportToken();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [issued, setIssued] = useState<IssuedImportTokenDto | null>(null);
  const [toRevoke, setToRevoke] = useState<ImportTokenDto | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Назовите токен, например по компьютеру, где он хранится');
      return;
    }
    setNameError('');
    issue.mutate(trimmed, {
      onSuccess: (token) => {
        setName('');
        setIssued(token);
      },
    });
  };

  const columns: Column<ImportTokenDto>[] = [
    { key: 'name', header: 'Название' },
    {
      key: 'createdAt',
      header: 'Выпущен',
      secondary: true,
      render: (token) => formatDateTime(token.createdAt),
    },
    {
      key: 'status',
      header: 'Состояние',
      render: (token) =>
        token.revokedAt ? <Badge>Отозван</Badge> : <Badge tone="success">Действует</Badge>,
    },
    {
      key: 'actions',
      header: <VisuallyHidden>Действия</VisuallyHidden>,
      align: 'end',
      render: (token) =>
        token.revokedAt ? null : (
          <Button size="sm" variant="danger" onClick={() => setToRevoke(token)}>
            Отозвать
          </Button>
        ),
    },
  ];

  return (
    <AdminPage
      title="Импорт уроков"
      description="Токены программы lesson-prep: с ними она загружает видео, вопросы и расшифровки."
    >
      <SettingsNav current="/admin/settings/import-tokens" />
      <Card title="Новый токен">
        <form noValidate onSubmit={submit} aria-label="Новый токен">
          <Stack gap="md">
            {issue.isError && <Notice tone="danger">{errorText(issue.error)}</Notice>}
            <Field label="Название" hint="Например, «Ноутбук мамы»" error={nameError}>
              <TextInput
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </Field>
            <Stack gap="sm" align="start">
              <Button
                type="submit"
                variant="primary"
                icon={<Plus aria-hidden="true" />}
                loading={issue.isPending}
              >
                Выпустить токен
              </Button>
              <Text tone="muted" size="sm">
                Токен даёт доступ только к загрузке уроков, не к кабинету.
              </Text>
            </Stack>
          </Stack>
        </form>
      </Card>
      <DataTable
        caption="Токены"
        columns={columns}
        rows={tokens.data ?? []}
        rowKey={(token) => token.id}
        loading={tokens.isPending}
        error={tokens.isError ? errorText(tokens.error) : undefined}
        empty="Токенов пока нет"
      />
      {issued && <IssuedToken issued={issued} onClose={() => setIssued(null)} />}
      <Modal
        open={toRevoke !== null}
        onClose={() => setToRevoke(null)}
        title={`Отозвать «${toRevoke?.name ?? ''}»?`}
        description="lesson-prep с этим токеном больше не сможет загружать уроки."
        footer={
          <>
            <Button variant="ghost" onClick={() => setToRevoke(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              loading={revoke.isPending}
              onClick={() => {
                if (toRevoke) revoke.mutate(toRevoke.id, { onSettled: () => setToRevoke(null) });
              }}
            >
              Отозвать
            </Button>
          </>
        }
      />
    </AdminPage>
  );
}
