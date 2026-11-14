// `/tasks/:id`: loads the task, its subject and the learner's progress of it and hands them to
// the Player of the task's type (task-type registry, CLAUDE.md rule 10).
import { ButtonLink } from '@questclass/ui';
import { useParams } from 'react-router';
import { isApiError } from '../../api/client';
import { StatusScreen } from '../../app/ErrorBoundary';
import { LoadingScreen, QueryErrorView } from '../../app/guards';
import { useLearnerTask, useMyProgress, useSubjects } from '../../features/tasks/queries';
import { taskTypes } from '../../task-types/registry';

function NotFound() {
  return (
    <StatusScreen
      title="Задание не найдено"
      message="Возможно, его ещё не открыли или уже убрали."
      actions={<ButtonLink href="/">К урокам</ButtonLink>}
    />
  );
}

export function TaskScreen() {
  const { id } = useParams();
  const taskId = Number(id);
  const valid = Number.isInteger(taskId) && taskId > 0;
  const task = useLearnerTask(valid ? taskId : 0);
  const subjects = useSubjects();
  const progress = useMyProgress();

  if (!valid) return <NotFound />;
  if (task.isError) {
    return isApiError(task.error) && task.error.status === 404 ? (
      <NotFound />
    ) : (
      <QueryErrorView error={task.error} onRetry={() => void task.refetch()} />
    );
  }
  if (!task.data || (progress.isPending && !progress.isError)) return <LoadingScreen />;
  const subject = subjects.data?.find((s) => s.id === task.data.subjectId) ?? null;
  const item = progress.data?.tasks.find((t) => t.taskId === taskId) ?? null;
  return taskTypes.renderPlayer({ task: task.data, subject, progress: item });
}
