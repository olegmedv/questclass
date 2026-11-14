// The questions of a task on top of the attempts engine (FEAT-010): starts or resumes the
// attempt, asks the questions in order (each answer is saved at once and cannot change), finishes
// it, celebrates a pass and shows the result with retry or «Попросить пересдачу».
import type { AttemptDto, AttemptQuestionDto } from '@questclass/shared/attempts/dto';
import type { OptionId } from '@questclass/shared/questions/schema';
import type { LearnerTaskDto } from '@questclass/shared/tasks/dto';
import {
  Button,
  ButtonLink,
  Celebration,
  Inline,
  Notice,
  ResultSummary,
  Send,
  Spinner,
  Stack,
} from '@questclass/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { isApiError } from '../../api/client';
import { AttemptResult, resultHeadline } from '../../task-types/quiz/Result';
import { useSound } from '../sound/useSound';
import { refreshLearnerData } from '../tasks/queries';
import {
  currentQuestionIndex,
  fetchAttempt,
  finishAttempt,
  requestRetry,
  saveAnswer,
  startAttempt,
  startBlockOf,
} from './api';
import { QuestionStep } from './QuestionStep';
import { useSpeech } from './speech';

export type AttemptPhase = 'starting' | 'question' | 'finishing' | 'result' | 'blocked';

/** What the flow puts into the task frame: the content and the sticky actions. */
export interface AttemptFrame {
  readonly phase: AttemptPhase;
  /** On the result: the attempt passed (the reward step is done). */
  readonly passed?: boolean;
  readonly body: ReactNode;
  readonly actions?: ReactNode;
}

export interface AttemptFlowProps {
  readonly task: LearnerTaskDto;
  /** Puts the flow into the task frame (TaskPlayer with the type's steps). */
  readonly frame: (parts: AttemptFrame) => ReactElement;
  /** A hint of a question on the result screen (video lessons: the explaining fragment). */
  readonly renderHelp?: (question: AttemptQuestionDto) => ReactNode;
  /** «Повторить видео» after a failed attempt (video lessons). */
  readonly onRewatch?: () => void;
}

