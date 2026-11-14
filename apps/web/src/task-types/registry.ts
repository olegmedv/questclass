// Web side of the task-type plugins (CLAUDE.md rule 10): each type contributes a Player for the
// learner and an Editor for the admin. Shared code only ever renders through this registry.
import type { TaskProgressDto } from '@questclass/shared/progress/dto';
import type { LearnerTaskDto, SubjectDto, TaskDto } from '@questclass/shared/tasks/dto';
import { createElement, type ComponentType, type ReactElement } from 'react';
import { choreAdmin } from './chore/Editor';
import { quizAdmin } from './quiz/Editor';
import { quizTaskType } from './quiz/Player';
import { videoLessonAdmin } from './video_lesson/Editor';
import { videoLessonTaskType } from './video_lesson/Player';

/**
 * What a Player gets: the task as the learner sees it (`GET /api/tasks/:id`, config already
 * passed the type's `publicConfig`), its subject and the learner's progress of it.
 */
export interface TaskPlayerProps {
  readonly task: LearnerTaskDto;
  readonly subject: SubjectDto | null;
  /** Null while the progress picture has no row for the task. */
  readonly progress: TaskProgressDto | null;
}

/** What an Editor gets: the type-specific config of a task and a way to change it. */
export interface TaskEditorProps {
  readonly config: unknown;
  readonly onChange: (config: unknown) => void;
  readonly disabled?: boolean;
}

/** What the admin sections of a type get (question bank, transcript…): the whole task. */
export interface TaskSectionsProps {
  readonly task: TaskDto;
}

/** Type-specific actions on a learner's progress row («Подтвердить просмотр»). */
export interface TaskProgressActionsProps {
  readonly learnerId: number;
  readonly progress: TaskProgressDto;
}

/**
 * The admin half of a type (FEAT-040): the config Editor and the type's own sections of the task
 * page. Registered apart from the Players, so a type can be edited before its Player exists.
 */
export interface TaskTypeAdmin {
  readonly type: string;
  readonly Editor?: ComponentType<TaskEditorProps>;
  readonly Sections?: ComponentType<TaskSectionsProps>;
  readonly ProgressActions?: ComponentType<TaskProgressActionsProps>;
}

export interface WebTaskType {
  /** Same key as the type's contract in `@questclass/shared`. */
  readonly type: string;
  /** Label for admin lists and pickers. */
  readonly label: string;
  readonly Player: ComponentType<TaskPlayerProps>;
  /** The admin's editor of the type's config (arrives with the admin screens, FEAT-040). */
  readonly Editor?: ComponentType<TaskEditorProps>;
}

/** Registered task types. Each type adds its line here (quiz, video_lesson, chore…). */
const TASK_TYPES: readonly WebTaskType[] = [quizTaskType, videoLessonTaskType];

/** Admin editors of the types. Each type adds its line here. */
const TASK_EDITORS: readonly TaskTypeAdmin[] = [quizAdmin, videoLessonAdmin, choreAdmin];

export interface TaskTypeRegistry {
  readonly types: readonly WebTaskType[];
  get(type: string): WebTaskType | undefined;
  /** Renders the type's Player, or a clear error when the type is unknown to this build. */
  renderPlayer(props: TaskPlayerProps): ReactElement;
  renderEditor(type: string, props: TaskEditorProps): ReactElement;
  /** Whether the admin can change the type's config in the task page. */
  hasEditor(type: string): boolean;
  /** The type's own sections of the admin task page, or null. */
  renderSections(props: TaskSectionsProps): ReactElement | null;
  /** The type's own actions on a learner's progress row, or null. */
  renderProgressActions(props: TaskProgressActionsProps): ReactElement | null;
}

/** A type without an editor in this build: its config is set by import or later versions. */
export function NoEditor(): ReactElement {
  return createElement(
    'p',
    { role: 'status', className: 'qc-unknown-task-type' },
    'Настройки этого типа задания пока меняются только импортом.',
  );
}

export function UnknownTaskType({ type }: { type: string }): ReactElement {
  return createElement(
    'div',
    { role: 'alert', className: 'qc-unknown-task-type' },
    createElement('strong', null, `Неизвестный тип задания «${type}»`),
    createElement(
      'p',
      null,
      'Это задание нельзя открыть в этой версии приложения. Обновите страницу или напишите родителю.',
    ),
  );
}

export function createTaskTypeRegistry(
  types: readonly WebTaskType[],
  editors: readonly TaskTypeAdmin[] = [],
): TaskTypeRegistry {
  const byType = new Map<string, WebTaskType>();
  for (const entry of types) {
    if (byType.has(entry.type)) {
      throw new Error(`Task type registered twice: ${entry.type}`);
    }
    byType.set(entry.type, entry);
  }
  const adminOf = new Map<string, TaskTypeAdmin>();
  for (const entry of editors) {
    if (adminOf.has(entry.type)) {
      throw new Error(`Task type editor registered twice: ${entry.type}`);
    }
    adminOf.set(entry.type, entry);
  }
  const editorOf = (type: string) => adminOf.get(type)?.Editor ?? byType.get(type)?.Editor;
  return {
    types,
    get: (type) => byType.get(type),
    renderPlayer(props) {
      const entry = byType.get(props.task.type);
      return entry
        ? createElement(entry.Player, props)
        : createElement(UnknownTaskType, { type: props.task.type });
    },
    renderEditor(type, props) {
      const Editor = editorOf(type);
      if (Editor) return createElement(Editor, props);
      return byType.has(type) || adminOf.has(type)
        ? createElement(NoEditor)
        : createElement(UnknownTaskType, { type });
    },
    hasEditor: (type) => editorOf(type) !== undefined,
    renderSections(props) {
      const Sections = adminOf.get(props.task.type)?.Sections;
      return Sections ? createElement(Sections, props) : null;
    },
    renderProgressActions(props) {
      const Actions = adminOf.get(props.progress.type)?.ProgressActions;
      return Actions ? createElement(Actions, props) : null;
    },
  };
}

export const taskTypes: TaskTypeRegistry = createTaskTypeRegistry(TASK_TYPES, TASK_EDITORS);
