import { BookOpen, Check, Coins, RotateCcw, Trophy, X, Zap } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import './Result.css';

const number = (value: number) => value.toLocaleString('ru-RU');

export interface RewardLineProps {
  /** «Награда за пройденный тест», «Награда», «Уже получено». */
  readonly label: ReactNode;
  readonly xp?: number;
  readonly coins?: number;
  /** Line under the numbers («Награда уже получена»). */
  readonly note?: ReactNode;
}

/** XP and coins of a task: before it (what can be earned) or after it (what was paid). */
export function RewardLine({ label, xp = 0, coins = 0, note }: RewardLineProps) {
  return (
    <div className="qc-reward-line">
      <span className="qc-reward-line-label">{label}</span>
      {(xp > 0 || coins > 0) && (
        <span className="qc-reward-line-items">
          {xp > 0 && (
            <span className="qc-reward-line-item" data-kind="xp">
              <Zap className="qc-reward-line-xp" aria-hidden="true" />+{number(xp)} XP
            </span>
          )}
          {coins > 0 && (
            <span className="qc-reward-line-item" data-kind="coins">
              <Coins className="qc-reward-line-coins" aria-hidden="true" />+{number(coins)}{' '}
              <small>монет</small>
            </span>
          )}
        </span>
      )}
      {note && <span className="qc-reward-line-note">{note}</span>}
    </div>
  );
}

export type ResultTone = 'success' | 'partial' | 'retry';

const resultIcons: Record<ResultTone, ReactNode> = {
  success: <Trophy aria-hidden="true" />,
  partial: <BookOpen aria-hidden="true" />,
  retry: <RotateCcw aria-hidden="true" />,
};

export interface ResultSummaryProps {
  /** success — everything right; partial — passed with mistakes; retry — not passed. */
  readonly tone: ResultTone;
  readonly title: ReactNode;
  /** «Верных ответов: 2 из 3.» and other lines. */
  readonly children?: ReactNode;
  /** RewardLine of what was paid. */
  readonly reward?: ReactNode;
  readonly actions?: ReactNode;
  readonly headingLevel?: 2 | 3;
}

/** The outcome of a task: icon, title, score lines, reward and what to do next. */
export function ResultSummary({
  tone,
  title,
  children,
  reward,
  actions,
  headingLevel = 2,
}: ResultSummaryProps) {
  const titleId = useId();
  const Heading = `h${headingLevel}` as const;
  return (
    <section className="qc-result" data-tone={tone} aria-labelledby={titleId}>
      <span className="qc-result-icon">{resultIcons[tone]}</span>
      <Heading id={titleId} className="qc-result-title">
        {title}
      </Heading>
      {children && <div className="qc-result-text">{children}</div>}
      {reward}
      {actions && <div className="qc-result-actions">{actions}</div>}
    </section>
  );
}

export interface ReviewAnswer {
  readonly text: ReactNode;
  readonly image?: { readonly src: string; readonly alt: string };
}

export interface ReviewItem {
  readonly id: string;
  readonly question: ReactNode;
  readonly image?: { readonly src: string; readonly alt: string };
  /** The learner's answer (null — not answered). */
  readonly answer: ReviewAnswer | null;
  readonly correct: ReviewAnswer;
  readonly isCorrect: boolean;
  /** Extra action of this question («Посмотреть объяснение»). */
  readonly action?: ReactNode;
}

function Answer({ answer }: { readonly answer: ReviewAnswer }) {
  return (
    <span className="qc-review-answer">
      {answer.image && <img src={answer.image.src} alt={answer.image.alt} />}
      <span>{answer.text}</span>
    </span>
  );
}

export interface AnswerReviewProps {
  readonly title?: ReactNode;
  readonly items: readonly ReviewItem[];
}

/** «Давай разберём»: every question with the learner's answer and the right one. */
export function AnswerReview({ title = 'Давай разберём', items }: AnswerReviewProps) {
  const titleId = useId();
  return (
    <section className="qc-review" aria-labelledby={titleId}>
      <h2 id={titleId} className="qc-review-title">
        {title}
      </h2>
      <ol className="qc-review-list">
        {items.map((item) => (
          <li key={item.id} className="qc-review-item" data-correct={item.isCorrect || undefined}>
            <span className="qc-review-mark" aria-hidden="true">
              {item.isCorrect ? <Check /> : <X />}
            </span>
            <div className="qc-review-body">
              <p className="qc-review-question">
                {item.question}
                <span className="qc-visually-hidden">
                  {item.isCorrect ? ': верно' : ': есть ошибка'}
                </span>
              </p>
              {item.image && (
                <img className="qc-review-image" src={item.image.src} alt={item.image.alt} />
              )}
              <dl className="qc-review-answers">
                <div>
                  <dt>Твой ответ</dt>
                  <dd>{item.answer ? <Answer answer={item.answer} /> : 'нет ответа'}</dd>
                </div>
                {!item.isCorrect && (
                  <div data-kind="correct">
                    <dt>Верный ответ</dt>
                    <dd>
                      <Answer answer={item.correct} />
                    </dd>
                  </div>
                )}
              </dl>
              {item.action && <div className="qc-review-action">{item.action}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
