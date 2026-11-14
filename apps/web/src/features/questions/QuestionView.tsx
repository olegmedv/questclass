// One question as the admin reads it: the text, the four options with the correct one marked,
// the picture and where in the video the answer is explained.
import type { OptionId, QuestionContent } from '@questclass/shared/questions/schema';
import { Badge, Check, formatTime, Stack, Text } from '@questclass/ui';

/** Options are `a`–`d` in data and «А»–«Г» on screen, like in the learner's test. */
export const OPTION_LETTER: Readonly<Record<OptionId, string>> = { a: 'А', b: 'Б', c: 'В', d: 'Г' };

/** «1:23–1:40». */
export function fragmentText(evidence: { start: number; end: number }): string {
  return `${formatTime(evidence.start)}–${formatTime(evidence.end)}`;
}

export interface QuestionViewProps {
  readonly question: QuestionContent;
  /** Lines of the transcript inside the evidence fragment, if known. */
  readonly fragment?: string | null;
}

export function QuestionView({ question, fragment }: QuestionViewProps) {
  return (
    <Stack gap="sm">
      <Text weight="semibold">{question.text}</Text>
      <Stack as="ul" gap="xs" aria-label="Варианты">
        {question.options.map((option) => {
          const correct = option.id === question.correct;
          return (
            <li key={option.id}>
              <Text
                as="span"
                tone={correct ? 'success' : 'default'}
                weight={correct ? 'bold' : undefined}
              >
                {OPTION_LETTER[option.id]}) {option.text}
                {option.image ? ` · картинка ${option.image}` : ''}
              </Text>{' '}
              {correct && (
                <Badge tone="success" icon={<Check aria-hidden="true" />}>
                  верный
                </Badge>
              )}
            </li>
          );
        })}
      </Stack>
      {question.image && (
        <Text tone="muted" size="sm">
          Картинка: {question.image}
        </Text>
      )}
      {question.evidence ? (
        <Stack gap="xs">
          <Text tone="muted" size="sm">
            Объяснение в видео: {fragmentText(question.evidence)}
            {question.evidence.quote ? ` · «${question.evidence.quote}»` : ''}
          </Text>
          {fragment && (
            <Text tone="subtle" size="sm">
              Расшифровка фрагмента: {fragment}
            </Text>
          )}
        </Stack>
      ) : (
        <Text tone="subtle" size="sm">
          Без фрагмента-подсказки
        </Text>
      )}
    </Stack>
  );
}
