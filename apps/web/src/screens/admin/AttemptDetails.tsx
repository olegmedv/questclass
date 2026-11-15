// /admin/attempts/:id — one attempt as it was: the questions of its snapshot in the order the
// learner saw them, the learner's answers, the correct options and the result.
import type { AdminAttemptDto, AttemptStatus } from '@questclass/shared/attempts/dto';
import {
  AnswerReview,
  ArrowLeft,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Inline,
  Stack,
  Text,
  type BadgeTone,
  type ReviewItem,
} from '@questclass/ui';
import { useParams } from 'react-router';
import { errorText, formatDateTime } from '../../features/admin/forms';
import { useAdminAttempt } from '../../features/admin-progress/queries';
import { useAdminTask } from '../../features/admin-tasks/queries';
import { OPTION_LETTER } from '../../features/questions/QuestionView';
import { useUsers } from '../../features/users/queries';
import { AdminPage } from '../../templates/AdminShell';

const STATUS: Readonly<Record<AttemptStatus, { label: string; tone: BadgeTone }>> = {
  in_progress: { label: 'Идёт', tone: 'info' },
  finished: { label: 'Завершена', tone: 'neutral' },
  abandoned: { label: 'Брошена при сбросе', tone: 'neutral' },
};

/** The snapshot as review items: «Б) Солнце» for the answer and the correct option. */
export function reviewItems(attempt: AdminAttemptDto): ReviewItem[] {
  return attempt.questions.map((question) => {
    const option = (id: string | null | undefined) => {
      const found = question.options.find((item) => item.id === id);
      return found ? { text: `${OPTION_LETTER[found.id]}) ${found.text}` } : null;
    };
    return {
      id: String(question.id),
      question: `${question.position}. ${question.text}`,
      answer: option(question.answer),
      correct: option(question.correct) ?? { text: '—' },
      isCorrect: question.isCorrect ?? false,
    };
  });
}

function Details({ attempt }: { attempt: AdminAttemptDto }) {
  const task = useAdminTask(attempt.taskId);
  const users = useUsers();
  const learner = users.data?.find((user) => user.id === attempt.learnerId);
  const status = STATUS[attempt.status];
  const result = attempt.result;
  return (
    <AdminPage
      title={`Попытка: ${task.data?.title ?? `задание № ${attempt.taskId}`}`}
      description={`${learner?.name ?? `Ученик № ${attempt.learnerId}`} · начата ${formatDateTime(attempt.startedAt)}`}
      actions={
        <ButtonLink
          href={`/admin/progress/${attempt.learnerId}`}
          variant="ghost"
          icon={<ArrowLeft aria-hidden="true" />}
        >
          Прогресс ученика
        </ButtonLink>
      }
    >
      <Card title="Итог" actions={<Badge tone={status.tone}>{status.label}</Badge>}>
        <Stack gap="sm">
          {result ? (
            <Inline gap="sm">
              <Text weight="bold">
                Верно {result.correct} из {result.total}
              </Text>
              {result.passed ? (
                <Badge tone="success">зачёт</Badge>
              ) : (
                <Badge tone="danger">не зачёт</Badge>
              )}
              <Text tone="muted">
                Награда: +{result.reward.xp} XP, +{result.reward.coins} монет
                {result.streakReward.xp > 0 || result.streakReward.coins > 0
                  ? `; за серию +${result.streakReward.xp} XP, +${result.streakReward.coins} монет`
                  : ''}
              </Text>
            </Inline>
          ) : (
            <Text tone="muted">
              Ученик ещё отвечает: ответов {attempt.questions.filter((q) => q.answer).length} из{' '}
              {attempt.questions.length}.
            </Text>
          )}
          {attempt.finishedAt && (
            <Text tone="muted" size="sm">
              Завершена {formatDateTime(attempt.finishedAt)}
              {attempt.retryGrantId !== null ? ' · по вашему разрешению на пересдачу' : ''}
            </Text>
          )}
        </Stack>
      </Card>
      <AnswerReview title="Вопросы и ответы" items={reviewItems(attempt)} />
    </AdminPage>
  );
}

export function AttemptDetails() {
  const id = Number(useParams().id);
  const attempt = useAdminAttempt(id);
  if (attempt.isPending) {
    return (
      <AdminPage title="Попытка">
        <Card loading />
      </AdminPage>
    );
  }
  if (attempt.isError) {
    return (
      <AdminPage title="Попытка">
        <EmptyState
          tone="error"
          title="Не получилось загрузить"
          description={errorText(attempt.error)}
        />
      </AdminPage>
    );
  }
  return <Details attempt={attempt.data} />;
}
