// A test from text or JSON (pasted, a file, or an answer of an AI chat): recognised in the
// browser first, so the admin checks the questions with the correct answers marked before saving.
import { parseQuestionImport, QuestionImportError } from '@questclass/shared/questions/importText';
import type { QuestionContent } from '@questclass/shared/questions/schema';
import {
  Accordion,
  Button,
  Copy,
  Field,
  FileInput,
  Inline,
  Modal,
  Notice,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@questclass/ui';
import { useId, useState, type FormEvent } from 'react';
import { errorText } from '../admin/forms';
import { useImportQuestions } from './queries';
import { QuestionView } from './QuestionView';

/** The prompt for an AI chat (spec/01 §2.4, the original's `aiPrompt`). */
export const AI_PROMPT =
  'Составь тест по этому уроку: 8 вопросов, в каждом ровно 4 разных варианта и один верный ответ. Уровень — 2 класс. Без двусмысленных вопросов. Верни только текст в формате: номер и текст вопроса, затем А) вариант, Б) вариант, В) вариант, Г) вариант, затем отдельной строкой «Ответ: Б». Между вопросами пустая строка. Не пиши объяснения после строки ответа.';

const SAMPLE_TEXT = `1. Сколько десятков в числе 47?
А) 4
Б) 7
В) 47
Г) 11
Ответ: А

2. Сколько будет 8 + 5?
А) 12
Б) 13
В) 14
Г) 3
Ответ: Б

3. Сколько будет 30 − 10?
А) 10
Б) 40
В) 20
Г) 3
Ответ: В`;

const SAMPLE_JSON = JSON.stringify(
  {
    questions: [
      { question: 'Сколько десятков в числе 47?', options: ['4', '7', '47', '11'], correct: 0 },
    ],
  },
  null,
  2,
);

/** Test files: text, Markdown or JSON, at most 500 KB (spec/01 §2.4). */
export const MAX_TEST_FILE_BYTES = 500 * 1024;
const TEST_FILE = /\.(txt|md|markdown|json)$/i;

/** Text of a test file, or a message why it cannot be used. */
export async function readTestFile(file: File): Promise<{ text: string } | { error: string }> {
  if (!TEST_FILE.test(file.name)) return { error: 'Нужен файл .txt, .md или .json' };
  if (file.size > MAX_TEST_FILE_BYTES) return { error: 'Файл больше 500 КБ' };
  const text = await file.text();
  if (text.trim() === '') return { error: 'Файл пустой' };
  if (text.includes('\0')) return { error: 'Сохраните файл в кодировке UTF-8' };
  return { text: text.replace(/^\uFEFF/, '') };
}

type Preview = { questions: QuestionContent[] } | { error: string } | null;

function recognise(text: string): Preview {
  if (text.trim() === '') return null;
  try {
    return { questions: parseQuestionImport(text) };
  } catch (err) {
    if (err instanceof QuestionImportError) return { error: err.message };
    throw err;
  }
}

export interface QuestionImportProps {
  readonly taskId: number;
  /** Questions in the bank now (replacing archives them). */
  readonly current: number;
  readonly onClose: () => void;
}

export function QuestionImport({ taskId, current, onClose }: QuestionImportProps) {
  const formId = useId();
  const importQuestions = useImportQuestions(taskId);
  const toast = useToast();
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [preview, setPreview] = useState<Preview>(null);

  const copy = (value: string, done: string) => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => toast.show(done, { tone: 'success' }))
      .catch(() => toast.show('Не получилось скопировать', { tone: 'error' }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!preview || 'error' in preview) {
      setPreview(recognise(text) ?? { error: 'Вставьте тест или выберите файл' });
      return;
    }
    importQuestions.mutate(
      { content: text, append: mode === 'append' },
      {
        onSuccess: (saved) => {
          toast.show(`Сохранено вопросов: ${saved.length}`, { tone: 'success' });
          onClose();
        },
      },
    );
  };

  const ready = preview !== null && 'questions' in preview;
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Загрузить тест"
      description="Текст или JSON: из файла, из чата с нейросетью или набранный вручную."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={importQuestions.isPending}>
            {ready ? `Сохранить ${preview.questions.length} вопр.` : 'Распознать вопросы'}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit}>
        <Stack gap="md">
          <Inline>
            <Button
              icon={<Copy aria-hidden="true" />}
              onClick={() => copy(AI_PROMPT, 'Промпт скопирован')}
            >
              Промпт для нейросети
            </Button>
          </Inline>
          <Field label="Файл теста" hint="TXT, MD или JSON, до 500 КБ." error={fileError}>
            <FileInput
              accept=".txt,.md,.markdown,.json,text/plain,application/json"
              onChange={(files) => {
                const file = files[0];
                if (!file) return;
                void readTestFile(file).then((result) => {
                  if ('error' in result) {
                    setFileError(result.error);
                    return;
                  }
                  setFileError('');
                  setText(result.text);
                  setPreview(recognise(result.text));
                });
              }}
            />
          </Field>
          <Field label="Или вставьте готовый тест">
            <Textarea
              rows={8}
              value={text}
              spellCheck={false}
              onChange={(event) => {
                setText(event.currentTarget.value);
                setPreview(null);
              }}
            />
          </Field>
          <Accordion
            items={[
              {
                id: 'sample',
                title: 'Показать образец текста и JSON',
                content: (
                  <Stack gap="sm">
                    <Textarea readOnly rows={8} value={SAMPLE_TEXT} aria-label="Образец текста" />
                    <Textarea readOnly rows={6} value={SAMPLE_JSON} aria-label="Образец JSON" />
                  </Stack>
                ),
              },
            ]}
          />
          <SegmentedControl
            label="Что сделать с вопросами урока"
            options={[
              { value: 'replace', label: `Заменить (${current})` },
              { value: 'append', label: 'Добавить к ним' },
            ]}
            value={mode}
            onChange={setMode}
          />
          {preview && 'error' in preview && <Notice tone="danger">{preview.error}</Notice>}
          {importQuestions.isError && (
            <Notice tone="danger">{errorText(importQuestions.error)}</Notice>
          )}
          {ready && (
            <Stack gap="md" aria-label="Предпросмотр">
              <Text weight="bold">Проверьте: {preview.questions.length} вопр.</Text>
              {preview.questions.map((question, index) => (
                <Stack key={index} gap="xs">
                  <Text tone="muted" size="sm">
                    Вопрос {index + 1}
                  </Text>
                  <QuestionView question={question} />
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      </form>
    </Modal>
  );
}
