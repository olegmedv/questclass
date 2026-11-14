// Picker of the learner whose data an admin page shows; the choice lives in the address.
import type { UserDto } from '@questclass/shared/auth/dto';
import { Field, Select } from '@questclass/ui';

export interface LearnerSelectProps {
  readonly learners: readonly UserDto[];
  readonly value: number | null;
  readonly onChange: (learnerId: number) => void;
  readonly label?: string;
}

export function LearnerSelect({ learners, value, onChange, label = 'Ученик' }: LearnerSelectProps) {
  return (
    <Field label={label}>
      <Select
        options={learners.map((learner) => ({
          value: String(learner.id),
          label: learner.active ? learner.name : `${learner.name} (отключён)`,
        }))}
        placeholder={value === null ? 'Выберите ученика' : undefined}
        value={value === null ? '' : String(value)}
        onChange={(event) => {
          const id = Number(event.currentTarget.value);
          if (id > 0) onChange(id);
        }}
      />
    </Field>
  );
}
