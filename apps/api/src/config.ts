import path from 'node:path';
import { z } from 'zod';

/**
 * Launch configuration. Only `PORT`, `DATA_DIR` and `NODE_ENV` are read from the environment
 * (CLAUDE.md rule 7); everything else lives in the `settings` table and is edited in the admin UI.
 */
export interface Config {
  readonly port: number;
  /** Absolute path of the data volume: database, master key, media. */
  readonly dataDir: string;
  readonly nodeEnv: NodeEnv;
  readonly isProduction: boolean;
}

export type NodeEnv = 'development' | 'production' | 'test';

export const DEFAULT_PORT = 8080;
/** Development default for DATA_DIR, relative to the working directory. */
export const DEV_DATA_DIR = '.data';

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const envSchema = z.object({
  PORT: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(0).max(65535).default(DEFAULT_PORT),
  ),
  DATA_DIR: z.preprocess(blankToUndefined, z.string().optional()),
  NODE_ENV: z.preprocess(
    blankToUndefined,
    z.enum(['development', 'production', 'test']).default('development'),
  ),
});

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function loadConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
  cwd: string = process.cwd(),
): Config {
  const parsed = envSchema.safeParse({
    PORT: env['PORT'],
    DATA_DIR: env['DATA_DIR'],
    NODE_ENV: env['NODE_ENV'],
  });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ConfigError(`Invalid environment: ${problems.join('; ')}`);
  }
  const { PORT, DATA_DIR, NODE_ENV } = parsed.data;
  const isProduction = NODE_ENV === 'production';
  if (isProduction && DATA_DIR === undefined) {
    throw new ConfigError('DATA_DIR is required in production');
  }
  return Object.freeze({
    port: PORT,
    dataDir: path.resolve(cwd, DATA_DIR ?? DEV_DATA_DIR),
    nodeEnv: NODE_ENV,
    isProduction,
  });
}
