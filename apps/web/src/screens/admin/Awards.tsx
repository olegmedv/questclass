// /admin/awards/:learnerId — «От родителя»: give XP and coins for a reason or a custom title,
// for a day, a subject and optionally a lesson; see what was given and cancel it (a cancelled
// award stays in the list, its amount is taken back by a compensating ledger row).
import {
  awardCreateSchema,
  CUSTOM_REASON,
  CUSTOM_REASON_NAME,
  type AwardDto,
} from '@questclass/shared/rewards/dto';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Grid,
  Inline,
  Modal,
  Notice,
  NumberInput,
  Select,
  Stack,
  Textarea,
  TextInput,
  VisuallyHidden,
  useToast,
  type Column,
} from '@questclass/ui';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { isApiError } from '../../api/client';
import {
  errorText,
  formatDay,
  issuesByField,
  newRequestId,
  todayKey,
} from '../../features/admin/forms';
import { useAdminSubjects, useAdminTasks } from '../../features/admin-tasks/queries';
import { RewardsNav } from '../../features/admin-rewards/RewardsNav';
import {
  useAwards,
  useCancelAward,
  useGrantAward,
  useRewardReasons,
} from '../../features/admin-rewards/queries';
import { LearnerSelect } from '../../features/users/LearnerSelect';
import { useLearners } from '../../features/users/queries';
import { AdminPage } from '../../templates/AdminShell';

interface Draft {
  reason: string;
  title: string;
  date: string;
  subjectKey: string;
  taskId: string;
  xp: number | null;
  coins: number | null;
  note: string;
}

const freshDraft = (): Draft => ({
  reason: CUSTOM_REASON,
  title: '',
  date: todayKey(),
  subjectKey: '',
  taskId: '',
  xp: 0,
  coins: 0,
  note: '',
});

function GrantForm({ learnerId, name }: { learnerId: number; name: string }) {
  const reasons = useRewardReasons();
  const subjects = useAdminSubjects();
  const tasks = useAdminTasks({ status: 'published' });
  const grant = useGrantAward(learnerId);
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [requestId, setRequestId] = useState(newRequestId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const active = (reasons.data ?? []).filter((reason) => !reason.archived);
  const duplicate =
    grant.isError && isApiError(grant.error) && grant.error.code === 'duplicate_award';

  const send = (force: boolean) => {
    const check = awardCreateSchema.safeParse({
      reasonId: draft.reason === CUSTOM_REASON ? CUSTOM_REASON : Number(draft.reason),
      title: draft.title,
      date: draft.date,
      subjectKey: draft.subjectKey === '' ? null : draft.subjectKey,
      taskId: draft.taskId === '' ? null : Number(draft.taskId),
      xp: draft.xp ?? 0,
      coins: draft.coins ?? 0,
      ...(draft.note.trim() !== '' && { note: draft.note }),
      requestId,
      ...(force && { force: true }),
    });
    if (!check.success) {
      setErrors(issuesByField(check.error.issues));
      return;
    }
    setErrors({});
    grant.mutate(check.data, {
      onSuccess: (award) => {
        toast.show(`${name}: +${award.xp} XP, +${award.coins} монет`, { tone: 'success' });
        setDraft(freshDraft());
        setRequestId(newRequestId());
      },
    });
  };

  return (
    <Card title="Начислить">
      <form
        noValidate
        aria-label="Начислить"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          send(false);
        }}
      >
        <Stack gap="md">
          <Field label="За что">
            <Select
              options={[
                ...active.map((reason) => ({
                  value: String(reason.id),
                  label: `${reason.name} · +${reason.xp} XP · +${reason.coins} монет`,
                })),
                { value: CUSTOM_REASON, label: CUSTOM_REASON_NAME },
              ]}
              value={draft.reason}
              onChange={(event) => {
                const value = event.currentTarget.value;
                const reason = active.find((item) => String(item.id) === value);
                setDraft((current) => ({
                  ...current,
                  reason: value,
                  ...(reason && { title: reason.name, xp: reason.xp, coins: reason.coins }),
                }));
              }}
            />
          </Field>
          <Field
            label="Название"
            required
            hint="Так награда видна ученику в «Моих наградах»."
            error={errors['title']}
          >
            <TextInput
              value={draft.title}
              maxLength={150}
              onChange={(event) => set('title', event.currentTarget.value)}
            />
          </Field>
          <Grid min="sm" gap="md">
            <Field label="XP" hint="От 0 до 1000." error={errors['xp'] ?? errors['']}>
              <NumberInput
                value={draft.xp}
                min={0}
                max={1000}
                onChange={(value) => set('xp', value)}
              />
            </Field>
            <Field label="Монеты" hint="От 0 до 1000." error={errors['coins']}>
              <NumberInput
                value={draft.coins}
                min={0}
                max={1000}
                onChange={(value) => set('coins', value)}
              />
            </Field>
          </Grid>
          <Grid min="sm" gap="md">
            <Field label="День" error={errors['date']}>
              <TextInput
                type="date"
                value={draft.date}
                onChange={(event) => set('date', event.currentTarget.value)}
              />
            </Field>
            <Field label="Предмет" error={errors['subjectKey']}>
              <Select
                options={[
                  { value: '', label: 'Без предмета' },
                  ...(subjects.data ?? [])
                    .filter((subject) => !subject.archived)
                    .map((subject) => ({ value: subject.key, label: subject.name })),
                ]}
                value={draft.subjectKey}
                onChange={(event) => set('subjectKey', event.currentTarget.value)}
              />
            </Field>
          </Grid>
          <Field label="Урок" hint="Необязательно: за какой урок награда.">
            <Select
              options={[
                { value: '', label: 'Без урока' },
                ...(tasks.data ?? []).map((task) => ({
                  value: String(task.id),
                  label: task.title,
                })),
              ]}
              value={draft.taskId}
              onChange={(event) => set('taskId', event.currentTarget.value)}
            />
          </Field>
          <Field label="Заметка" hint="Для вас; ученик её не видит.">
            <Textarea
              rows={2}
              maxLength={500}
              value={draft.note}
              onChange={(event) => set('note', event.currentTarget.value)}
            />
          </Field>
          {duplicate ? (
            <Notice
              tone="warning"
              action={
                <Button size="sm" onClick={() => send(true)} loading={grant.isPending}>
                  Начислить ещё раз
                </Button>
              }
            >
              {errorText(grant.error)}
            </Notice>
          ) : (
            grant.isError && <Notice tone="danger">{errorText(grant.error)}</Notice>
          )}
          <Inline>
            <Button type="submit" variant="primary" loading={grant.isPending}>
              Начислить
            </Button>
          </Inline>
        </Stack>
      </form>
    </Card>
  );
}

