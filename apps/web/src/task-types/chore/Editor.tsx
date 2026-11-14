// Admin side of a chore: how often it can be done for a reward.
import {
  CHORE_REPEATS,
  CHORE_TYPE,
  choreConfigSchema,
  type ChoreRepeat,
} from '@questclass/shared/task-types/chore/contract';
import { Field, Notice, Select } from '@questclass/ui';
import type { TaskEditorProps, TaskTypeAdmin } from '../registry';

const REPEAT_LABEL: Readonly<Record<ChoreRepeat, string>> = {
  once: 'Один раз',
  daily: 'Раз в день',
  weekly: 'Раз в неделю',
};

export function ChoreEditor({ config, onChange, disabled }: TaskEditorProps) {
  const parsed = choreConfigSchema.safeParse(config);
  if (!parsed.success) {
    return (
      <Notice tone="danger">Настройки дела повреждены: {parsed.error.issues[0]?.message}</Notice>
    );
  }
  return (
    <Field
      label="Как часто можно делать за награду"
      hint="Ученик отмечает «Я сделал», родитель подтверждает. Дни и недели — по часовому поясу семьи."
      disabled={disabled}
    >
      <Select
        options={CHORE_REPEATS.map((value) => ({ value, label: REPEAT_LABEL[value] }))}
        value={parsed.data.repeat}
        onChange={(event) =>
          onChange({ ...parsed.data, repeat: event.currentTarget.value as ChoreRepeat })
        }
      />
    </Field>
  );
}

export const choreAdmin: TaskTypeAdmin = { type: CHORE_TYPE, Editor: ChoreEditor };
