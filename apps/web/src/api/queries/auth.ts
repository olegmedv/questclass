// Auth, setup and trusted-device queries (FEAT-004 endpoints).
import type { DeviceDto, MeDto, ProfileDto, SetupStatusDto } from '@questclass/shared/auth/dto';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, isApiError } from '../client';

/** Bodies of the auth endpoints; the server validates them with the shared zod schemas. */
export interface SetupInput {
  readonly token: string;
  readonly login: string;
  readonly password: string;
  readonly name?: string;
}
export interface AdminLoginInput {
  readonly login: string;
  readonly password: string;
}
export interface LearnerLoginInput {
  readonly userId: number;
  readonly pin: string;
}

export const authKeys = {
  me: ['auth', 'me'] as const,
  setup: ['auth', 'setup'] as const,
  profiles: ['auth', 'profiles'] as const,
  devices: ['auth', 'devices'] as const,
};

/** The signed-in user, or `null` when there is no valid session (401). */
export async function fetchMe(): Promise<MeDto | null> {
  try {
    return await api<MeDto>('/api/auth/me');
  } catch (err) {
    if (isApiError(err) && err.status === 401) {
      return null;
    }
    throw err;
  }
}

export function useMe() {
  return useQuery({ queryKey: authKeys.me, queryFn: fetchMe, staleTime: 60_000 });
}

export function useSetupStatus() {
  return useQuery({
    queryKey: authKeys.setup,
    queryFn: () => api<SetupStatusDto>('/api/setup'),
    staleTime: Infinity,
  });
}

/** Learner profiles of this device, or `null` when the device is not trusted (403). */
export async function fetchProfiles(): Promise<ProfileDto[] | null> {
  try {
    return await api<ProfileDto[]>('/api/auth/profiles');
  } catch (err) {
    if (isApiError(err) && err.status === 403) {
      return null;
    }
    throw err;
  }
}

export function useProfiles() {
  return useQuery({ queryKey: authKeys.profiles, queryFn: fetchProfiles });
}

export function useDevices() {
  return useQuery({
    queryKey: authKeys.devices,
    queryFn: () => api<DeviceDto[]>('/api/auth/devices'),
  });
}

/** After any change of the session the cached user is replaced and everything else refetched. */
function signedIn(client: QueryClient, me: MeDto | null): void {
  client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
  client.setQueryData(authKeys.me, me);
}

export function useSetup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SetupInput) => api<MeDto>('/api/setup', { method: 'POST', json: input }),
    onSuccess: (me) => {
      client.setQueryData<SetupStatusDto>(authKeys.setup, { needed: false });
      signedIn(client, me);
    },
  });
}

export function useAdminLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminLoginInput) =>
      api<MeDto>('/api/auth/login', { method: 'POST', json: input }),
    onSuccess: (me) => signedIn(client, me),
  });
}

export function useLearnerLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LearnerLoginInput) =>
      api<MeDto>('/api/auth/learner-login', { method: 'POST', json: input }),
    onSuccess: (me) => signedIn(client, me),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<undefined>('/api/auth/logout', { method: 'POST' }),
    onSettled: () => signedIn(client, null),
  });
}

/** «Сделать устройство детским»: the server sets the long-lived device cookie. */
export function useTrustDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<DeviceDto>('/api/auth/devices', { method: 'POST', json: { name } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: authKeys.devices });
      void client.invalidateQueries({ queryKey: authKeys.profiles });
    },
  });
}

export function useRevokeDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<DeviceDto>(`/api/auth/devices/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: authKeys.devices });
      void client.invalidateQueries({ queryKey: authKeys.profiles });
    },
  });
}
