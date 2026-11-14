// Import tokens of lesson-prep and revisions of imported lessons (FEAT-012 endpoints).
import type { ImportTokenDto, IssuedImportTokenDto } from '@questclass/shared/import/manifest';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

export const importKeys = {
  tokens: ['admin', 'import-tokens'] as const,
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
