import { existsSync, statSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  lessonManifestSchema,
  mediaFilePathSchema,
  type LessonManifest,
  type ManifestFile,
} from '@questclass/shared/import/manifest';
import type { EncoderChoice } from '../config';
import { MASTER_PLAYLIST, hlsDuration, transcodeToHls, type Tools } from '../hls';
import { describeFile, uploadLesson, type Client, type LessonUploadResult } from '../upload';

/**
 * A lesson package folder:
 *
 *   lesson.json   what the lesson is (see README): id, subject, title, questions…
 *   video.mp4     the source video (or `"video"` in lesson.json pointing elsewhere)
 *   hls/          ready HLS; made from the video by ffmpeg when missing
 *   images/       question pictures referenced as `images/<name>.webp`
 */
export const LESSON_FILE = 'lesson.json';
export const HLS_DIR = 'hls';
export const IMAGES_DIR = 'images';
const DEFAULT_VIDEO = 'video.mp4';

export class LessonError extends Error {
  override name = 'LessonError';
  constructor(
    message: string,
    readonly problems: readonly string[] = [],
  ) {
    super(problems.length > 0 ? `${message}\n  - ${problems.join('\n  - ')}` : message);
  }
}

/** Placeholder of the video files while only lesson.json is checked. */
const PLACEHOLDER_FILE: ManifestFile = { path: MASTER_PLAYLIST, size: 0, sha256: '0'.repeat(64) };

type RawLesson = Record<string, unknown> & {
  questions?: { image?: unknown; options?: { image?: unknown }[] }[];
};

/** Question picture paths of lesson.json (`images/q1.webp`) as paths inside the images media. */
function imagePathsOf(lesson: RawLesson): { refs: Set<string>; problems: string[] } {
  const refs = new Set<string>();
  const problems: string[] = [];
  const take = (value: unknown, where: string) => {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value !== 'string' || !value.startsWith(`${IMAGES_DIR}/`)) {
      problems.push(`${where}: картинка должна лежать в ${IMAGES_DIR}/ (${JSON.stringify(value)})`);
      return;
    }
    refs.add(value.slice(IMAGES_DIR.length + 1));
  };
  (lesson.questions ?? []).forEach((q, i) => {
    take(q.image, `questions[${i}].image`);
    (q.options ?? []).forEach((o, j) => {
      take(o.image, `questions[${i}].options[${j}].image`);
    });
  });
  return { refs, problems };
}

/** lesson.json with picture paths moved inside the images media and the media filled in. */
function toManifest(
  lesson: RawLesson,
  media: { kind: 'hls'; files: ManifestFile[] },
  images: ManifestFile[],
): unknown {
  const strip = (value: unknown) =>
    typeof value === 'string' && value.startsWith(`${IMAGES_DIR}/`)
      ? value.slice(IMAGES_DIR.length + 1)
      : value;
  const { video: _video, ...rest } = lesson;
  return {
    ...rest,
    questions: (lesson.questions ?? []).map((q) => ({
      ...q,
      ...(q.image !== undefined && { image: strip(q.image) }),
      ...(q.options && {
        options: q.options.map((o) => ({
          ...o,
          ...(o.image !== undefined && { image: strip(o.image) }),
        })),
      }),
    })),
    media,
    ...(images.length > 0 && { images: { files: images } }),
  };
}

function problemsOf(error: { issues: { path: PropertyKey[]; message: string }[] }): string[] {
  return error.issues.map(
    (issue) => `${issue.path.map(String).join('.') || '(корень)'}: ${issue.message}`,
  );
}

export interface PreparedLesson {
  readonly folder: string;
  readonly manifest: LessonManifest;
  readonly videoFiles: Map<string, string>;
  readonly imageFiles: Map<string, string>;
  readonly durationSec: number;
  /** How the HLS was obtained: already there, or transcoded now. */
  readonly hls: { readonly made: boolean; readonly encoder?: string; readonly seconds?: number };
}

/** Reads and checks lesson.json before any heavy work (bad packages fail fast). */
export async function readLesson(folder: string): Promise<RawLesson> {
  const file = path.join(folder, LESSON_FILE);
  if (!existsSync(file)) {
    throw new LessonError(`Нет ${LESSON_FILE} в ${folder}`);
  }
  let lesson: unknown;
  try {
    lesson = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  } catch {
    throw new LessonError(`${LESSON_FILE}: это не JSON`);
  }
  if (typeof lesson !== 'object' || lesson === null || Array.isArray(lesson)) {
    throw new LessonError(`${LESSON_FILE}: ожидается объект`);
  }
  const raw = lesson as RawLesson;
  const { refs, problems } = imagePathsOf(raw);
  for (const ref of refs) {
    if (!existsSync(path.join(folder, IMAGES_DIR, ...ref.split('/')))) {
      problems.push(`нет файла ${IMAGES_DIR}/${ref}`);
    }
  }
  const placeholderImages = [...refs].map((p) => ({ ...PLACEHOLDER_FILE, path: p }));
  const check = lessonManifestSchema.safeParse(
    toManifest(raw, { kind: 'hls', files: [PLACEHOLDER_FILE] }, placeholderImages),
  );
  if (!check.success) {
    problems.push(...problemsOf(check.error));
  }
  if (problems.length > 0) {
    throw new LessonError(`${LESSON_FILE} не прошёл проверку`, problems);
  }
  return raw;
}