function AwardList({ learnerId }: { learnerId: number }) {
  const awards = useAwards(learnerId);
  const cancel = useCancelAward(learnerId);
  const toast = useToast();
  const [toCancel, setToCancel] = useState<AwardDto | null>(null);
  const rows = awards.data?.pages.flatMap((page) => page.items) ?? [];
  const columns: Column<AwardDto>[] = [
    { key: 'date', header: 'День', render: (award) => formatDay(award.date) },
    {
      key: 'title',
      header: 'Награда',
      render: (award) => (
        <Stack gap="xs">
          <span>{award.title}</span>
          <VisuallyHidden>, </VisuallyHidden>
          <span>
            {award.reasonName} · {award.subjectName}
          </span>
        </Stack>
      ),
    },
    {
      key: 'amount',
      header: 'Сколько',
      render: (award) => `+${award.xp} XP, +${award.coins} монет`,
    },
    {
      key: 'actions',
      header: <VisuallyHidden>Отмена</VisuallyHidden>,
      align: 'end',
      render: (award) =>
        award.cancelledAt ? (
          <Badge>Отменено</Badge>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Отменить: ${award.title}`}
            onClick={() => setToCancel(award)}
          >
            Отменить
          </Button>
        ),
    },
  ];
  return (
    <Stack gap="md">
      <DataTable
        caption="Выданные награды"
        columns={columns}
        rows={rows}
        rowKey={(award) => award.id}
        loading={awards.isPending}
        error={awards.isError ? errorText(awards.error) : undefined}
        empty="Наград от родителя пока не было"
      />
      {awards.hasNextPage && (
        <Inline>
          <Button loading={awards.isFetchingNextPage} onClick={() => void awards.fetchNextPage()}>
            Показать ещё
          </Button>
        </Inline>
      )}
      <Modal
        open={toCancel !== null}
        onClose={() => setToCancel(null)}
        title={`Отменить «${toCancel?.title ?? ''}»?`}
        description="Награда останется в списке с пометкой «Отменено», XP и монеты спишутся обратно."
        footer={
          <>
            <Button variant="ghost" onClick={() => setToCancel(null)}>
              Не отменять
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() => {
                if (!toCancel) return;
                cancel.mutate(toCancel.id, {
                  onSuccess: () => toast.show('Награда отменена', { tone: 'success' }),
                  onError: (error) => toast.show(errorText(error), { tone: 'error' }),
                  onSettled: () => setToCancel(null),
                });
              }}
            >
              Отменить награду
            </Button>
          </>
        }
      />
    </Stack>
  );
}

export function Awards() {
  const params = useParams();
  const navigate = useNavigate();
  const learners = useLearners();
  const learnerId = params.learnerId ? Number(params.learnerId) : null;
  const learner = learners.data?.find((user) => user.id === learnerId) ?? null;
  const first = learners.data?.find((user) => user.active) ?? learners.data?.[0];
  if (learnerId === null && first) {
    return <Navigate to={`/admin/awards/${first.id}`} replace />;
  }
  return (
    <AdminPage title="Награды" description="Начисления «От родителя» и их отмена.">
      <RewardsNav current="awards" learnerId={learnerId} />
      {learners.isError ? (
        <EmptyState
          tone="error"
          title="Не получилось загрузить учеников"
          description={errorText(learners.error)}
        />
      ) : learners.data?.length === 0 ? (
        <EmptyState
          title="Учеников пока нет"
          description="Добавьте ученика в разделе «Пользователи»."
        />
      ) : (
        <>
          <LearnerSelect
            learners={learners.data ?? []}
            value={learnerId}
            onChange={(id) => void navigate(`/admin/awards/${id}`)}
          />
          {learner ? (
            <>
              <GrantForm key={`grant-${learner.id}`} learnerId={learner.id} name={learner.name} />
              <AwardList key={`list-${learner.id}`} learnerId={learner.id} />
            </>
          ) : learners.data ? (
            <EmptyState title="Такого ученика нет" />
          ) : (
            <Card loading />
          )}
        </>
      )}
    </AdminPage>
  );
}
