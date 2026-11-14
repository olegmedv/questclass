// «Учёба» — the learner's home (spec/01 §2.10): greeting, the study streak, the counter of the
// parent's tasks, the next lesson with the live hero, and the lesson picker.
import {
  BookOpen,
  Button,
  Card,
  ChevronDown,
  EmptyState,
  Heading,
  LessonCard,
  ProgressBar,
  Stack,
} from '@questclass/ui';
import { useMemo, useState } from 'react';
import { useMe } from '../../api/queries/auth';
import { StreakPanel } from '../../features/streak/StreakPanel';
import { LessonPicker } from '../../features/tasks/LessonPicker';
import { emptyHome, greeting, joinLessons } from '../../features/tasks/model';
import { NextLesson } from '../../features/tasks/NextLesson';
import { useLearnerTasks, useMyProgress, useSubjects } from '../../features/tasks/queries';

export function Home() {
  const me = useMe();
  const progress = useMyProgress();
  const tasks = useLearnerTasks();
  const subjects = useSubjects();
  const [pickerOpen, setPickerOpen] = useState(false);

  const lessons = useMemo(
    () =>
      progress.data && tasks.data && subjects.data
        ? joinLessons(tasks.data, progress.data.tasks, subjects.data)
        : null,
    [progress.data, tasks.data, subjects.data],
  );
  const error = progress.error ?? tasks.error ?? subjects.error;
  const next = lessons?.find((view) => view.task.id === progress.data?.nextTaskId) ?? null;
  const assigned = progress.data && progress.data.assignedTotal > 0 ? progress.data : null;

  let lesson;
  if (error) {
    lesson = (
      <EmptyState
        tone="error"
        title="Не получилось загрузить уроки"
        description={error.message}
        actions={
          <Button
            variant="primary"
            onClick={() => {
              void progress.refetch();
              void tasks.refetch();
              void subjects.refetch();
            }}
          >
            Повторить
          </Button>
        }
      />
    );
  } else if (!lessons) {
    lesson = <LessonCard loading title="" />;
  } else if (next) {
    lesson = <NextLesson lesson={next} />;
  } else {
    const empty = emptyHome(lessons);
    lesson = <EmptyState title={empty.title} description={empty.description} />;
  }

  return (
    <Stack gap="md">
      <Heading level={1} size="lg">
        {greeting(me.data?.name ?? '')}
      </Heading>
      <StreakPanel />
      {assigned && (
        <Card padding="md" aria-label="Задания от родителя">
          <ProgressBar
            label="Задания от родителя"
            showLabel
            value={assigned.assignedDone}
            max={assigned.assignedTotal}
            valueText={`${assigned.assignedDone} из ${assigned.assignedTotal}`}
            tone="success"
          />
        </Card>
      )}
      {lesson}
      {lessons && lessons.length > 0 && subjects.data && (
        <>
          <Button
            block
            icon={<BookOpen aria-hidden="true" />}
            iconAfter={<ChevronDown aria-hidden="true" />}
            onClick={() => setPickerOpen(true)}
          >
            Выбрать предмет или урок
          </Button>
          {pickerOpen && (
            <LessonPicker
              open
              onClose={() => setPickerOpen(false)}
              lessons={lessons}
              subjects={subjects.data}
            />
          )}
        </>
      )}
    </Stack>
  );
}
