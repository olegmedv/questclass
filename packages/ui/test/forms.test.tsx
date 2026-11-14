// Form controls: label association, hints and errors, keyboard, value handling.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Checkbox,
  DateTimeInput,
  Field,
  FileInput,
  NumberInput,
  Select,
  Slider,
  Switch,
  Textarea,
  TextInput,
} from '../src';

describe('Field', () => {
  it('labels the control and links hint and error', () => {
    render(
      <Field label="Логин" hint="Латиница и цифры" error="Логин занят" required>
        <TextInput />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /Логин/ });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Латиница и цифры Логин занят');
    expect(screen.getByRole('alert')).toHaveTextContent('Логин занят');
  });

  it('a disabled field disables its control', () => {
    render(
      <Field label="Пароль" disabled>
        <TextInput type="password" />
      </Field>,
    );
    expect(screen.getByLabelText('Пароль')).toBeDisabled();
  });

  it('Textarea, Select and DateTimeInput take the label too', () => {
    render(
      <>
        <Field label="Описание">
          <Textarea maxLength={100} showCount value="Привет" onChange={() => {}} />
        </Field>
        <Field label="Предмет">
          <Select
            placeholder="Выберите"
            options={[{ value: 'math', label: 'Математика' }]}
            value="math"
            onChange={() => {}}
          />
        </Field>
        <Field label="Открыть с">
          <DateTimeInput value="2026-11-14T09:00" onChange={() => {}} />
        </Field>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Описание' })).toHaveValue('Привет');
    expect(screen.getByText('6 / 100')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Предмет' })).toHaveValue('math');
    expect(screen.getByLabelText('Открыть с')).toHaveValue('2026-11-14T09:00');
  });
});

describe('Switch and Checkbox', () => {
  it('Switch has the switch role and toggles', async () => {
    const onChange = vi.fn();
    render(
      <Switch
        checked={false}
        onChange={onChange}
        label="Звуки интерфейса"
        description="Пакетики и уровни"
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Звуки интерфейса' });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription('Пакетики и уровни');
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('Checkbox toggles with the keyboard', async () => {
    const onChange = vi.fn();
    render(<Checkbox checked onChange={onChange} label="Назначить Саше" />);
    const box = screen.getByRole('checkbox', { name: 'Назначить Саше' });
    expect(box).toBeChecked();
    box.focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('NumberInput', () => {
  function Coins({ initial = 5 }: { initial?: number | null }) {
    const [value, setValue] = useState<number | null>(initial);
    return (
      <Field label="Монеты">
        <NumberInput value={value} onChange={setValue} min={0} max={10} />
      </Field>
    );
  }

  it('steps with buttons and stops at the limits', async () => {
    render(<Coins initial={9} />);
    const input = screen.getByRole('textbox', { name: 'Монеты' });
    await userEvent.click(screen.getByRole('button', { name: 'Увеличить' }));
    expect(input).toHaveValue('10');
    expect(screen.getByRole('button', { name: 'Увеличить' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Уменьшить' }));
    expect(input).toHaveValue('9');
  });

  it('typed numbers are clamped when the box loses focus; arrows step', async () => {
    render(<Coins />);
    const input = screen.getByRole('textbox', { name: 'Монеты' });
    await userEvent.clear(input);
    await userEvent.type(input, '42');
    await userEvent.tab();
    expect(input).toHaveValue('10');
    input.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveValue('9');
  });
});

describe('Slider and FileInput', () => {
  it('Slider is a labelled range with a readable value', () => {
    const onChange = vi.fn();
    render(
      <Field label="Громкость">
        <Slider value={55} onChange={onChange} format={(v) => `${v}%`} />
      </Field>,
    );
    const slider = screen.getByRole('slider', { name: 'Громкость' });
    expect(slider).toHaveAttribute('aria-valuetext', '55%');
    fireEvent.change(slider, { target: { value: '70' } });
    expect(onChange).toHaveBeenCalledWith(70);
  });

  it('FileInput is labelled and shows the chosen file name', async () => {
    const onChange = vi.fn();
    render(
      <Field label="Картинка товара">
        <FileInput accept="image/webp" onChange={onChange} />
      </Field>,
    );
    const input = screen.getByLabelText('Картинка товара');
    expect(screen.getByText('Файл не выбран')).toBeInTheDocument();
    const file = new File(['x'], 'hero.webp', { type: 'image/webp' });
    await userEvent.upload(input, file);
    expect(onChange).toHaveBeenCalledWith([file]);
    expect(screen.getByText('hero.webp')).toBeInTheDocument();
  });
});
