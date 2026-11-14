// HTTP client of the SPA. Every API call goes through `api()`, which turns the server's
// `{ error: { code, message, details } }` body (and network failures) into an `ApiError`.

/** A failed API call. `status` is 0 when the server could not be reached at all. */
export class ApiError extends Error {
  override name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  /** Seconds until the next attempt for throttled login endpoints (429), if the server said so. */
  get retryAfterSec(): number | null {
    const details = this.details as { retryAfterSec?: unknown } | undefined;
    return typeof details?.retryAfterSec === 'number' ? details.retryAfterSec : null;
  }
}

export const isApiError = (err: unknown): err is ApiError => err instanceof ApiError;
export const isUnauthorized = (err: unknown): boolean => isApiError(err) && err.status === 401;
export const isForbidden = (err: unknown): boolean => isApiError(err) && err.status === 403;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequest {
  readonly method?: HttpMethod;
  /** Request body, sent as JSON. */
  readonly json?: unknown;
  readonly signal?: AbortSignal;
}

interface ErrorPayload {
  error?: { code?: unknown; message?: unknown; details?: unknown };
}

async function readError(res: Response): Promise<ApiError> {
  let payload: ErrorPayload | null = null;
  try {
    payload = (await res.json()) as ErrorPayload;
  } catch {
    // Not JSON (e.g. a proxy error page): fall back to the status line.
  }
  const error = payload?.error;
  const code = typeof error?.code === 'string' ? error.code : 'http_error';
  const message =
    typeof error?.message === 'string' ? error.message : `Ошибка сервера (${res.status})`;
  return new ApiError(res.status, code, message, error?.details);
}

/** Calls the API on the same origin with the session cookie; resolves with the parsed JSON. */
export async function api<T>(path: string, request: ApiRequest = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  let body: string | undefined;
  if (request.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(request.json);
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method: request.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      ...(body !== undefined && { body }),
      ...(request.signal && { signal: request.signal }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new ApiError(0, 'network_error', 'Нет связи с сервером. Проверьте интернет.');
  }
  if (!res.ok) {
    throw await readError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
