// Admin side of the quiz: nothing to configure in the task itself — a quiz is its question bank.
import { QUIZ_TYPE } from '@questclass/shared/task-types/quiz/contract';
import { Text } from '@questclass/ui';
import { QuestionBank } from '../../features/questions/QuestionBank';
import type { TaskSectionsProps, TaskTypeAdmin } from '../registry';

export function QuizEditor() {
  return (
    <Text tone="muted">
      У теста нет своих настроек: он состоит из вопросов ниже. Сколько вопросов в попытке и сколько
      нужно для зачёта — в общих настройках.
    </Text>
  );
}

function QuizSections({ task }: TaskSectionsProps) {
  return <QuestionBank taskId={task.id} />;
}

export const quizAdmin: TaskTypeAdmin = {
  type: QUIZ_TYPE,
  Editor: QuizEditor,
  Sections: QuizSections,
};
