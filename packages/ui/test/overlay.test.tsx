// Modal, Sheet, Drawer: dialog role and name, initial focus, focus trap, Escape, focus return.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button, Drawer, Field, Modal, Sheet, TextInput } from '../src';

function Harness({ dismissible = true }: { dismissible?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Открыть</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Настройка приложения"
        description="Придумай PIN"
        dismissible={dismissible}
        footer={<Button onClick={() => setOpen(false)}>Готово</Button>}
      >
        <Field label="Имя ребёнка">
          <TextInput />
        </Field>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('is a modal dialog named by its title and described', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    const dialog = screen.getByRole('dialog', { name: 'Настройка приложения' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Придумай PIN');
  });

  it('focuses the first field and keeps Tab inside', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    const input = screen.getByRole('textbox', { name: 'Имя ребёнка' });
    expect(input).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Готово' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus();
    await userEvent.tab();
    expect(input).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus();
  });

  it('Escape closes it and the focus returns to the opener', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Открыть' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('a non-dismissible dialog ignores Escape and has no close button', async () => {
    render(<Harness dismissible={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument();
  });

  it('locks page scroll while open', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(document.body.style.overflow).toBe('hidden');
    await userEvent.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });
});

describe('Sheet and Drawer', () => {
  it('Sheet is a dialog and closes with its close button', async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Быстрое меню">
        <p>Пункты</p>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Быстрое меню' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Drawer without focusable content focuses the dialog itself', () => {
    render(
      <Drawer open onClose={() => {}} title="Разделы" dismissible={false}>
        <p>Текст</p>
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Разделы' })).toHaveFocus();
  });
});
