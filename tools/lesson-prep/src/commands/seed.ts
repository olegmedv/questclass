import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ManifestQuestion } from '@questclass/shared/import/manifest';
import { IMAGES_DIR, LESSON_FILE } from './import';

/**
 * The 5 seed lessons of SPEC §9 (one per subject), extracted once from the original's
 * `lib/subtitle-lesson-pack.json` into `tools/lesson-prep/seed/` together with their pictures.
 * Neither the tests nor this command need `QuestClass-Source`.
 */
export const SEED_FILE = 'original-5.json';
const SEED_DIRNAME = 'seed';

export interface SeedLesson {
  readonly videoId: string;
  readonly subjectKey: string;
  readonly title: string;
  readonly lessonDate: string;
  /** Picture paths are file names inside `seed/images/<videoId>/`. */
  readonly questions: ManifestQuestion[];
}

interface SeedFile {
  readonly lessons: SeedLesson[];
}

export class SeedError extends Error {
  override name = 'SeedError';
}

/** `seed/` next to the sources (`src/commands`) or next to the bundle (`dist`). */
export function findSeedDir(from: string = path.dirname(fileURLToPath(import.meta.url))): string {
  let dir = from;
  for (let up = 0; up < 4; up += 1) {
    const candidate = path.join(dir, SEED_DIRNAME);
    if (existsSync(path.join(candidate, SEED_FILE))) {
      return candidate;
    }
    dir = path.dirname(dir);
  }
  throw new SeedError(`Не найдена папка ${SEED_DIRNAME}/ с ${SEED_FILE}`);
}

export async function loadSeed(seedDir: string = findSeedDir()): Promise<SeedLesson[]> {
  const parsed = JSON.parse(await readFile(path.join(seedDir, SEED_FILE), 'utf8')) as SeedFile;
  return parsed.lessons;
}

/** Stable lesson id on the server: re-seeding updates the same tasks. */
export const externalIdOf = (videoId: string): string => `yt-${videoId}`;

/** The source video of a seed lesson in the videos folder. */
export const videoFileOf = (videos: string, videoId: string): string =>
  path.join(videos, `${videoId}.mp4`);

/** Picture names a question uses (question and options). */
export function picturesOf(question: ManifestQuestion): string[] {
  return [question.image, ...question.options.map((o) => o.image)].filter(
    (name): name is string => typeof name === 'string',
  );
}

export interface SeedOptions {
  readonly videos: string;
  readonly out: string;
  readonly seedDir?: string;
  readonly log?: (line: string) => void;
}

export interface SeedResult {
  /** Lesson package folders ready for `lesson-prep import`. */
  readonly packages: string[];
  /** Seed lessons whose video is not in the videos folder. */
  readonly missing: string[];
}

/** The command that downloads the missing videos. */
export function fetchCommand(ids: readonly string[], videos: string): string {
  return `lesson-prep fetch ${ids.join(' ')} --out "${videos}"`;
}

/**
 * Writes one lesson package per seed lesson whose video is present: `lesson.json` (pointing at
 * the video where it lies, no copy) and its pictures in `images/`. An existing `hls/` is kept,
 * so a repeated seed does not re-encode anything.
 */
export async function buildSeed(options: SeedOptions): Promise<SeedResult> {
  const log = options.log ?? (() => undefined);
  const seedDir = options.seedDir ?? findSeedDir();
  const lessons = await loadSeed(seedDir);
  const packages: string[] = [];
  const missing: string[] = [];
  for (const lesson of lessons) {
    const video = videoFileOf(options.videos, lesson.videoId);
    if (!existsSync(video)) {
      missing.push(lesson.videoId);
      continue;
    }
    const folder = path.join(options.out, lesson.videoId);
    const images = path.join(folder, IMAGES_DIR);
    await rm(images, { recursive: true, force: true });
    await mkdir(images, { recursive: true });
    for (const name of new Set(lesson.questions.flatMap(picturesOf))) {
      await copyFile(path.join(seedDir, 'images', lesson.videoId, name), path.join(images, name));
    }
    const inImages = (name: string | null | undefined) =>
      typeof name === 'string' ? `${IMAGES_DIR}/${name}` : undefined;
    const manifest = {
      externalId: externalIdOf(lesson.videoId),
      subjectKey: lesson.subjectKey,
      title: lesson.title,
      lessonDate: lesson.lessonDate,
      video: path.resolve(video),
      questions: lesson.questions.map((q) => ({
        ...q,
        ...(q.image ? { image: inImages(q.image) } : {}),
        options: q.options.map((o) => ({ ...o, ...(o.image ? { image: inImages(o.image) } : {}) })),
      })),
    };
    await writeFile(path.join(folder, LESSON_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
    packages.push(folder);
    log(`  ${lesson.videoId}: ${lesson.title} (${lesson.subjectKey})`);
  }
  if (missing.length > 0) {
    log(`Нет видео для ${missing.length} уроков: ${missing.join(', ')}`);
    log(`Скачать (480p, нужен yt-dlp): ${fetchCommand(missing, options.videos)}`);
  }
  return { packages, missing };
}
