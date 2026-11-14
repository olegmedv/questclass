/**
 * Parses a test pasted by the admin (or produced by an AI chat) into question contents.
 * Two formats, detected from the content (README of the original, «Test import format»):
 *
 * - plain text: a numbered question, options `А)`–`Г)` (or `A)`–`D)`), then `Ответ: Б`;
 * - JSON: `{ "questions": [{ "question": "...", "options": [...4], "correct": "Б" }] }` or a
 *   bare array; a numeric `correct` is a zero-based index.
 *
 * Errors are thrown as `QuestionImportError` with a message for the admin (Russian UI).
 */
import { OPTION_IDS, questionContentSchema, type QuestionContent } from './schema';

export const MIN_IMPORT_QUESTIONS = 3;
export const MAX_IMPORT_QUESTIONS = 30;

export class QuestionImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuestionImportError';
  }
}

/** A question before validation: whatever the source gave us. */
interface RawQuestion {
  readonly text: string;
  readonly options: readonly RawOption[];
  readonly correct: unknown;
  readonly image?: unknown;
  readonly evidence?: unknown;
}

interface RawOption {
  readonly text: string;
  readonly id?: string;
  readonly image?: unknown;
}

/** Latin and Cyrillic option letters (and 1–4) → option index. */
const LETTER_INDEX: Readonly<Record<string, number>> = {
  A: 0,
  А: 0,
  B: 1,
  Б: 1,
  C: 2,
  В: 2,
  D: 3,
  Г: 3,
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
};

