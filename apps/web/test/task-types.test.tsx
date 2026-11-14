// @vitest-environment jsdom
// FEAT-024: the web registry of task types renders Players/Editors, unknown types fail clearly.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createTaskTypeRegistry,
  taskTypes,
  type TaskEditorProps,
  type TaskPlayerProps,
  type WebTaskType,
} from '../src/task-types/registry';

const demo: WebTaskType = {
  type: 'demo',
  label: 'Демо',
  Player: ({ task }: TaskPlayerProps) => <p>Игрок: {task.title}</p>,
  Editor: ({ disabled }: TaskEditorProps) => <p>Редактор{disabled ? ' (только чтение)' : ''}</p>,
};

const task = { id: 1, type: 'demo', title: 'Сложение', config: {} };

describe('task-type registry', () => {
  it('renders the Player of a registered type', () => {
    const registry = createTaskTypeRegistry([demo]);
    render(registry.renderPlayer({ task }));
    expect(screen.getByText('Игрок: Сложение')).toBeInTheDocument();
  });

  it('renders the Editor of a registered type', () => {
    const registry = createTaskTypeRegistry([demo]);
    render(registry.renderEditor('demo', { config: {}, onChange: () => {}, disabled: true }));
    expect(screen.getByText('Редактор (только чтение)')).toBeInTheDocument();
  });

  it('an unknown type renders an understandable error instead of crashing', () => {
    render(taskTypes.renderPlayer({ task: { ...task, type: 'hologram' } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Неизвестный тип задания «hologram»');
  });

  it('an unknown type in the editor renders the same error', () => {
    const registry = createTaskTypeRegistry([demo]);
    render(registry.renderEditor('hologram', { config: {}, onChange: () => {} }));
    expect(screen.getByRole('alert')).toHaveTextContent('«hologram»');
  });

  it('a type cannot be registered twice', () => {
    expect(() => createTaskTypeRegistry([demo, demo])).toThrow(/registered twice: demo/);
  });
});
