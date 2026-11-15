// lesson-prep: prepares lessons on the admin's PC and uploads them to QuestClass.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fetchVideos, FetchError } from './commands/fetch';
import { importLesson, LessonError } from './commands/import';
import { buildSeed, loadSeed, SeedError } from './commands/seed';
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
  seed [--videos <папка>] [--out <папка>]
                     собрать пакеты 5 сид-уроков из <videos>/<videoId>.mp4
                     (по умолчанию videos из настроек, out = <videos>/packages)
  fetch [<videoId>…] --out <папка> [--yt-dlp <путь>]
                     скачать видео YouTube в 480p установленным yt-dlp (по умолчанию — сид-уроки)

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

/** Settings when the file exists; seed and fetch can do without them. */
function optionalConfig(file: string | undefined) {
  try {
    return loadConfig(file ?? DEFAULT_CONFIG_PATH);
  } catch (err) {
    if (err instanceof ConfigError && file === undefined) {
      return undefined;
    }
    throw err;
  }
}

async function runSeed(argv: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      config: { type: 'string' },
      videos: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const videos = values.videos ?? optionalConfig(values.config)?.videos;
  if (videos === undefined) {
    throw new ConfigError('Укажите папку с видео: --videos <папка> или "videos" в настройках');
  }
  const out = path.resolve(values.out ?? path.join(videos, 'packages'));
  log(`Сид-уроки → ${out}`);
  const result = await buildSeed({ videos: path.resolve(videos), out, log });
  if (result.packages.length > 0) {
    const folders = result.packages.map((p) => `"${p}"`).join(' ');
    log(`Дальше: lesson-prep import ${folders}`);
  }
  return result.missing.length > 0 ? 2 : 0;
}

async function runFetch(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      out: { type: 'string' },
      'yt-dlp': { type: 'string' },
    },
  });
  const out = values.out ?? optionalConfig(values.config)?.videos;
  if (out === undefined) {
    throw new ConfigError('Укажите папку: --out <папка> или "videos" в настройках');
  }
  const ids =
    positionals.length > 0 ? positionals : (await loadSeed()).map((lesson) => lesson.videoId);
  const result = await fetchVideos(ids, {
    out: path.resolve(out),
    run: spawnRunner,
    ...(values['yt-dlp'] !== undefined && { ytDlp: values['yt-dlp'] }),
    log,
  });
  log(`Скачано: ${result.downloaded.length}, уже были: ${result.skipped.length}`);
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
      case 'seed':
        return await runSeed(rest);
      case 'fetch':
        return await runFetch(rest);
      default:
        process.stderr.write(`Неизвестная команда: ${command}\n${USAGE}\n`);
        return 1;
    }
  } catch (err) {
    if (
      err instanceof ConfigError ||
      err instanceof LessonError ||
      err instanceof FfmpegError ||
      err instanceof UploadError ||
      err instanceof SeedError ||
      err instanceof FetchError
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