const HEADING = [/^(?:вопрос\s*)?\d+\s*[.)\-:]\s*(.+)$/i, /^вопрос\s*\d+\s*[:.]?\s*(.+)$/i];
const OPTION = /^([a-dа-г])\s*[.)\-:]\s*(.+)$/i;
const ANSWER = /^(?:правильный\s+ответ|ответ|correct(?:\s+answer)?)\s*[:-]\s*(.+)$/i;
/** Lines allowed before the first question (titles). */
const PREAMBLE = /^(?:#|тест|тема)/i;

/** Removes a surrounding ``` fence (```json / ```text) and surrounding whitespace. */
function unfence(input: string): string {
  return input
    .replace(/^\uFEFF/, '') // byte order mark of a file saved by Notepad
    .trim()
    .replace(/^```(?:json|text)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function parseText(body: string): RawQuestion[] {
  const out: RawQuestion[] = [];
  let current: { text: string; options: (string | undefined)[]; correct?: string } | null = null;
  const flush = () => {
    if (current) {
      out.push({
        text: current.text,
        // Array.from also visits holes left by a skipped letter.
        options: Array.from(current.options, (text) => ({ text: text ?? '' })),
        correct: current.correct,
      });
    }
  };

  const lines = body
    .split(/\r?\n/)
    .map((line) => line.replace(/\*\*/g, '').trim())
    .filter((line) => line !== '');
  for (const line of lines) {
    const answer = ANSWER.exec(line);
    if (answer && current) {
      if (current.correct !== undefined) {
        throw new QuestionImportError('В вопросе несколько строк ответа. Оставьте одну.');
      }
      current.correct = (answer[1] ?? '').replace(/[.\s]+$/, '');
      continue;
    }
    const option = OPTION.exec(line);
    if (option && current) {
      const index = LETTER_INDEX[(option[1] ?? '').toUpperCase()] ?? -1;
      if (current.options[index] !== undefined) {
        throw new QuestionImportError('В вопросе повторяется буква варианта ответа.');
      }
      current.options[index] = option[2] ?? '';
      continue;
    }
    const heading = HEADING.map((re) => re.exec(line)).find((m) => m !== null);
    if (heading) {
      flush();
      current = { text: heading[1] ?? '', options: [] };
      continue;
    }
    if (current && current.options.length === 0) {
      current.text += ` ${line}`; // a question spread over several lines
      continue;
    }
    if (!current && PREAMBLE.test(line)) {
      continue;
    }
    throw new QuestionImportError(
      `Не распознана строка: «${line.slice(0, 80)}». Используйте образец формата.`,
    );
  }
  flush();
  return out;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function jsonOption(value: unknown): RawOption {
  if (isRecord(value)) {
    const text = value['text'] ?? value['label'];
    return {
      text: typeof text === 'string' ? text : '',
      ...(typeof value['id'] === 'string' && { id: value['id'] }),
      ...(value['image'] !== undefined && { image: value['image'] }),
    };
  }
  return { text: typeof value === 'string' || typeof value === 'number' ? String(value) : '' };
}

/** `helpVideo` of the original ({startSeconds, endSeconds, quote}) or our `evidence`. */
function jsonEvidence(item: Record<string, unknown>): unknown {
  const help = item['helpVideo'];
  if (isRecord(help)) {
    return { start: help['startSeconds'], end: help['endSeconds'], quote: help['quote'] ?? null };
  }
  return item['evidence'];
}

function parseJson(body: string): RawQuestion[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new QuestionImportError('JSON не читается. Проверьте запятые и кавычки.');
  }
  const list = Array.isArray(data) ? data : isRecord(data) ? data['questions'] : undefined;
  if (!Array.isArray(list)) {
    throw new QuestionImportError('В JSON нужен массив questions.');
  }
  return list.map((item: unknown) => {
    const q = isRecord(item) ? item : {};
    const text = q['text'] ?? q['question'];
    const options = q['options'] ?? q['answers'];
    const optionList: unknown[] = Array.isArray(options)
      ? options
      : isRecord(options)
        ? Object.values(options)
        : [];
    return {
      text: typeof text === 'string' ? text : '',
      options: optionList.map(jsonOption),
      correct: q['correct'] ?? q['correctAnswer'] ?? q['answer'],
      image: q['image'],
      evidence: jsonEvidence(q),
    };
  });
}

/** Original images are `{src, alt}`; ours are plain paths. */
const imagePath = (value: unknown): unknown =>
  isRecord(value) && typeof value['src'] === 'string' ? value['src'] : value;

/** Resolves the answer: a letter or 1–4, else the exact option text, else an option id. */
function correctIndex(raw: RawQuestion): number {
  if (typeof raw.correct === 'number') {
    return Number.isInteger(raw.correct) ? raw.correct : -1;
  }
  const answer = typeof raw.correct === 'string' ? raw.correct.trim() : '';
  const byLetter = LETTER_INDEX[answer.toUpperCase()];
  if (byLetter !== undefined) {
    return byLetter;
  }
  const byText = raw.options.findIndex((o) => o.text.trim() === answer);
  return byText >= 0 ? byText : raw.options.findIndex((o) => o.id === answer);
}

function normalize(raw: RawQuestion, index: number): QuestionContent {
  const label = `Вопрос ${index + 1}`;
  if (raw.text.trim() === '' || raw.options.length !== OPTION_IDS.length) {
    throw new QuestionImportError(`${label}: нужны текст и четыре варианта.`);
  }
  const correct = correctIndex(raw);
  const correctId = OPTION_IDS[correct];
  if (correctId === undefined) {
    throw new QuestionImportError(`${label}: не найден правильный ответ. Укажите А, Б, В или Г.`);
  }
  const parsed = questionContentSchema.safeParse({
    text: raw.text,
    options: raw.options.map((option, i) => ({
      id: OPTION_IDS[i],
      text: option.text,
      ...(option.image !== undefined && { image: imagePath(option.image) }),
    })),
    correct: correctId,
    ...(raw.image !== undefined && raw.image !== null && { image: imagePath(raw.image) }),
    ...(raw.evidence !== undefined && raw.evidence !== null && { evidence: raw.evidence }),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new QuestionImportError(`${label}: ${issue?.message ?? 'некорректные данные'}.`);
  }
  return parsed.data;
}

/** Parses text or JSON into 3–30 validated questions. */
export function parseQuestionImport(input: string): QuestionContent[] {
  const body = unfence(input);
  if (body === '') {
    throw new QuestionImportError('Вставьте текст или выберите файл.');
  }
  const raw = body.startsWith('{') || body.startsWith('[') ? parseJson(body) : parseText(body);
  if (raw.length < MIN_IMPORT_QUESTIONS || raw.length > MAX_IMPORT_QUESTIONS) {
    throw new QuestionImportError(
      `В тесте должно быть от ${MIN_IMPORT_QUESTIONS} до ${MAX_IMPORT_QUESTIONS} вопросов.`,
    );
  }
  return raw.map(normalize);
}
