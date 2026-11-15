// Template of any task (video lesson, quiz, chore): steps, media, content and an action bar.
import { PlayerFrame, ProgressBar, StepList, type Step } from '@questclass/ui';
import type { ReactNode } from 'react';

export interface TaskPlayerProps {
  readonly title: string;
  /** Subject name above the title. */
  readonly subject?: string;
  readonly backHref: string;
  readonly steps?: readonly Step[];
  readonly progress?: {
    readonly value: number;
    readonly max?: number;
    readonly label: string;
    readonly valueText?: string;
  };
  readonly media?: ReactNode;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}

export function TaskPlayer({
  title,
  subject,
  backHref,
  steps,
  progress,
  media,
  children,
  actions,
}: TaskPlayerProps) {
  return (
    <PlayerFrame
      title={title}
      eyebrow={subject}
      backHref={backHref}
      steps={steps && steps.length > 0 ? <StepList label="Шаги задания" steps={steps} /> : null}
      progress={
        progress ? (
          <ProgressBar
            label={progress.label}
            value={progress.value}
            max={progress.max}
            valueText={progress.valueText}
            showLabel
          />
        ) : null
      }
      media={media}
      actions={actions}
    >
      {children}
    </PlayerFrame>
  );
}
