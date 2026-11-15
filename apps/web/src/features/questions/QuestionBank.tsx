// The question bank of a task: current versions, their history, the archive, adding, changing
// and importing. Used by the admin sections of the types that ask questions (quiz, video lesson).
import type { QuestionDto } from '@questclass/shared/questions/schema';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Inline,
  Modal,
  Pencil,
  Plus,
  Stack,
  Switch,
  Text,
  useToast,
} from '@questclass/ui';
import { useState } from 'react';
import { errorText, formatDateTime } from '../admin/forms';
import { useArchiveQuestion, useQuestions, useQuestionVersions, useTranscripts } from './queries';
import { QuestionEditor } from './QuestionEditor';
import { QuestionImport } from './QuestionImport';
import { QuestionView } from './QuestionView';
import { fragmentOf, latestTranscript, TranscriptView } from './Transcript';

const SOURCE_LABEL: Readonly<Record<QuestionDto['source'], string>> = {
  import: 'из импорта',
  admin: 'правка родителя',
};

function Versions({
  taskId,
  question,
  onClose,
}: {
  taskId: number;
  question: QuestionDto;
  onClose: () => void;
}) {
  const versions = useQuestionVersions(taskId, question.key);
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`История вопроса «${question.key}»`}
      description="Каждая правка — новая версия. Попытки учеников хранят ту, что им досталась."
    >
      {versions.isPending ? (
        <Card loading />
      ) : versions.isError ? (
        <EmptyState
          tone="error"
          title="Не получилось загрузить"
          description={errorText(versions.error)}
        />
      ) : (
        <Stack gap="md">
          {[...versions.data].reverse().map((version) => (
            <Card
              key={version.id}
              as="article"
              headingLevel={3}
              title={`Версия ${version.version}`}
              description={`${SOURCE_LABEL[version.source]}, ${formatDateTime(version.createdAt)}${version.archivedAt ? `, в архиве с ${formatDateTime(version.archivedAt)}` : ''}`}
            >
              <QuestionView question={version} />
            </Card>
          ))}
        </Stack>
      )}
    </Modal>
  );
}

export interface QuestionBankProps {
  readonly taskId: number;
  /** Show the transcript and its lines under the evidence fragments (lessons with a video). */
  readonly withTranscript?: boolean;
}

export function QuestionBank({ taskId, withTranscript = false }: QuestionBankProps) {
  const [showArchive, setShowArchive] = useState(false);
  const questions = useQuestions(taskId, showArchive);
  const transcripts = useTranscripts(taskId);
  const archive = useArchiveQuestion(taskId);
  const toast = useToast();
  const [editing, setEditing] = useState<QuestionDto | 'new' | null>(null);
  const [history, setHistory] = useState<QuestionDto | null>(null);
  const [importing, setImporting] = useState(false);
  const [toArchive, setToArchive] = useState<QuestionDto | null>(null);
  const transcript = withTranscript && transcripts.data ? latestTranscript(transcripts.data) : null;
  const live = (questions.data ?? []).filter((question) => question.archivedAt === null);

  return (
    <Stack gap="md">
      <Card
        title="Вопросы"
        description={
          questions.data
            ? `В банке ${live.length} вопр. В каждой попытке — случайные из них (настройка «Тест: вопросов в попытке»).`
            : undefined
        }
        actions={
          <Inline>
            <Button size="sm" icon={<Plus aria-hidden="true" />} onClick={() => setEditing('new')}>
              Добавить вопрос
            </Button>
            <Button size="sm" onClick={() => setImporting(true)}>
              Загрузить тест
            </Button>
          </Inline>
        }
      >
        <Stack gap="md">
          <Switch
            label="Показать архив"
            description="Вопросы, убранные из банка; их история сохраняется."
            checked={showArchive}
            onChange={setShowArchive}
          />
          {questions.isPending ? (
            <Card loading />
          ) : questions.isError ? (
            <EmptyState
              tone="error"
              title="Не получилось загрузить вопросы"
              description={errorText(questions.error)}
            />
          ) : questions.data.length === 0 ? (
            <EmptyState
              title="Вопросов пока нет"
              description="Добавьте их по одному или загрузите тест текстом."
            />
          ) : (
            <Stack as="ol" gap="md" aria-label="Банк вопросов">
              {questions.data.map((question, index) => (
                <li key={question.id}>
                  <Card
                    as="article"
                    tone={question.archivedAt ? 'default' : 'raised'}
                    headingLevel={3}
                    title={`Вопрос ${index + 1}`}
                    description={
                      <>
                        <Badge>v{question.version}</Badge>{' '}
                        <Badge tone={question.source === 'admin' ? 'info' : 'neutral'}>
                          {SOURCE_LABEL[question.source]}
                        </Badge>
                        {question.state === 'pending' && (
                          <>
                            {' '}
                            <Badge tone="warning">ждёт ревизии</Badge>
                          </>
                        )}
                        {question.archivedAt && (
                          <>
                            {' '}
                            <Badge>в архиве</Badge>
                          </>
                        )}
                      </>
                    }
                  >
                    <Stack gap="sm">
                      <QuestionView
                        question={question}
                        fragment={
                          transcript && question.evidence
                            ? fragmentOf(transcript.segments, question.evidence)
                            : null
                        }
                      />
                      <Inline>
                        {!question.archivedAt && (
                          <Button
                            size="sm"
                            icon={<Pencil aria-hidden="true" />}
                            aria-label={`Изменить вопрос ${index + 1}`}
                            onClick={() => setEditing(question)}
                          >
                            Изменить
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`История вопроса ${index + 1}`}
                          onClick={() => setHistory(question)}
                        >
                          История
                        </Button>
                        {!question.archivedAt && (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`В архив: вопрос ${index + 1}`}
                            onClick={() => setToArchive(question)}
                          >
                            В архив
                          </Button>
                        )}
                      </Inline>
                    </Stack>
                  </Card>
                </li>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>
      {withTranscript && <TranscriptView transcript={transcript} />}
      {editing && (
        <QuestionEditor
          taskId={taskId}
          question={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {history && <Versions taskId={taskId} question={history} onClose={() => setHistory(null)} />}
      {importing && (
        <QuestionImport taskId={taskId} current={live.length} onClose={() => setImporting(false)} />
      )}
      <Modal
        open={toArchive !== null}
        onClose={() => setToArchive(null)}
        title="Убрать вопрос в архив?"
        description="Новые попытки его не получат; история и прошлые попытки остаются."
        footer={
          <>
            <Button variant="ghost" onClick={() => setToArchive(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              loading={archive.isPending}
              onClick={() => {
                if (!toArchive) return;
                archive.mutate(toArchive.key, {
                  onSettled: () => setToArchive(null),
                  onSuccess: () => toast.show('Вопрос в архиве', { tone: 'success' }),
                  onError: (error) => toast.show(errorText(error), { tone: 'error' }),
                });
              }}
            >
              В архив
            </Button>
          </>
        }
      />
      {archive.isError && <Text tone="danger">{errorText(archive.error)}</Text>}
    </Stack>
  );
}
