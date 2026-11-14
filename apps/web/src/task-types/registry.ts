// Web side of the task-type plugins (CLAUDE.md rule 10): each type contributes a Player for the
// learner and an Editor for the admin. Shared code only ever renders through this registry.
import { createElement, type ComponentType, type ReactElement } from 'react';

/** What a Player gets: the task as the learner sees it (config already passed `publicConfig`). */
export interface TaskPlayerProps {
  readonly task: {
    readonly id: number;
    readonly type: string;
    readonly title: string;
    readonly config: unknown;
  };
}

/** What an Editor gets: the type-specific config of a task and a way to change it. */
export interface TaskEditorProps {
  readonly config: unknown;
  readonly onChange: (config: unknown) => void;
  readonly disabled?: boolean;
}

export interface WebTaskType {
  /** Same key as the type's contract in `@questclass/shared`. */
  readonly type: string;
  /** Label for admin lists and pickers. */
  readonly label: string;
  readonly Player: ComponentType<TaskPlayerProps>;
  readonly Editor: ComponentType<TaskEditorProps>;
}

/** Registered task types. Each type adds its line here (quiz, video_lesson, chore…). */
const TASK_TYPES: readonly WebTaskType[] = [];

export interface TaskTypeRegistry {
  readonly types: readonly WebTaskType[];
  get(type: string): WebTaskType | undefined;
  /** Renders the type's Player, or a clear error when the type is unknown to this build. */
  renderPlayer(props: TaskPlayerProps): ReactElement;
  renderEditor(type: string, props: TaskEditorProps): ReactElement;
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

export function createTaskTypeRegistry(types: readonly WebTaskType[]): TaskTypeRegistry {
  const byType = new Map<string, WebTaskType>();
  for (const entry of types) {
    if (byType.has(entry.type)) {
      throw new Error(`Task type registered twice: ${entry.type}`);
    }
    byType.set(entry.type, entry);
  }
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
      const entry = byType.get(type);
      return entry ? createElement(entry.Editor, props) : createElement(UnknownTaskType, { type });
    },
  };
}

export const taskTypes: TaskTypeRegistry = createTaskTypeRegistry(TASK_TYPES);
