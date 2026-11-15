// Adding or changing one question: the text, four options, the correct one, an optional picture
// and the fragment of the video that explains the answer. A change is saved as a new version.
import {
  OPTION_IDS,
  questionContentSchema,
  type OptionId,
  type QuestionContent,
  type QuestionDto,
} from '@questclass/shared/questions/schema';
import {
  Button,
  Field,
  formatTime,
  Inline,
  Modal,
  Notice,
  SegmentedControl,
  Stack,
  Textarea,
  TextInput,
  useToast,
} from '@questclass/ui';
import { useId, useState, type FormEvent } from 'react';
import { errorText } from '../admin/forms';
import { useCreateQuestion, useUpdateQuestion } from './queries';
import { OPTION_LETTER } from './QuestionView';

interface Draft {
  text: string;
  options: Record<OptionId, string>;
  correct: OptionId;
  image: string;
  start: string;
  end: string;
  quote: string;
}

/** «1:23», «83» or «83.5» → seconds; null for an empty or unreadable text. */
export function parseSeconds(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const parts = trimmed.split(':');
  if (parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

function draftOf(question: QuestionDto | null): Draft {
  const options = { a: '', b: '', c: '', d: '' };
  for (const option of question?.options ?? []) options[option.id] = option.text;
  return {
    text: question?.text ?? '',
    options,
    correct: question?.correct ?? 'a',
    image: question?.image ?? '',
    start: question?.evidence ? formatTime(question.evidence.start) : '',
    end: question?.evidence ? formatTime(question.evidence.end) : '',
    quote: question?.evidence?.quote ?? '',
  };
}

/** The content to send, or the messages of the fields that are wrong. */
function contentOf(
  draft: Draft,
  question: QuestionDto | null,
): { content: QuestionContent } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const start = parseSeconds(draft.start);
  const end = parseSeconds(draft.end);
  const hasFragment = draft.start.trim() !== '' || draft.end.trim() !== '';
  if (hasFragment && (start === null || end === null)) {
    errors['evidence'] = 'Укажите начало и конец фрагмента, например 1:05 и 1:20';
  }
  const images = new Map(question?.options.map((option) => [option.id, option.image]) ?? []);
  const input = {
    text: draft.text,
    options: OPTION_IDS.map((id) => ({
      id,
      text: draft.options[id],
      ...(images.get(id) ? { image: images.get(id) } : {}),
    })),
    correct: draft.correct,
    image: draft.image.trim() === '' ? null : draft.image.trim(),
    evidence:
      hasFragment && start !== null && end !== null
        ? { start, end, quote: draft.quote.trim() === '' ? null : draft.quote.trim() }
        : null,
  };
  const check = questionContentSchema.safeParse(input);
  if (!check.success) {
    for (const issue of check.error.issues) {
      const [first, index] = issue.path;
      const key =
        first === 'options' && typeof index === 'number'
          ? `option.${OPTION_IDS[index] ?? ''}`
          : String(first ?? '');
      errors[key] ??= issue.message;
    }
  }
  if (Object.keys(errors).length > 0 || !check.success) return { errors };
  return { content: check.data };
}

export interface QuestionEditorProps {
  readonly taskId: number;
  /** null = a new question. */
  readonly question: QuestionDto | null;
  readonly onClose: () => void;
}

export function QuestionEditor({ taskId, question, onClose }: QuestionEditorProps) {
  const formId = useId();
  const create = useCreateQuestion(taskId);
  const update = useUpdateQuestion(taskId);
  const toast = useToast();
  const mutation = question ? update : create;
  const [draft, setDraft] = useState<Draft>(() => draftOf(question));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = contentOf(draft, question);
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const done = () => {
      toast.show(question ? 'Вопрос сохранён новой версией' : 'Вопрос добавлен', {
        tone: 'success',
      });
      onClose();
    };
    if (question) {
      update.mutate({ key: question.key, content: result.content }, { onSuccess: done });
    } else {
      create.mutate(result.content, { onSuccess: done });
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={question ? 'Изменить вопрос' : 'Новый вопрос'}
      description={
        question
          ? 'Сохранится новой версией: начатые попытки остаются со старой.'
          : 'Четыре разных варианта и один верный.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={mutation.isPending}>
            Сохранить
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit}>
        <Stack gap="md">
          {mutation.isError && <Notice tone="danger">{errorText(mutation.error)}</Notice>}
          <Field label="Вопрос" required error={errors['text']}>
            <Textarea
              rows={3}
              maxLength={1000}
              value={draft.text}
              onChange={(event) => set('text', event.currentTarget.value)}
            />
          </Field>
          {OPTION_IDS.map((id) => (
            <Field
              key={id}
              label={`Вариант ${OPTION_LETTER[id]}`}
              required
              error={errors[`option.${id}`]}
            >
              <TextInput
                value={draft.options[id]}
                maxLength={300}
                onChange={(event) =>
                  set('options', { ...draft.options, [id]: event.currentTarget.value })
                }
              />
            </Field>
          ))}
          {errors['options'] && <Notice tone="danger">{errors['options']}</Notice>}
          <SegmentedControl
            label="Верный ответ"
            options={OPTION_IDS.map((id) => ({ value: id, label: OPTION_LETTER[id] }))}
            value={draft.correct}
            onChange={(value) => set('correct', value)}
          />
          <Field
            label="Картинка"
            hint="Путь внутри материалов урока, например quiz/apple.png. Пусто — без картинки."
            error={errors['image']}
          >
            <TextInput
              value={draft.image}
              spellCheck={false}
              onChange={(event) => set('image', event.currentTarget.value)}
            />
          </Field>
          <Inline align="start">
            <Field label="Фрагмент: начало" hint="м:сс" error={errors['evidence']}>
              <TextInput
                value={draft.start}
                inputMode="numeric"
                onChange={(event) => set('start', event.currentTarget.value)}
              />
            </Field>
            <Field label="Фрагмент: конец" hint="м:сс">
              <TextInput
                value={draft.end}
                inputMode="numeric"
                onChange={(event) => set('end', event.currentTarget.value)}
              />
            </Field>
          </Inline>
          <Field label="Цитата из урока" hint="Что в видео объясняет ответ (необязательно).">
            <Textarea
              rows={2}
              maxLength={1000}
              value={draft.quote}
              onChange={(event) => set('quote', event.currentTarget.value)}
            />
          </Field>
        </Stack>
      </form>
    </Modal>
  );
}
