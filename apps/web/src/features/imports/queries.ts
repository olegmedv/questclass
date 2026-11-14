// Import tokens of lesson-prep and revisions of imported lessons (FEAT-012 endpoints).
import type {
  ImportTokenDto,
  IssuedImportTokenDto,
  RevisionDetailDto,
  RevisionSummaryDto,
} from '@questclass/shared/import/manifest';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

export const importKeys = {
  tokens: ['admin', 'import-tokens'] as const,
  revisions: ['admin', 'task-revisions'] as const,
  revisionList: (pendingOnly: boolean) => ['admin', 'task-revisions', 'list', pendingOnly] as const,
  revision: (id: number) => ['admin', 'task-revisions', 'one', id] as const,
};

export function useImportTokens() {
  return useQuery({
    queryKey: importKeys.tokens,
    queryFn: () => api<ImportTokenDto[]>('/api/admin/import-tokens'),
  });
}

/** The answer carries the token itself, once: it is never shown again. */
export function useIssueImportToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<IssuedImportTokenDto>('/api/admin/import-tokens', { method: 'POST', json: { name } }),
    onSuccess: () => client.invalidateQueries({ queryKey: importKeys.tokens }),
  });
}

export function useRevokeImportToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<undefined>(`/api/admin/import-tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: importKeys.tokens }),
  });
}

/** Revisions of published lessons that a new import proposed. */
export function useRevisions(pendingOnly: boolean) {
  return useQuery({
    queryKey: importKeys.revisionList(pendingOnly),
    queryFn: () =>
      api<RevisionSummaryDto[]>(`/api/admin/task-revisions${pendingOnly ? '?status=pending' : ''}`),
  });
}

export function useRevision(id: number) {
  return useQuery({
    queryKey: importKeys.revision(id),
    queryFn: () => api<RevisionDetailDto>(`/api/admin/task-revisions/${id}`),
  });
}

/** «Принять» or «Отклонить»: the lesson, its questions and the lists change. */
export function useDecideRevision(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (decision: 'acceptance' | 'rejection') =>
      api<RevisionSummaryDto>(`/api/admin/task-revisions/${id}/${decision}`, { method: 'POST' }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: importKeys.revisions }),
        client.invalidateQueries({ queryKey: ['admin', 'tasks'] }),
        client.invalidateQueries({ queryKey: ['admin', 'questions'] }),
      ]),
  });
}
