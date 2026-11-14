// Player of the `quiz` type: an intro with the reward and «Начать тест», then the attempt
// (AttemptFlow), the result and the celebration of a pass. A passed quiz opens as its result.
import { QUIZ_TYPE } from '@questclass/shared/task-types/quiz/contract';
import {
  Button,
  ButtonLink,
  Card,
  CircleQuestionMark,
  Gift,
  ResultSummary,
  RewardLine,
  Stack,
  Text,
  type Step,
} from '@questclass/ui';
import { useState, type ReactElement } from 'react';
import { AttemptFlow, type AttemptFrame } from '../../features/attempts/AttemptFlow';
import { TaskPlayer } from '../../templates/TaskPlayer';
import type { TaskPlayerProps, WebTaskType } from '../registry';

function quizSteps(done: boolean): Step[] {
  return [
    {
      id: 'quiz',
      label: 'Тест',
      icon: <CircleQuestionMark />,
      status: done ? 'done' : 'current',
    },
    { id: 'reward', label: 'Награда', icon: <Gift />, status: done ? 'done' : 'todo' },
  ];
}

export function QuizPlayer({ task, subject, progress }: TaskPlayerProps) {
  const [started, setStarted] = useState(false);
  const completed = progress?.completed ?? false;
  const frame = ({
    body,
    actions,
    passed,
  }: Pick<AttemptFrame, 'body' | 'actions' | 'passed'>): ReactElement => (
    <TaskPlayer
      title={task.title}
      subject={subject?.name}
      backHref="/"
      steps={quizSteps(passed ?? false)}
      actions={actions}
    >
      {body}
    </TaskPlayer>
  );

  if (started) {
    return <AttemptFlow task={task} frame={frame} />;
  }
  if (completed) {
    return frame({
      passed: true,
      body: (
        <ResultSummary
          tone="success"
          title="Тест пройден!"
          reward={<RewardLine label="Награда за этот тест уже получена." />}
          actions={<ButtonLink href="/">К урокам</ButtonLink>}
        >
          {progress?.score !== null &&
            progress?.total !== null &&
            progress?.total !== undefined && (
              <p>
                Верных ответов: {progress.score} из {progress.total}.
              </p>
            )}
        </ResultSummary>
      ),
    });
  }
  return frame({
    body: (
      <Card padding="lg">
        <Stack gap="md">
          {task.description && <Text>{task.description}</Text>}
          <Text tone="muted">
            Ответь на вопросы теста. Каждый ответ сохраняется сразу — поменять его потом нельзя.
          </Text>
          <RewardLine label="Награда за пройденный тест" xp={task.xp} coins={task.coins} />
        </Stack>
      </Card>
    ),
    actions: (
      <Button variant="primary" size="lg" onClick={() => setStarted(true)}>
        {progress?.state === 'started' ? 'Продолжить тест' : 'Начать тест'}
      </Button>
    ),
  });
}

export const quizTaskType: WebTaskType = {
  type: QUIZ_TYPE,
  label: 'Тест',
  Player: QuizPlayer,
};
