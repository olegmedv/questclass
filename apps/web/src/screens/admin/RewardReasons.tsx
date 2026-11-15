// /admin/awards/reasons — the shared list of reasons for manual awards (name unique regardless
// of case, XP and coins 0–1000, at least one of them). A reason is archived, never deleted.
import {
  rewardReasonCreateSchema,
  rewardReasonUpdateSchema,
  type RewardReasonDto,
} from '@questclass/shared/rewards/dto';
import {
  Badge,
  Button,
  DataTable,
  Field,
  Grid,
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
} from '@questclass/ui';
import { useId, useState, type FormEvent } from 'react';
import { errorText, issuesByField } from '../../features/admin/forms';
import { RewardsNav } from '../../features/admin-rewards/RewardsNav';
import {
  useCreateReason,
  useRewardReasons,
  useUpdateReason,
} from '../../features/admin-rewards/queries';
import { AdminPage } from '../../templates/AdminShell';

function ReasonDialog({
  reason,
  onClose,
}: {
  reason: RewardReasonDto | null;
  onClose: () => void;
}) {
  const formId = useId();
  const create = useCreateReason();
  const update = useUpdateReason();
  const toast = useToast();
  const mutation = reason ? update : create;
  const [name, setName] = useState(reason?.name ?? '');
  const [xp, setXp] = useState<number | null>(reason?.xp ?? 0);
  const [coins, setCoins] = useState<number | null>(reason?.coins ?? 0);
  const [archived, setArchived] = useState(reason?.archived ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const done = () => {
      toast.show('Причина сохранена', { tone: 'success' });
      onClose();
    };
    if (!reason) {
      const check = rewardReasonCreateSchema.safeParse({ name, xp: xp ?? 0, coins: coins ?? 0 });
      if (!check.success) {
        setErrors(issuesByField(check.error.issues));
        return;
      }
      setErrors({});
      create.mutate(check.data, { onSuccess: done });
      return;
    }
    const patch: Record<string, unknown> = {};
    if (name.trim() !== reason.name) patch['name'] = name;
    if ((xp ?? 0) !== reason.xp) patch['xp'] = xp ?? 0;
    if ((coins ?? 0) !== reason.coins) patch['coins'] = coins ?? 0;
    if (archived !== reason.archived) patch['archived'] = archived;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    const check = rewardReasonUpdateSchema.safeParse(patch);
    if (!check.success) {
      setErrors(issuesByField(check.error.issues));
      return;
    }
    setErrors({});
    update.mutate({ id: reason.id, patch: check.data }, { onSuccess: done });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={reason ? `Причина «${reason.name}»` : 'Новая причина'}
      description="Уже выданные награды сохраняют своё название и сумму."
      footer={
        <>
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
          <Field label="Название" required error={errors['name']}>
            <TextInput
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </Field>
          <Grid min="sm" gap="md">
            <Field label="XP" hint="От 0 до 1000." error={errors['xp'] ?? errors['']}>
              <NumberInput value={xp} min={0} max={1000} onChange={setXp} />
            </Field>
            <Field label="Монеты" hint="От 0 до 1000." error={errors['coins']}>
              <NumberInput value={coins} min={0} max={1000} onChange={setCoins} />
            </Field>
          </Grid>
          {reason && (
            <Switch
              label="В архиве"
              description="Причина не предлагается при начислении; прошлые награды остаются."
              checked={archived}
              onChange={setArchived}
            />
          )}
        </Stack>
      </form>
    </Modal>
  );
}

export function RewardReasons() {
  const reasons = useRewardReasons();
  const [editing, setEditing] = useState<RewardReasonDto | 'new' | null>(null);
  const columns: Column<RewardReasonDto>[] = [
    { key: 'name', header: 'Причина' },
    { key: 'xp', header: 'XP', align: 'end' },
    { key: 'coins', header: 'Монеты', align: 'end' },
    {
      key: 'status',
      header: 'Статус',
      secondary: true,
      render: (reason) =>
        reason.archived ? <Badge>В архиве</Badge> : <Badge tone="success">Активна</Badge>,
    },
    {
      key: 'actions',
      header: <VisuallyHidden>Действия</VisuallyHidden>,
      align: 'end',
      render: (reason) => (
        <Button
          size="sm"
          icon={<Pencil aria-hidden="true" />}
          aria-label={`Изменить: ${reason.name}`}
          onClick={() => setEditing(reason)}
        >
          Изменить
        </Button>
      ),
    },
  ];
  return (
    <AdminPage
      title="Награды"
      description="Причины ручных начислений: из них выбирают при «Начислить»."
      actions={
        <Button
          variant="primary"
          icon={<Plus aria-hidden="true" />}
          onClick={() => setEditing('new')}
        >
          Новая причина
        </Button>
      }
    >
      <RewardsNav current="reasons" />
      <DataTable
        caption="Причины"
        captionHidden
        columns={columns}
        rows={reasons.data ?? []}
        rowKey={(reason) => reason.id}
        loading={reasons.isPending}
        error={reasons.isError ? errorText(reasons.error) : undefined}
        empty="Причин пока нет"
      />
      {editing && (
        <ReasonDialog
          reason={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </AdminPage>
  );
}
