// «Подтвердить просмотр» in the learner's progress: the admin counts the lesson's video as
// watched by hand (any watch mode; in `manual` mode it is the only way to open the questions).
import type { WatchProgressDto } from '@questclass/shared/task-types/video_lesson/dto';
import { Button, useToast } from '@questclass/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { errorText } from '../../features/admin/forms';
import { refreshProgress } from '../../features/admin-progress/queries';
import type { TaskProgressActionsProps } from '../registry';

export function ConfirmWatch({ learnerId, progress }: TaskProgressActionsProps) {
  const client = useQueryClient();
  const toast = useToast();
  const confirm = useMutation({
    mutationFn: () =>
      api<WatchProgressDto>(
        `/api/admin/learners/${learnerId}/watch/${progress.taskId}/confirmation`,
        { method: 'POST' },
      ),
    onSuccess: () => refreshProgress(client),
  });
  if (progress.completed) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={confirm.isPending}
      aria-label={`Подтвердить просмотр: ${progress.title}`}
      onClick={() =>
        confirm.mutate(undefined, {
          onSuccess: () => toast.show('Просмотр подтверждён: вопросы открыты', { tone: 'success' }),
          onError: (error) => toast.show(errorText(error), { tone: 'error' }),
        })
      }
    >
      Подтвердить просмотр
    </Button>
  );
}
