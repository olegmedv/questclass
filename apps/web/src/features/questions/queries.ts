// Question banks (versioned) and transcripts of a task (FEAT-054 endpoints). Admin only: the
// answers are included.
import type {
  QuestionContent,
  QuestionDto,
  TranscriptDto,
} from '@questclass/shared/questions/schema';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

export const questionKeys = {
  all: (taskId: number) => ['admin', 'questions', taskId] as const,
  bank: (taskId: number, archived: boolean) => ['admin', 'questions', taskId, archived] as const,
  versions: (taskId: number, key: string) =>
    ['admin', 'questions', taskId, 'versions', key] as const,
  transcripts: (taskId: number) => ['admin', 'transcripts', taskId] as const,
};

/** The current version of every question; with `archived`, the archived ones too. */
export function useQuestions(taskId: number, archived = false) {
  return useQuery({
    queryKey: questionKeys.bank(taskId, archived),
    queryFn: () =>
      api<QuestionDto[]>(`/api/admin/tasks/${taskId}/questions${archived ? '?archived=true' : ''}`),
  });
}

export function useQuestionVersions(taskId: number, key: string | null) {
  return useQuery({
    queryKey: questionKeys.versions(taskId, key ?? ''),
    queryFn: () =>
      api<QuestionDto[]>(
        `/api/admin/tasks/${taskId}/questions/${encodeURIComponent(key ?? '')}/versions`,
      ),
    enabled: key !== null,
  });
}

function bankChanged(client: QueryClient, taskId: number) {
  // The bank size decides whether the task can be published.
  return Promise.all([
    client.invalidateQueries({ queryKey: questionKeys.all(taskId) }),
    client.invalidateQueries({ queryKey: ['admin', 'tasks'] }),
  ]);
}

export function useCreateQuestion(taskId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (content: QuestionContent) =>
      api<QuestionDto>(`/api/admin/tasks/${taskId}/questions`, { method: 'POST', json: content }),
    onSuccess: () => bankChanged(client, taskId),
  });
}

/** A change makes a new version; attempts keep the snapshot they were given. */
export function useUpdateQuestion(taskId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, content }: { key: string; content: QuestionContent }) =>
      api<QuestionDto>(`/api/admin/tasks/${taskId}/questions/${encodeURIComponent(key)}`, {
        method: 'PUT',
        json: content,
      }),
    onSuccess: () => bankChanged(client, taskId),
  });
}

export function useArchiveQuestion(taskId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      api<undefined>(`/api/admin/tasks/${taskId}/questions/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => bankChanged(client, taskId),
  });
}

export function useImportQuestions(taskId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { content: string; append: boolean }) =>
      api<QuestionDto[]>(`/api/admin/tasks/${taskId}/question-imports`, {
        method: 'POST',
        json: input,
      }),
    onSuccess: () => bankChanged(client, taskId),
  });
}

export function useTranscripts(taskId: number) {
  return useQuery({
    queryKey: questionKeys.transcripts(taskId),
    queryFn: () => api<TranscriptDto[]>(`/api/admin/tasks/${taskId}/transcripts`),
  });
}
