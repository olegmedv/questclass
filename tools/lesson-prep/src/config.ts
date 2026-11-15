import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Which H.264 encoder ffmpeg uses: the GPU's NVENC when it works, otherwise libx264. */
export const ENCODER_CHOICES = ['auto', 'nvenc', 'x264'] as const;
export type EncoderChoice = (typeof ENCODER_CHOICES)[number];

/**
 * `~/.questclass/lesson-prep.json`. The import token may be left out: it is then read from
 * stdin. A token is never accepted as a command-line argument (it would end up in the shell
 * history and the process list).
 */
export interface LessonPrepConfig {
  /** QuestClass address, e.g. `https://questclass.duckdns.org`. */
  readonly server: string;
  readonly token?: string;
  /** ffmpeg and ffprobe executables (default: from PATH). */
  readonly ffmpeg: string;
  readonly ffprobe: string;
  readonly encoder: EncoderChoice;
  /** Folder with the downloaded seed videos `<videoId>.mp4` (FEAT-048). */
  readonly videos?: string;
}

export const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.questclass', 'lesson-prep.json');

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const isEncoder = (value: unknown): value is EncoderChoice =>
  typeof value === 'string' && (ENCODER_CHOICES as readonly string[]).includes(value);

/** Validates a parsed config object (unknown keys are refused to catch typos). */
export function parseConfig(raw: unknown, source = 'config'): LessonPrepConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError(`${source}: ожидается JSON-объект`);
  }
  const data = raw as Record<string, unknown>;
  const known = new Set(['server', 'token', 'ffmpeg', 'ffprobe', 'encoder', 'videos']);
  const unknown = Object.keys(data).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new ConfigError(`${source}: неизвестные поля ${unknown.join(', ')}`);
  }
  const text = (key: string): string | undefined => {
    const value = data[key];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ConfigError(`${source}: поле ${key} должно быть непустой строкой`);
    }
    return value.trim();
  };
  const server = text('server');
  if (server === undefined) {
    throw new ConfigError(`${source}: нужен адрес сервера (server)`);
  }
  let url: URL;
  try {
    url = new URL(server);
  } catch {
    throw new ConfigError(`${source}: server — не URL: ${server}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError(`${source}: server должен начинаться с https:// или http://`);
  }
  const encoder = data['encoder'] ?? 'auto';
  if (!isEncoder(encoder)) {
    throw new ConfigError(`${source}: encoder — одно из ${ENCODER_CHOICES.join(', ')}`);
  }
  const token = text('token');
  const videos = text('videos');
  return {
    server: url.origin,
    ...(token !== undefined && { token }),
    ffmpeg: text('ffmpeg') ?? 'ffmpeg',
    ffprobe: text('ffprobe') ?? 'ffprobe',
    encoder,
    ...(videos !== undefined && { videos }),
  };
}

/** Reads the config file; a missing file explains how to create one. */
export function loadConfig(file: string = DEFAULT_CONFIG_PATH): LessonPrepConfig {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ConfigError(
        `Нет файла настроек ${file}. Создайте его: {"server": "https://…"} — токен импорта можно положить туда же ("token") или передавать через stdin.`,
      );
    }
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new ConfigError(`${file}: это не JSON`);
  }
  return parseConfig(raw, file);
}

/** Where the token comes from when the config has none. */
export interface TokenInput {
  readonly isTTY: boolean;
  /** Everything piped to stdin. */
  readAll(): Promise<string>;
  /** Asks in the terminal and reads one line. */
  prompt(question: string): Promise<string>;
}

/** The import token: from the config, else from stdin (piped or typed in). */
export async function resolveToken(config: LessonPrepConfig, input: TokenInput): Promise<string> {
  if (config.token) {
    return config.token;
  }
  const raw = input.isTTY ? await input.prompt('Токен импорта: ') : await input.readAll();
  const token = raw.trim().split(/\r?\n/)[0]?.trim() ?? '';
  if (token === '') {
    throw new ConfigError(
      'Нет токена импорта: укажите "token" в настройках или передайте через stdin',
    );
  }
  return token;
}

/** stdin of this process as a token source. */
export function processTokenInput(): TokenInput {
  return {
    isTTY: Boolean(process.stdin.isTTY),
    async readAll() {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      return Buffer.concat(chunks).toString('utf8');
    },
    async prompt(question) {
      const { createInterface } = await import('node:readline/promises');
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
  };
}
