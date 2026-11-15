// /admin/device — «Сделать устройство детским»: the profile picker and PIN login work only on
// such a device. The list shows every trusted device; a device can be revoked.
import type { DeviceDto } from '@questclass/shared/auth/dto';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  Modal,
  Notice,
  Stack,
  Text,
  TextInput,
  VisuallyHidden,
  type Column,
} from '@questclass/ui';
import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { useDevices, useRevokeDevice, useTrustDevice } from '../../api/queries/auth';
import { AdminPage } from '../../templates/AdminShell';
import type { SetupWelcomeState } from './Setup';

const DATE = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

function status(device: DeviceDto) {
  if (device.revokedAt) return <Badge>Отозвано</Badge>;
  return device.isCurrent ? (
    <Badge tone="success">Это устройство</Badge>
  ) : (
    <Badge tone="info">Детское</Badge>
  );
}

export function TrustDevice() {
  const location = useLocation();
  const welcome = (location.state as SetupWelcomeState | null)?.welcome === true;
  const devices = useDevices();
  const trust = useTrustDevice();
  const revoke = useRevokeDevice();
  const [name, setName] = useState('Детский планшет');
  const [nameError, setNameError] = useState('');
  const [toRevoke, setToRevoke] = useState<DeviceDto | null>(null);

  const current = devices.data?.find((device) => device.isCurrent && !device.revokedAt) ?? null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Назовите устройство, чтобы потом его узнать');
      return;
    }
    setNameError('');
    trust.mutate(trimmed);
  };

  const columns: Column<DeviceDto>[] = [
    { key: 'name', header: 'Название' },
    {
      key: 'createdAt',
      header: 'Добавлено',
      secondary: true,
      render: (device) => DATE.format(new Date(device.createdAt)),
    },
    { key: 'status', header: 'Состояние', render: status },
    {
      key: 'actions',
      header: <VisuallyHidden>Действия</VisuallyHidden>,
      align: 'end',
      render: (device) =>
        device.revokedAt ? null : (
          <Button size="sm" variant="danger" onClick={() => setToRevoke(device)}>
            Отозвать
          </Button>
        ),
    },
  ];

  return (
    <AdminPage
      title="Устройства"
      description="На детском устройстве ученики выбирают себя и входят по PIN, без пароля родителя."
    >
      {welcome && (
        <Notice tone="success">
          Учётная запись создана. Если ребёнок будет заниматься на этом устройстве, сделайте его
          детским.
        </Notice>
      )}
      <Card title="Это устройство">
        {current ? (
          <Stack gap="sm">
            <Notice tone="success">
              Это устройство — детское («{current.name}»). После выхода здесь откроется выбор
              ученика.
            </Notice>
          </Stack>
        ) : (
          <form noValidate onSubmit={submit}>
            <Stack gap="md">
              <Text tone="muted">
                Сейчас это устройство обычное: чтобы войти, нужен пароль родителя.
              </Text>
              {trust.isError && <Notice tone="danger">{trust.error.message}</Notice>}
              <Field label="Название устройства" hint="Например, «Планшет Саши»" error={nameError}>
                <TextInput
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  maxLength={60}
                />
              </Field>
              <Button type="submit" variant="primary" loading={trust.isPending}>
                Сделать устройство детским
              </Button>
            </Stack>
          </form>
        )}
      </Card>
      <DataTable
        caption="Детские устройства"
        columns={columns}
        rows={devices.data ?? []}
        rowKey={(device) => device.id}
        loading={devices.isPending}
        error={devices.isError ? devices.error.message : undefined}
        empty="Детских устройств пока нет"
      />
      <Modal
        open={toRevoke !== null}
        onClose={() => setToRevoke(null)}
        title={`Отозвать «${toRevoke?.name ?? ''}»?`}
        description="На нём больше нельзя будет войти по PIN; открытые там сессии учеников закроются."
        footer={
          <>
            <Button variant="ghost" onClick={() => setToRevoke(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              loading={revoke.isPending}
              onClick={() => {
                if (toRevoke) {
                  revoke.mutate(toRevoke.id, { onSettled: () => setToRevoke(null) });
                }
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
