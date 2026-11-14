// lesson-prep: prepares lessons on the admin's PC and uploads them to QuestClass.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { importLesson, LessonError } from './commands/import';
import {
  ConfigError,
  DEFAULT_CONFIG_PATH,
  ENCODER_CHOICES,
  loadConfig,
  processTokenInput,
  resolveToken,
  type EncoderChoice,
} from './config';
import { FfmpegError, spawnRunner } from './hls';
import { UploadError } from './upload';

const USAGE = `Использование: lesson-prep <команда> [параметры]

Команды:
  import <папка>…    проверить lesson.json, сделать HLS 360p + 480p (ffmpeg, NVENC если есть)
                     и загрузить урок в КвестКласс (прерванная загрузка продолжается)

Параметры:
  --config <файл>    файл настроек (по умолчанию ${DEFAULT_CONFIG_PATH})
  --server <адрес>   адрес КвестКласса (вместо указанного в настройках)
  --encoder <имя>    ${ENCODER_CHOICES.join(' | ')} (по умолчанию из настроек, иначе auto)

Токен импорта не передаётся аргументом: укажите "token" в файле настроек или подайте его в stdin.`;

const log = (line: string) => {
  process.stdout.write(`${line}\n`);
};

async function runImport(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      server: { type: 'string' },
      encoder: { type: 'string' },
    },
  });
  if (positionals.length === 0) {
    process.stderr.write(`Укажите папку урока.\n${USAGE}\n`);
    return 1;
  }
  const base = loadConfig(values.config ?? DEFAULT_CONFIG_PATH);
  const config = {
    ...base,
    ...(values.server !== undefined && { server: new URL(values.server).origin }),
  };
  const encoder = (values.encoder ?? config.encoder) as EncoderChoice;
  if (!(ENCODER_CHOICES as readonly string[]).includes(encoder)) {
    throw new ConfigError(`--encoder: одно из ${ENCODER_CHOICES.join(', ')}`);
  }
  const token = await resolveToken(config, processTokenInput());
  const client = {
    server: config.server,
    token,
    fetch: (url: string, init: RequestInit) => fetch(url, init),
  };
  const tools = { ffmpeg: config.ffmpeg, ffprobe: config.ffprobe, run: spawnRunner };
  for (const folder of positionals) {
    await importLesson(path.resolve(folder), { client, tools, encoder, log });
  }
  return 0;
}

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (rest.some((arg) => arg === '--token' || arg.startsWith('--token='))) {
    process.stderr.write(
      'Токен в аргументах не принимается: укажите его в настройках или в stdin.\n',
    );
    return 1;
  }
  try {
    switch (command) {
      case 'import':
        return await runImport(rest);
      default:
        process.stderr.write(`Неизвестная команда: ${command}\n${USAGE}\n`);
        return 1;
    }
  } catch (err) {
    if (
      err instanceof ConfigError ||
      err instanceof LessonError ||
      err instanceof FfmpegError ||
      err instanceof UploadError
    ) {
      process.stderr.write(`Ошибка: ${err.message}\n`);
      return 1;
    }
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS')) {
      process.stderr.write(`${(err as Error).message}\n${USAGE}\n`);
      return 1;
    }
    throw err;
  }
}

process.exitCode = await main(process.argv.slice(2));
