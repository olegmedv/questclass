// Tabs, SegmentedControl, Accordion: roles, selection state and keyboard.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Accordion, SegmentedControl, Tabs } from '../src';

function RewardTabs() {
  const [tab, setTab] = useState<'from' | 'tickets' | 'later'>('from');
  return (
    <Tabs
      label="Мои награды"
      value={tab}
      onChange={setTab}
      items={[
        { id: 'from', label: 'От родителя' },
        { id: 'later', label: 'Скоро', disabled: true },
        { id: 'tickets', label: 'Билетики', count: 2 },
      ]}
    >
      <p>Панель: {tab}</p>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('has a named tablist and a panel labelled by the selected tab', () => {
    render(<RewardTabs />);
    expect(screen.getByRole('tablist', { name: 'Мои награды' })).toBeInTheDocument();
    const selected = screen.getByRole('tab', { selected: true });
    expect(selected).toHaveTextContent('От родителя');
    expect(screen.getByRole('tabpanel', { name: 'От родителя' })).toHaveTextContent('Панель: from');
  });

  it('arrow keys move the selection and skip disabled tabs', async () => {
    render(<RewardTabs />);
    await userEvent.tab();
    expect(screen.getByRole('tab', { name: 'От родителя' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    const tickets = screen.getByRole('tab', { name: /Билетики/ });
    expect(tickets).toHaveFocus();
    expect(tickets).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Панель: tickets');
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'От родителя' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('only the selected tab is in the Tab order', () => {
    render(<RewardTabs />);
    expect(screen.getByRole('tab', { name: /Билетики/ })).toHaveAttribute('tabindex', '-1');
  });
});

describe('SegmentedControl', () => {
  function Switcher() {
    const [view, setView] = useState<'lessons' | 'games'>('lessons');
    return (
      <SegmentedControl
        label="Что показать"
        value={view}
        onChange={setView}
        options={[
          { value: 'lessons', label: 'Уроки' },
          { value: 'games', label: 'Игры' },
        ]}
      />
    );
  }

  it('is a radio group with the current option checked', async () => {
    render(<Switcher />);
    expect(screen.getByRole('radiogroup', { name: 'Что показать' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Уроки' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Игры' }));
    expect(screen.getByRole('radio', { name: 'Игры' })).toBeChecked();
  });

  it('arrows change the choice', async () => {
    render(<Switcher />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Игры' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Игры' })).toBeChecked();
  });
});

describe('Accordion', () => {
  it('toggles a region and reports expanded state', async () => {
    render(
      <Accordion
        items={[
          { id: 'streak', title: 'Серия занятий', content: 'День 1…5' },
          { id: 'help', title: 'Помощь', content: 'Как это работает' },
        ]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Серия занятий' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Серия занятий' })).not.toBeInTheDocument();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Серия занятий' })).toHaveTextContent('День 1…5');
    await userEvent.click(screen.getByRole('button', { name: 'Помощь' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
