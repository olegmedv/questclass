import { Check, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { ProgressBar } from './Progress';
import { Skeleton } from './Skeleton';
import './QuestionCard.css';

export interface QuestionCardProps {
  /** 1-based number of the question. */
  readonly index: number;
  readonly total: number;
  readonly text: ReactNode;
  readonly image?: { readonly src: string; readonly alt: string };
  /** Buttons next to the counter («Послушать вопрос»). */
  readonly tools?: ReactNode;
  /** The answer options (OptionTile). */
  readonly children?: ReactNode;
  readonly loading?: boolean;
  /** Shown under the options (e.g. «Не удалось сохранить ответ»). */
  readonly error?: ReactNode;
}

/** One quiz question: counter, progress, text, picture and the answer options. */
export function QuestionCard({
  index,
  total,
  text,
  image,
  tools,
  children,
  loading = false,
  error,
}: QuestionCardProps) {
  const headingId = useId();
  return (
    <section className="qc-question" aria-labelledby={headingId} aria-busy={loading || undefined}>
      <header className="qc-question-top">
        <span className="qc-question-counter">
          Вопрос {index} из {total}
        </span>
        {tools && <span className="qc-question-tools">{tools}</span>}
      </header>
      <ProgressBar value={index - 1} max={total} label="Пройдено вопросов" size="sm" />
      {loading ? (
        <Skeleton lines={2} />
      ) : (
        <h2 id={headingId} className="qc-question-text">
          {text}
        </h2>
      )}
      {image && !loading && (
        <img className="qc-question-image" src={image.src} alt={image.alt} decoding="async" />
      )}
      <div className="qc-question-options" role="group" aria-labelledby={headingId}>
        {children}
      </div>
      {error && (
        <p className="qc-question-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong';

export interface OptionTileProps {
  /** «А», «Б», «В», «Г». */
  readonly letter?: string;
  readonly children: ReactNode;
  readonly image?: { readonly src: string; readonly alt: string };
  readonly state?: OptionState;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}

const stateText: Partial<Record<OptionState, string>> = {
  correct: 'верный ответ',
  wrong: 'неверный ответ',
};

/** An answer option. The choice is reported as pressed; after checking it shows right/wrong. */
export function OptionTile({
  letter,
  children,
  image,
  state = 'idle',
  disabled = false,
  onClick,
}: OptionTileProps) {
  return (
    <button
      type="button"
      className="qc-option"
      data-state={state}
      aria-pressed={state !== 'idle'}
      disabled={disabled}
      onClick={onClick}
    >
      {letter && (
        <span className="qc-option-letter" aria-hidden="true">
          {letter}
        </span>
      )}
      {image && <img className="qc-option-image" src={image.src} alt={image.alt} />}
      <span className="qc-option-label">{children}</span>
      {state === 'correct' && <Check className="qc-option-mark" aria-hidden="true" />}
      {state === 'wrong' && <X className="qc-option-mark" aria-hidden="true" />}
      {stateText[state] && <span className="qc-visually-hidden">: {stateText[state]}</span>}
    </button>
  );
}
