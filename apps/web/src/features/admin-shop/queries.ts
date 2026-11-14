// The shared catalog (FEAT-017), the admin's pictures (FEAT-018) and handing out wishes and
// Robux (FEAT-020).
import type {
  CatalogItemCreateRequest,
  CatalogItemDto,
  CatalogItemUpdateRequest,
  CatalogLibraryDto,
  ItemKind,
} from '@questclass/shared/catalog/dto';
import type {
  FulfillmentRequest,
  LearnerWishesDto,
  ReceiptDto,
} from '@questclass/shared/wishes/dto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';

/** `GET /api/admin/uploads`: a picture the admin uploaded. */
export interface UploadDto {
  readonly id: number;
  readonly url: string;
  readonly mime: string;
  /** A sound replaces a built-in sound only («Оформление»); pictures are offered everywhere else. */
  readonly kind: 'image' | 'audio';
  readonly sizeBytes: number;
  readonly animated: boolean;
  readonly durationMs: number | null;
  readonly createdAt: string;
}

export const shopKeys = {
  library: ['admin', 'catalog', 'library'] as const,
  items: ['admin', 'catalog', 'items'] as const,
  list: (kind: ItemKind | null) => ['admin', 'catalog', 'items', 'list', kind] as const,
  item: (id: number) => ['admin', 'catalog', 'items', 'one', id] as const,
  uploads: ['admin', 'uploads'] as const,
  wishes: ['admin', 'wishes'] as const,
  queue: (status: 'open' | 'remaining') => ['admin', 'wishes', status] as const,
};

export function useLibrary() {
  return useQuery({
    queryKey: shopKeys.library,
    queryFn: () => api<CatalogLibraryDto>('/api/admin/catalog/library'),
    staleTime: 10 * 60_000,
  });
}

export function useCatalogItems(kind: ItemKind | null = null) {
  return useQuery({
    queryKey: shopKeys.list(kind),
    queryFn: () => api<CatalogItemDto[]>(`/api/admin/catalog/items${kind ? `?kind=${kind}` : ''}`),
  });
}

export function useCatalogItem(id: number | null) {
  return useQuery({
    queryKey: shopKeys.item(id ?? 0),
    queryFn: () => api<CatalogItemDto>(`/api/admin/catalog/items/${id}`),
    enabled: id !== null,
  });
}

export function useCreateItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CatalogItemCreateRequest) =>
      api<CatalogItemDto>('/api/admin/catalog/items', { method: 'POST', json: input }),
    onSuccess: (item) => {
      client.setQueryData(shopKeys.item(item.id), item);
      return client.invalidateQueries({ queryKey: shopKeys.items });
    },
  });
}

export function useUpdateItem(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: CatalogItemUpdateRequest) =>
      api<CatalogItemDto>(`/api/admin/catalog/items/${id}`, { method: 'PATCH', json: patch }),
    onSuccess: (item) => {
      client.setQueryData(shopKeys.item(item.id), item);
      return client.invalidateQueries({
        queryKey: shopKeys.items,
        predicate: (q) => q.queryKey[3] !== 'one',
      });
    },
  });
}

export function useUploads() {
  return useQuery({
    queryKey: shopKeys.uploads,
    queryFn: () => api<UploadDto[]>('/api/admin/uploads'),
  });
}

/** Sends the file as it is (the server checks the format, the size and the frames). */
export async function uploadPicture(file: File): Promise<UploadDto> {
  let res: Response;
  try {
    res = await fetch('/api/admin/uploads', {
      method: 'POST',
      body: file,
      credentials: 'same-origin',
      headers: {
        'content-type': file.type || 'application/octet-stream',
        accept: 'application/json',
      },
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Нет связи с сервером. Проверьте интернет.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null;
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'http_error',
      body?.error?.message ??
        (res.status === 413 ? 'Файл слишком большой' : `Ошибка сервера (${res.status})`),
      body?.error?.details,
    );
  }
  return (await res.json()) as UploadDto;
}

export function useUploadPicture() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: uploadPicture,
    onSuccess: () => client.invalidateQueries({ queryKey: shopKeys.uploads }),
  });
}

/** `open` — groups the learners asked to use; `remaining` — everything not handed out yet. */
export function useWishQueue(status: 'open' | 'remaining') {
  return useQuery({
    queryKey: shopKeys.queue(status),
    queryFn: () => api<LearnerWishesDto[]>(`/api/admin/wishes?status=${status}`),
  });
}

export function useFulfill(learnerId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: FulfillmentRequest) =>
      api<ReceiptDto>(`/api/admin/learners/${learnerId}/fulfillments`, {
        method: 'POST',
        json: input,
      }),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: shopKeys.wishes }),
        client.invalidateQueries({ queryKey: ['admin', 'inbox'] }),
      ]),
  });
}
