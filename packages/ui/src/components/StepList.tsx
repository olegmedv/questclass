import { Check, ChevronRight } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import './StepList.css';

export type StepStatus = 'done' | 'current' | 'todo';

export interface Step {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly status: StepStatus;
}

const statusText: Record<StepStatus, string> = {
  done: 'готово',
  current: 'сейчас',
  todo: 'впереди',
};

/** Steps of a task: «Видео → Тест → Награда». */
export function StepList({
  steps,
  label,
}: {
  readonly steps: readonly Step[];
  readonly label: string;
}) {
  return (
    <ol className="qc-steps" aria-label={label}>
      {steps.map((step, index) => (
        <Fragment key={step.id}>
          {index > 0 && (
            <li className="qc-steps-arrow" aria-hidden="true">
              <ChevronRight />
            </li>
          )}
          <li
            className="qc-steps-item"
            data-status={step.status}
            aria-current={step.status === 'current' ? 'step' : undefined}
          >
            <span className="qc-steps-icon" aria-hidden="true">
              {step.status === 'done' ? <Check /> : step.icon}
            </span>
            <span className="qc-steps-label">{step.label}</span>
            <span className="qc-visually-hidden">: {statusText[step.status]}</span>
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
