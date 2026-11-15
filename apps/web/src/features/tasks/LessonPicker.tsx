// «Выбери урок»: subjects as a grid of tiles and the lessons of the chosen subject with their
// status; locked lessons are shown but cannot be opened (spec/01 §2.10).
import {
  ActionList,
  BookOpen,
  ChoiceTile,
  Grid,
  Modal,
  SegmentedControl,
  Stack,
} from '@questclass/ui';
import type { SubjectDto } from '@questclass/shared/tasks/dto';
import { useState } from 'react';
import {
  filterLessons,
  lessonDescription,
  lessonStatus,
  type LessonFilter,
  type LessonView,
} from './model';
import { SubjectIcon } from './SubjectIcon';

export interface LessonPickerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly lessons: readonly LessonView[];
  readonly subjects: readonly SubjectDto[];
}

type Scope = 'mine' | 'all';

export function LessonPicker({ open, onClose, lessons, subjects }: LessonPickerProps) {
  const assigned = lessons.filter((view) => view.task.assigned).length;
  const [scope, setScope] = useState<Scope>(assigned > 0 ? 'mine' : 'all');
  const [subject, setSubject] = useState<LessonFilter['subject']>('all');
  const mine = assigned > 0 && scope === 'mine';
  const shown = filterLessons(lessons, { subject, mine });
  // Only subjects that have lessons for this learner are offered.
  const withLessons = subjects.filter((s) => lessons.some((view) => view.task.subjectId === s.id));
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Выбери урок"
      description={
        mine ? 'Это уроки, которые выбрал для тебя родитель.' : 'У каждого предмета своя очередь.'
      }
    >
      <Stack gap="lg">
        {assigned > 0 && (
          <SegmentedControl<Scope>
            label="Какие уроки показать"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'mine', label: `Мои задания · ${assigned}` },
              { value: 'all', label: 'Все уроки' },
            ]}
          />
        )}
        <Grid min="md" gap="sm" role="group" aria-label="Предметы">
          <ChoiceTile
            icon={<BookOpen />}
            label="Все предметы"
            selected={subject === 'all'}
            onClick={() => setSubject('all')}
          />
          {withLessons.map((item) => (
            <ChoiceTile
              key={item.id}
              icon={<SubjectIcon subject={item} />}
              label={item.name}
              selected={subject === item.id}
              onClick={() => setSubject(item.id)}
            />
          ))}
        </Grid>
        <ActionList
          label="Уроки"
          empty={
            mine ? 'В этом предмете нет назначенных уроков.' : 'Здесь пока нет открытых уроков.'
          }
          items={shown.map((view) => ({
            id: String(view.task.id),
            title: view.task.title,
            description: lessonDescription(view),
            status: lessonStatus(view).status,
            href: `/tasks/${view.task.id}`,
          }))}
        />
      </Stack>
    </Modal>
  );
}
