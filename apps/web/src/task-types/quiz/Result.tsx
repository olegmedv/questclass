// The result of a finished attempt (spec/01 §2.17): title by the score, «Верных ответов: X из N»,
// what was paid, retry or «Попросить пересдачу», and «Давай разберём» from the attempt snapshot.
// Video lessons grade like a quiz, so they show the same result (with hint fragments).
import type { AttemptDto, AttemptQuestionDto } from '@questclass/shared/attempts/dto';
import {
  AnswerReview,
  Button,
  ButtonLink,
  Notice,
  ResultSummary,
  RewardLine,
  RotateCcw,
  Send,
  Stack,
  type ResultTone,
  type ReviewItem,
} from '@questclass/ui';
import type { ReactNode } from 'react';
import { imageUrl } from '../../features/attempts/api';

export function resultHeadline(result: NonNullable<AttemptDto['result']>): {
  tone: ResultTone;
  title: string;
} {
  if (result.passed && result.correct === result.total) {
    return { tone: 'success', title: 'Миссия выполнена!' };
  }
  if (result.passed) return { tone: 'partial', title: 'Тест пройден!' };
  return { tone: 'retry', title: 'Попробуем ещё раз' };
}

function reviewItem(question: AttemptQuestionDto, action: ReactNode): ReviewItem {
  const optionOf = (id: string | null | undefined) => question.options.find((o) => o.id === id);
  const answer = optionOf(question.answer);
  const correct = optionOf(question.correct);
  const answerImage = imageUrl(answer?.image ?? null);
  const correctImage = imageUrl(correct?.image ?? null);
  const image = imageUrl(question.image);
  return {
    id: String(question.id),
    question: question.text,
    image: image ? { src: image, alt: 'Картинка к вопросу' } : undefined,
    answer: answer
      ? {
          text: answer.text,
          image: answerImage ? { src: answerImage, alt: answer.text } : undefined,
        }
      : null,
    correct: {
      text: correct?.text ?? '—',
      image: correctImage && correct ? { src: correctImage, alt: correct.text } : undefined,
    },
    isCorrect: question.isCorrect ?? false,
    action,
  };
}

export interface RetryControls {
  readonly onRetry: () => void;
  readonly retrying: boolean;
  readonly onRequest: () => void;
  readonly requesting: boolean;
  /** The request has just been sent from this screen. */
  readonly requested: boolean;
  readonly error: string | null;
}

export interface AttemptResultProps {
  /** A finished attempt (with `result` and `retry`). */
  readonly attempt: AttemptDto;
  readonly controls: RetryControls;
  /** Extra action of a question in the review (a hint fragment of a video lesson). */
  readonly renderHelp?: (question: AttemptQuestionDto) => ReactNode;
  /** «Повторить видео» after a failed attempt of a video lesson. */
  readonly onRewatch?: () => void;
}

export function AttemptResult({ attempt, controls, renderHelp, onRewatch }: AttemptResultProps) {
  const result = attempt.result;
  if (!result) return null;
  const retry = attempt.retry ?? { canRetry: false, canRequest: false, requestOpen: false };
  const { tone, title } = resultHeadline(result);
  const paid = result.reward.xp > 0 || result.reward.coins > 0;
  const waiting = retry.requestOpen || controls.requested;
  const streakPaid = result.streakReward.xp > 0 || result.streakReward.coins > 0;

  let next: string | null = null;
  if (result.passed && result.correct < result.total) next = 'Ошибки можно разобрать ниже.';
  if (!result.passed) {
    next = retry.canRetry ? 'Можно пройти тест ещё раз.' : 'Новую попытку откроет родитель.';
  }

  return (
    <Stack gap="lg">
      <ResultSummary
        tone={tone}
        title={title}
        reward={
          paid ? (
            <RewardLine label="Награда" xp={result.reward.xp} coins={result.reward.coins} />
          ) : (
            <RewardLine
              label={
                result.passed
                  ? 'Награда за этот тест уже получена.'
                  : 'Награда — за пройденный тест.'
              }
            />
          )
        }
        actions={
          <>
            {!result.passed && retry.canRetry && (
              <Button
                variant="primary"
                icon={<RotateCcw aria-hidden="true" />}
                loading={controls.retrying}
                onClick={controls.onRetry}
              >
                Пересдать
              </Button>
            )}
            {!result.passed && retry.canRequest && !waiting && (
              <Button
                variant="primary"
                icon={<Send aria-hidden="true" />}
                loading={controls.requesting}
                onClick={controls.onRequest}
              >
                Попросить пересдачу
              </Button>
            )}
            {!result.passed && onRewatch && <Button onClick={onRewatch}>Повторить видео</Button>}
            <ButtonLink href="/">К урокам</ButtonLink>
          </>
        }
      >
        <p>
          Верных ответов: {result.correct} из {result.total}.
        </p>
        {next && <p>{next}</p>}
      </ResultSummary>
      {streakPaid && (
        <RewardLine
          label="Бонус за серию занятий"
          xp={result.streakReward.xp}
          coins={result.streakReward.coins}
        />
      )}
      {!result.passed && waiting && (
        <Notice tone="info">Просьба отправлена. Новую попытку откроет родитель.</Notice>
      )}
      {controls.error && <Notice tone="danger">{controls.error}</Notice>}
      <AnswerReview
        title={result.correct === result.total ? 'Твои ответы' : 'Давай разберём'}
        items={attempt.questions.map((question) => reviewItem(question, renderHelp?.(question)))}
      />
    </Stack>
  );
}
