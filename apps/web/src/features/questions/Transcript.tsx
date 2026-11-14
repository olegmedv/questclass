// The lesson's transcript, read-only: it comes with the import (YouTube subtitles or speech
// recognition on the admin's computer) and backs the evidence fragments of the questions.
import type { TranscriptDto, TranscriptSegment } from '@questclass/shared/questions/schema';
import { Accordion, Card, formatTime, Stack, Text } from '@questclass/ui';
import { formatDateTime } from '../admin/forms';

const SOURCE_LABEL: Readonly<Record<TranscriptDto['source'], string>> = {
  youtube: 'субтитры YouTube',
  whisper: 'распознавание речи',
  manual: 'вручную',
};

/** Text of the segments that overlap `start..end`, or null when there are none. */
export function fragmentOf(
  segments: readonly TranscriptSegment[],
  range: { start: number; end: number },
): string | null {
  const text = segments
    .filter((segment) => segment.end > range.start && segment.start < range.end)
    .map((segment) => segment.text.trim())
    .filter((line) => line !== '')
    .join(' ');
  return text === '' ? null : text;
}

/** The newest transcript of the task (the one the current video goes with). */
export function latestTranscript(transcripts: readonly TranscriptDto[]): TranscriptDto | null {
  return transcripts.reduce<TranscriptDto | null>(
    (latest, item) => (!latest || item.createdAt > latest.createdAt ? item : latest),
    null,
  );
}

export function TranscriptView({ transcript }: { transcript: TranscriptDto | null }) {
  if (!transcript) {
    return (
      <Card title="Расшифровка">
        <Text tone="muted">Расшифровки нет: она приходит вместе с уроком из lesson-prep.</Text>
      </Card>
    );
  }
  return (
    <Card
      title="Расшифровка"
      description={`${SOURCE_LABEL[transcript.source]}, язык ${transcript.lang}, загружена ${formatDateTime(transcript.createdAt)}. Только чтение.`}
    >
      <Accordion
        items={[
          {
            id: 'segments',
            title: `Показать текст (${transcript.segments.length} фрагм.)`,
            content: (
              <Stack as="ol" gap="xs" aria-label="Фрагменты расшифровки">
                {transcript.segments.map((segment, index) => (
                  <li key={index}>
                    <Text as="span" tone="muted" size="sm">
                      {formatTime(segment.start)}
                    </Text>{' '}
                    <Text as="span">{segment.text}</Text>
                  </li>
                ))}
              </Stack>
            ),
          },
        ]}
      />
    </Card>
  );
}
