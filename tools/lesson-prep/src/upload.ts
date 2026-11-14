import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import type {
  ImportLessonResultDto,
  ImportMediaDto,
  LessonManifest,
  ManifestFile,
} from '@questclass/shared/import/manifest';

/** Size of one PUT (the server accepts up to 8 MB). */
export const CHUNK_BYTES = 4 * 1024 * 1024;
/** Files uploaded at the same time. */
export const PARALLEL_FILES = 4;
/** Attempts per chunk before giving up (network errors, 5xx). */
export const MAX_ATTEMPTS = 5;

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface Client {
  readonly server: string;
  readonly token: string;
  readonly fetch: Fetch;
  /** Waits between retries (tests make it instant). */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly log?: (line: string) => void;
}

export class UploadError extends Error {
  override name = 'UploadError';
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

interface ErrorBody {
  readonly error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

/** `{path, size, sha256}` of a local file under its path inside the media. */
export async function describeFile(mediaPath: string, file: string): Promise<ManifestFile> {
  return { path: mediaPath, size: (await stat(file)).size, sha256: await sha256File(file) };
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function failure(what: string, status: number, body: unknown): UploadError {
  const error = (body as ErrorBody | undefined)?.error;
  const reason = error?.message ? `${error.message} (${error.code ?? status})` : `HTTP ${status}`;
  return new UploadError(`${what}: ${reason}`, status, body);
}

function request(client: Client, method: string, path: string, init: RequestInit = {}) {
  return client.fetch(`${client.server}${path}`, {
    ...init,
    method,
    headers: {
      authorization: `Bearer ${client.token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

async function json<T>(client: Client, method: string, path: string, body?: unknown): Promise<T> {
  const res = await request(client, method, path, {
    ...(body !== undefined && {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  });
  const parsed = await readBody(res);
  if (!res.ok) {
    throw failure(`${method} ${path}`, res.status, parsed);
  }
  return parsed as T;
}

/** Bytes `[start, start + length)` of a file. */
async function readRange(file: string, start: number, length: number): Promise<Buffer> {
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export interface UploadStats {
  /** Bytes actually sent (resumed and reused files cost nothing). */
  bytes: number;
  requests: number;
}

/** Sends one file from the server's `received` offset, resuming after errors. */
async function uploadFile(
  client: Client,
  mediaId: number,
  entry: { path: string; size: number; received: number },
  local: string,
  stats: UploadStats,
): Promise<void> {
  const sleep = client.sleep ?? defaultSleep;
  let offset = entry.received;
  let attempts = 0;
  const url = (at: number) =>
    `/api/import/media/${mediaId}/files/${entry.path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}?offset=${at}`;
  while (offset < entry.size) {
    const chunk = await readRange(local, offset, Math.min(CHUNK_BYTES, entry.size - offset));
    try {
      stats.requests += 1;
      const res = await request(client, 'PUT', url(offset), {
        body: chunk,
        headers: { 'content-type': 'application/octet-stream' },
      });
      const body = (await readBody(res)) as ErrorBody & { received?: number };
      if (res.ok) {
        stats.bytes += chunk.length;
        offset = body.received ?? offset + chunk.length;
        attempts = 0;
        continue;
      }
      const received = body.error?.details?.['received'];
      // The server holds a different amount (an earlier try got through or broke midway).
      if (
        (body.error?.code === 'offset_mismatch' || body.error?.code === 'upload_interrupted') &&
        typeof received === 'number'
      ) {
        offset = received;
        continue;
      }
      if (res.status < 500 && res.status !== 429) {
        throw failure(`Загрузка ${entry.path}`, res.status, body);
      }
    } catch (err) {
      if (err instanceof UploadError) {
        throw err;
      }
      // Network error: fall through to a retry.
    }
    attempts += 1;
    if (attempts >= MAX_ATTEMPTS) {
      throw new UploadError(`Загрузка ${entry.path}: не удалось после ${MAX_ATTEMPTS} попыток`);
    }
    await sleep(500 * 2 ** attempts);
    // Ask the server where it stands before the next try.
    const status = await json<ImportMediaDto>(client, 'GET', `/api/import/media/${mediaId}`);
    offset = status.files.find((f) => f.path === entry.path)?.received ?? 0;
  }
}

/** Uploads the missing parts of a media's files (several at once) and completes it. */
export async function uploadMedia(
  client: Client,
  media: ImportMediaDto,
  locals: ReadonlyMap<string, string>,
  durationSec: number | null,
  stats: UploadStats,
): Promise<ImportMediaDto> {
  if (media.status === 'ready') {
    return media;
  }
  const missing = media.files.filter((f) => f.received < f.size);
  const queue = [...missing];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const local = locals.get(next.path);
      if (!local) {
        throw new UploadError(`Нет локального файла для ${next.path}`);
      }
      await uploadFile(client, media.id, next, local, stats);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_FILES, queue.length) }, worker));
  const body = media.role === 'video' && durationSec !== null ? { durationSec } : {};
  try {
    return await json<ImportMediaDto>(
      client,
      'POST',
      `/api/import/media/${media.id}/completion`,
      body,
    );
  } catch (err) {
    // Corrupted files were dropped by the server: send them again once.
    if (err instanceof UploadError && err.status === 409) {
      const status = await json<ImportMediaDto>(client, 'GET', `/api/import/media/${media.id}`);
      for (const file of status.files.filter((f) => f.received < f.size)) {
        await uploadFile(client, media.id, file, locals.get(file.path) ?? '', stats);
      }
      return json<ImportMediaDto>(client, 'POST', `/api/import/media/${media.id}/completion`, body);
    }
    throw err;
  }
}

export interface LessonUpload {
  readonly manifest: LessonManifest;
  /** Local file of every path in `manifest.media.files`. */
  readonly videoFiles: ReadonlyMap<string, string>;
  /** Local file of every path in `manifest.images.files`. */
  readonly imageFiles: ReadonlyMap<string, string>;
  readonly durationSec: number;
}

export interface LessonUploadResult {
  readonly result: ImportLessonResultDto;
  readonly media: ImportMediaDto[];
  readonly stats: UploadStats;
}

/** Sends the manifest, then whatever the server is still missing, then completes the media. */
export async function uploadLesson(
  client: Client,
  lesson: LessonUpload,
): Promise<LessonUploadResult> {
  const result = await json<ImportLessonResultDto>(
    client,
    'POST',
    '/api/import/lessons',
    lesson.manifest,
  );
  const stats: UploadStats = { bytes: 0, requests: 0 };
  const media: ImportMediaDto[] = [];
  for (const item of result.media) {
    const locals = item.role === 'video' ? lesson.videoFiles : lesson.imageFiles;
    client.log?.(
      item.status === 'ready'
        ? `  медиа ${item.id} (${item.role}) уже на сервере`
        : `  медиа ${item.id} (${item.role}): ${item.files.filter((f) => f.received < f.size).length} файлов к загрузке`,
    );
    media.push(await uploadMedia(client, item, locals, lesson.durationSec, stats));
  }
  return { result, media, stats };
}