/** Every file below `dir` as `[relative posix path, absolute path]`. */
async function walk(dir: string, prefix = ''): Promise<[string, string][]> {
  const out: [string, string][] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(abs, rel)));
    } else if (entry.isFile()) {
      out.push([rel, abs]);
    }
  }
  return out.sort(([a], [b]) => a.localeCompare(b));
}

/** The source video: `"video"` of lesson.json (relative to the folder or absolute) or video.mp4. */
function sourceVideo(folder: string, lesson: RawLesson): string {
  const value = lesson['video'];
  const name = typeof value === 'string' && value.trim() !== '' ? value : DEFAULT_VIDEO;
  return path.resolve(folder, name);
}

export interface PrepareOptions {
  readonly tools: Tools;
  readonly encoder: EncoderChoice;
  readonly log?: (line: string) => void;
}

/**
 * Checks the package, makes HLS if it is missing (or older than the source video) and
 * describes every file (size, sha256). Nothing is sent yet.
 */
export async function prepareLesson(
  folder: string,
  options: PrepareOptions,
): Promise<PreparedLesson> {
  const log = options.log ?? (() => undefined);
  const lesson = await readLesson(folder);
  const hlsDir = path.join(folder, HLS_DIR);
  const master = path.join(hlsDir, MASTER_PLAYLIST);
  const source = sourceVideo(folder, lesson);
  let hls: PreparedLesson['hls'] = { made: false };
  const stale =
    existsSync(master) && existsSync(source) && statSync(source).mtimeMs > statSync(master).mtimeMs;
  if (!existsSync(master) || stale) {
    if (!existsSync(source)) {
      throw new LessonError(`Нет видео: ни ${HLS_DIR}/${MASTER_PLAYLIST}, ни ${source}`);
    }
    log(`  HLS 360p + 480p из ${path.basename(source)}…`);
    const made = await transcodeToHls(options.tools, source, hlsDir, options.encoder);
    log(
      `  готово за ${made.seconds.toFixed(1)} с (${made.encoder === 'nvenc' ? 'NVENC' : 'libx264'})`,
    );
    hls = { made: true, encoder: made.encoder, seconds: made.seconds };
  }

  const videoFiles = new Map<string, string>();
  const problems: string[] = [];
  for (const [rel, abs] of await walk(hlsDir)) {
    if (!mediaFilePathSchema.safeParse(rel).success) {
      problems.push(`${HLS_DIR}/${rel}: недопустимое имя файла`);
      continue;
    }
    videoFiles.set(rel, abs);
  }
  const imageFiles = new Map<string, string>();
  for (const ref of imagePathsOf(lesson).refs) {
    imageFiles.set(ref, path.join(folder, IMAGES_DIR, ...ref.split('/')));
  }
  if (problems.length > 0) {
    throw new LessonError('Файлы HLS не подходят', problems);
  }
  const describe = (files: Map<string, string>) =>
    Promise.all([...files].map(([rel, abs]) => describeFile(rel, abs)));
  const manifest = lessonManifestSchema.safeParse(
    toManifest(
      lesson,
      { kind: 'hls', files: await describe(videoFiles) },
      await describe(imageFiles),
    ),
  );
  if (!manifest.success) {
    throw new LessonError('Пакет урока не прошёл проверку', problemsOf(manifest.error));
  }
  return {
    folder,
    manifest: manifest.data,
    videoFiles,
    imageFiles,
    durationSec: await hlsDuration(hlsDir),
    hls,
  };
}

export interface ImportOptions extends PrepareOptions {
  readonly client: Client;
}

export interface ImportSummary extends LessonUploadResult {
  readonly prepared: PreparedLesson;
}

/** `lesson-prep import <folder>`: prepare the package, then upload what the server lacks. */
export async function importLesson(folder: string, options: ImportOptions): Promise<ImportSummary> {
  const log = options.log ?? (() => undefined);
  log(`Урок ${folder}`);
  const prepared = await prepareLesson(folder, options);
  const uploaded = await uploadLesson(
    { ...options.client, log },
    {
      manifest: prepared.manifest,
      videoFiles: prepared.videoFiles,
      imageFiles: prepared.imageFiles,
      durationSec: prepared.durationSec,
    },
  );
  const { result } = uploaded;
  const what = {
    created: 'создан черновик',
    updated: 'черновик обновлён',
    revision: `ревизия #${result.revisionId ?? '?'} ждёт проверки в админке`,
    unchanged: 'без изменений',
  }[result.outcome];
  log(
    `  задание #${result.taskId}: ${what}; отправлено ${(uploaded.stats.bytes / 1e6).toFixed(1)} МБ`,
  );
  return { ...uploaded, prepared };
}
