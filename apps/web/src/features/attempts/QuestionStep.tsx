// One question of an attempt: the card with the options (А–Г), «Послушать вопрос» when the device
// has a Russian voice, and the choice that can change until «Ответить» saves it.
import type { AttemptQuestionDto } from '@questclass/shared/attempts/dto';
import type { OptionId } from '@questclass/shared/questions/schema';
import { Button, OptionTile, QuestionCard, Square, Volume2 } from '@questclass/ui';
import { imageUrl, OPTION_LETTERS } from './api';
import { questionSpeech, type Speech } from './speech';

export interface QuestionStepProps {
  readonly question: AttemptQuestionDto;
  /** 1-based. */
  readonly index: number;
  readonly total: number;
  readonly selected: OptionId | null;
  readonly onSelect: (option: OptionId) => void;
  readonly disabled?: boolean;
  readonly error?: string | null;
  readonly speech: Speech;
}

export function QuestionStep({
  question,
  index,
  total,
  selected,
  onSelect,
  disabled = false,
  error,
  speech,
}: QuestionStepProps) {
  const image = imageUrl(question.image);
  const listen = () =>
    speech.speak(
      questionSpeech(
        index,
        total,
        question.text,
        question.options.map((option, i) => ({
          letter: OPTION_LETTERS[i] ?? '',
          text: option.text,
        })),
      ),
    );
  return (
    <QuestionCard
      index={index}
      total={total}
      text={question.text}
      image={image ? { src: image, alt: 'Картинка к вопросу' } : undefined}
      error={error}
      tools={
        speech.available ? (
          <Button
            size="sm"
            variant="ghost"
            icon={speech.speaking ? <Square aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            onClick={speech.speaking ? speech.stop : listen}
          >
            {speech.speaking ? 'Остановить' : 'Послушать вопрос'}
          </Button>
        ) : null
      }
    >
      {question.options.map((option, i) => {
        const optionImage = imageUrl(option.image);
        return (
          <OptionTile
            key={option.id}
            letter={OPTION_LETTERS[i]}
            image={optionImage ? { src: optionImage, alt: option.text } : undefined}
            state={selected === option.id ? 'selected' : 'idle'}
            disabled={disabled}
            onClick={() => onSelect(option.id)}
          >
            {option.text}
          </OptionTile>
        );
      })}
    </QuestionCard>
  );
}
