// Installation settings and secrets (FEAT-052 endpoints). Labels and field types come from the
// shared registry; the API carries values only. A secret's value is never read back.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

/** `GET /api/admin/settings`: one entry per registered setting. */
export interface SettingEntryDto {
  readonly key: string;
  readonly value: unknown;
  readonly default: unknown;
  readonly isDefault: boolean;
  /** ISO 8601, null while the default is in effect. */
  readonly updatedAt: string | null;
}

/** `GET /api/admin/secrets`: whether a secret is set, never its value. */
export interface SecretStatusDto {
  readonly key: string;
  readonly isSet: boolean;
  readonly updatedAt: string | null;
}

export const settingsKeys = {
  settings: ['admin', 'settings'] as const,
  secrets: ['admin', 'secrets'] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.settings,
    queryFn: () => api<SettingEntryDto[]>('/api/admin/settings'),
  });
}

/** Saves the changed keys at once: one invalid value rolls the whole form back. */
export function useSaveSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api<SettingEntryDto[]>('/api/admin/settings', { method: 'PUT', json: values }),
    onSuccess: (entries) => client.setQueryData(settingsKeys.settings, entries),
  });
}

export function useSecrets() {
  return useQuery({
    queryKey: settingsKeys.secrets,
    queryFn: () => api<SecretStatusDto[]>('/api/admin/secrets'),
  });
}

export function useSetSecret() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api<SecretStatusDto>(`/api/admin/secrets/${encodeURIComponent(key)}`, {
        method: 'PUT',
        json: { value },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: settingsKeys.secrets }),
  });
}

export function useClearSecret() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      api<SecretStatusDto>(`/api/admin/secrets/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: settingsKeys.secrets }),
  });
}
