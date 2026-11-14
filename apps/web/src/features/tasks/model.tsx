// What the learner's home shows about each task: joined task + progress + subject, the label of
// the call to action, the steps and the status line (spec/01 §2.10). Pure functions, no fetching.
import type { TaskProgressDto } from '@questclass/shared/progress/dto';
import { QUIZ_TYPE } from '@questclass/shared/task-types/quiz/contract';
import { VIDEO_LESSON_TYPE } from '@questclass/shared/task-types/video_lesson/contract';
import type { LearnerTaskDto, SubjectDto } from '@questclass/shared/tasks/dto';
import {
  CircleQuestionMark,
  Flag,
  Gift,
  Play,
  type ActionRowStatus,
  type Step,
  type StepStatus,
} from '@questclass/ui';

export interface LessonView {
  readonly task: LearnerTaskDto;
  readonly progress: TaskProgressDto | null;
  readonly subject: SubjectDto | null;
}

/** Tasks in the order of the progress picture (the server's queue order), with their subjects. */
export function joinLessons(
  tasks: readonly LearnerTaskDto[],
  progress: readonly TaskProgressDto[],
  subjects: readonly SubjectDto[],
): LessonView[] {
  const byId = new Map(tasks.map((task) => [task.id, task] as const));
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject] as const));
  const seen = new Set<number>();
  const views: LessonView[] = [];
  const add = (task: LearnerTaskDto, item: TaskProgressDto | null) => {
    seen.add(task.id);
    views.push({
      task,
      progress: item,
      subject: task.subjectId === null ? null : (subjectById.get(task.subjectId) ?? null),
    });
  };
  for (const item of progress) {
    const task = byId.get(item.taskId);
    if (task) add(task, item);
  }
  for (const task of tasks) {
    if (!seen.has(task.id)) add(task, null);
  }
  return views;
}

export const isCompleted = (view: LessonView): boolean => view.progress?.completed ?? false;
export const isAvailable = (view: LessonView): boolean => view.progress?.available ?? true;

/** Text of the big button on the lesson card. */
export function ctaLabel(view: LessonView): string {
  const state = view.progress?.state ?? 'none';
  if (isCompleted(view)) return 'Посмотреть результат';
  if (view.task.type === VIDEO_LESSON_TYPE) {
    return state === 'none' ? 'Начать урок' : 'Продолжить урок';
  }
  if (view.task.type === QUIZ_TYPE) {
    return state === 'none' ? 'Начать тест' : 'Продолжить тест';
  }
  return 'Открыть задание';
}

/** Steps of the task as icons: ▶ video → ? test → 🎁 reward (the current one is marked). */
export function lessonSteps(view: LessonView): Step[] {
  const done = isCompleted(view);
  const first: StepStatus = done ? 'done' : 'current';
  const rest: StepStatus = done ? 'done' : 'todo';
  const reward: Step = { id: 'reward', label: 'Награда', icon: <Gift />, status: rest };
  if (view.task.type === VIDEO_LESSON_TYPE) {
    return [
      { id: 'video', label: 'Видео', icon: <Play />, status: first },
      { id: 'quiz', label: 'Вопросы', icon: <CircleQuestionMark />, status: rest },
      reward,
    ];
  }
  if (view.task.type === QUIZ_TYPE) {
    return [{ id: 'quiz', label: 'Тест', icon: <CircleQuestionMark />, status: first }, reward];
  }
  return [{ id: 'task', label: 'Задание', icon: <Flag />, status: first }, reward];
}

/** Status of a task in the lesson picker. */
export function lessonStatus(view: LessonView): { status: ActionRowStatus; text: string } {
  if (isCompleted(view)) return { status: 'done', text: 'Выполнено' };
  if (!isAvailable(view)) {
    return {
      status: 'locked',
      text:
        view.progress?.lockReason === 'rotation'
          ? 'Откроется по очереди предметов'
          : 'После предыдущего урока',
    };
  }
  return { status: 'open', text: view.progress?.state === 'started' ? 'Начато' : 'Можно открыть' };
}

/** «Математика · Задание от родителя · Можно открыть». */
export function lessonDescription(view: LessonView): string {
  return [
    view.subject?.name ?? 'Без предмета',
    view.task.assigned ? 'Задание от родителя' : null,
    lessonStatus(view).text,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** «Урок от 12.11.2026» for a lesson with a date (`YYYY-MM-DD`). */
export function lessonDateText(lessonDate: string | null): string | null {
  const match = lessonDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(lessonDate) : null;
  return match ? `Урок от ${match[3]}.${match[2]}.${match[1]}` : null;
}

/** «Саша, начнём?» (or just «Начнём?» without a real name). */
export function greeting(name: string): string {
  const trimmed = name.trim();
  return trimmed && trimmed !== 'Игрок' ? `${trimmed}, начнём?` : 'Начнём?';
}

/** What the home says when there is no next task. */
export function emptyHome(views: readonly LessonView[]): {
  title: string;
  description: string;
} {
  if (views.length === 0) {
    return {
      title: 'Скоро новый урок',
      description: 'Родитель ещё не добавил уроки. Загляни чуть позже!',
    };
  }
  if (views.every(isCompleted)) {
    return {
      title: 'Все уроки пройдены!',
      description: 'Новые уроки появятся позже. Пройденные можно открыть в списке уроков.',
    };
  }
  return {
    title: 'Скоро новый урок',
    description: 'Следующий урок откроется в назначенный день. Можно выбрать другой предмет.',
  };
}

export interface LessonFilter {
  /** `all` or a subject id. */
  readonly subject: 'all' | number;
  /** Only the tasks the parent assigned. */
  readonly mine: boolean;
}

export function filterLessons(views: readonly LessonView[], filter: LessonFilter): LessonView[] {
  return views.filter(
    (view) =>
      (filter.subject === 'all' || view.task.subjectId === filter.subject) &&
      (!filter.mine || view.task.assigned),
  );
}