function withAnswer(attempt: AttemptDto, questionId: number, optionId: OptionId): AttemptDto {
  return {
    ...attempt,
    questions: attempt.questions.map((q) => (q.id === questionId ? { ...q, answer: optionId } : q)),
  };
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Что-то пошло не так. Попробуй ещё раз.';

export function AttemptFlow({ task, frame, renderHelp, onRewatch }: AttemptFlowProps) {
  const client = useQueryClient();
  const sound = useSound();
  const speech = useSpeech();
  const [attempt, setAttempt] = useState<AttemptDto | null>(null);
  const [selected, setSelected] = useState<OptionId | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [requested, setRequested] = useState(false);

  const start = useMutation({
    mutationFn: () => startAttempt(task.id),
    onSuccess: (next) => {
      setAttempt(next);
      setSelected(null);
      setRequested(false);
    },
  });
  const finish = useMutation({
    mutationFn: (attemptId: number) => finishAttempt(attemptId),
    onSuccess: (done) => {
      setAttempt(done);
      if (done.result?.passed) setCelebrate(true);
      void refreshLearnerData(client);
    },
  });
  const answer = useMutation({
    mutationFn: (input: { attemptId: number; questionId: number; optionId: OptionId }) =>
      saveAnswer(input.attemptId, input.questionId, input.optionId),
    onSuccess: (saved, input) => {
      setSelected(null);
      setAttempt((current) =>
        current && current.id === input.attemptId
          ? withAnswer(current, saved.questionId, saved.optionId)
          : current,
      );
    },
    onError: async (error, input) => {
      // Already answered elsewhere (another tab): continue from the server's state.
      if (isApiError(error) && error.status === 409) {
        setSelected(null);
        setAttempt(await fetchAttempt(input.attemptId));
      }
    },
  });
  const request = useMutation({
    mutationFn: () => requestRetry(task.id),
    onSuccess: () => setRequested(true),
  });

  // The flow is mounted when the learner asked to start: begin (or resume) right away, once.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start.mutate();
  }, [start]);

  // Every question answered: grade the attempt (also when resuming such an attempt).
  const index = attempt ? currentQuestionIndex(attempt) : 0;
  const allAnswered =
    attempt !== null && attempt.status === 'in_progress' && index >= attempt.questions.length;
  const finishing = useRef<number | null>(null);
  useEffect(() => {
    if (!allAnswered || !attempt || finishing.current === attempt.id) return;
    finishing.current = attempt.id;
    finish.mutate(attempt.id);
  }, [allAnswered, attempt, finish]);

  // Stop reading aloud when the question changes or the flow ends.
  const { stop } = speech;
  useEffect(() => stop, [index, stop]);

  const toLessons = <ButtonLink href="/">К урокам</ButtonLink>;

  if (start.isError) {
    const block = startBlockOf(start.error);
    if (block?.kind === 'retry_needed') {
      const waiting = block.requestOpen || requested;
      return frame({
        phase: 'blocked',
        body: (
          <ResultSummary
            tone="retry"
            title="Новую попытку откроет родитель"
            actions={
              <>
                {!waiting && (
                  <Button
                    variant="primary"
                    icon={<Send aria-hidden="true" />}
                    loading={request.isPending}
                    onClick={() => request.mutate()}
                  >
                    Попросить пересдачу
                  </Button>
                )}
                {onRewatch && <Button onClick={onRewatch}>Повторить видео</Button>}
                {toLessons}
              </>
            }
          >
            <p>Бесплатные пересдачи закончились.</p>
            {waiting && <p>Просьба отправлена. Ждём родителя.</p>}
            {request.isError && <p>{message(request.error)}</p>}
          </ResultSummary>
        ),
      });
    }
    return frame({
      phase: 'blocked',
      body: (
        <Stack gap="md">
          <Notice tone={block ? 'info' : 'danger'}>{message(start.error)}</Notice>
          <Inline>
            {!block && (
              <Button variant="primary" onClick={() => start.mutate()}>
                Попробовать ещё раз
              </Button>
            )}
            {onRewatch && block?.kind === 'not_ready' && (
              <Button onClick={onRewatch}>Вернуться к видео</Button>
            )}
            {toLessons}
          </Inline>
        </Stack>
      ),
    });
  }

  if (!attempt) {
    return frame({
      phase: 'starting',
      body: (
        <Inline justify="center">
          <Spinner size="lg" label="Готовим вопросы" />
        </Inline>
      ),
    });
  }

  if (attempt.status === 'finished' && attempt.result) {
    const headline = resultHeadline(attempt.result);
    return (
      <>
        {frame({
          phase: 'result',
          passed: attempt.result.passed,
          body: (
            <AttemptResult
              attempt={attempt}
              renderHelp={renderHelp}
              onRewatch={onRewatch}
              controls={{
                onRetry: () => start.mutate(),
                retrying: start.isPending,
                onRequest: () => request.mutate(),
                requesting: request.isPending,
                requested,
                error: request.isError ? message(request.error) : null,
              }}
            />
          ),
        })}
        <Celebration
          variant="pass"
          open={celebrate}
          onClose={() => setCelebrate(false)}
          title={headline.title}
          message={`Верных ответов: ${attempt.result.correct} из ${attempt.result.total}`}
          reward={attempt.result.reward}
          onReward={() => sound.play('complete')}
        />
      </>
    );
  }

  if (attempt.status === 'abandoned') {
    return frame({
      phase: 'blocked',
      body: (
        <Stack gap="md">
          <Notice tone="info">Эта попытка закрыта: родитель начал задание заново.</Notice>
          <Inline>
            <Button variant="primary" onClick={() => start.mutate()}>
              Начать заново
            </Button>
            {toLessons}
          </Inline>
        </Stack>
      ),
    });
  }

  const question = attempt.questions[index];
  if (!question) {
    return frame({
      phase: 'finishing',
      body: finish.isError ? (
        <Stack gap="md">
          <Notice tone="danger">{message(finish.error)}</Notice>
          <Inline>
            <Button variant="primary" onClick={() => finish.mutate(attempt.id)}>
              Попробовать ещё раз
            </Button>
          </Inline>
        </Stack>
      ) : (
        <Inline justify="center">
          <Spinner size="lg" label="Проверяем ответы" />
        </Inline>
      ),
    });
  }

  const submit = () => {
    if (selected === null) return;
    answer.mutate({ attemptId: attempt.id, questionId: question.id, optionId: selected });
  };
  const last = index === attempt.questions.length - 1;
  return frame({
    phase: 'question',
    body: (
      <QuestionStep
        key={question.id}
        question={question}
        index={index + 1}
        total={attempt.questions.length}
        selected={selected}
        onSelect={setSelected}
        disabled={answer.isPending}
        error={
          answer.isError && !(isApiError(answer.error) && answer.error.status === 409)
            ? `Не удалось сохранить ответ. ${message(answer.error)}`
            : null
        }
        speech={speech}
      />
    ),
    actions: (
      <Button
        variant="primary"
        size="lg"
        disabled={selected === null}
        loading={answer.isPending}
        onClick={submit}
      >
        {last ? 'Ответить и завершить' : 'Ответить'}
      </Button>
    ),
  });
}
