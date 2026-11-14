// Users as the admin manages them (FEAT-004 endpoints): list, create, change, deactivate.
import type { UserDto } from '@questclass/shared/auth/dto';
import type { UserCreateRequest, UserUpdateRequest } from '@questclass/shared/auth/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

export const userKeys = {
  all: ['admin', 'users'] as const,
};

export function useUsers() {
  return useQuery({
    queryKey: userKeys.all,
    queryFn: () => api<UserDto[]>('/api/admin/users'),
  });
}

/** Learners for pickers of the admin screens; deactivated ones are kept apart at the end. */
export function useLearners() {
  const users = useUsers();
  const learners = users.data
    ?.filter((user) => user.role === 'learner')
    .sort((a, b) => Number(b.active) - Number(a.active) || a.id - b.id);
  return { ...users, data: learners };
}

export function useCreateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UserCreateRequest) =>
      api<UserDto>('/api/admin/users', { method: 'POST', json: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useUpdateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UserUpdateRequest }) =>
      api<UserDto>(`/api/admin/users/${id}`, { method: 'PATCH', json: patch }),
    onSuccess: () => client.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export const ROLE_LABEL: Readonly<Record<UserDto['role'], string>> = {
  admin: 'Взрослый',
  learner: 'Ученик',
};
