import { passwordSchema } from '@questclass/shared/auth/schemas';
import { loadConfig } from '../config';
import { HttpError } from '../http/errors';
import { randomToken } from '../modules/auth/crypto';
import { closeAll, openRuntime } from '../startup';
import type { CliIo } from './index';

export const RESET_PASSWORD_USAGE =
  'reset-password <login>   new admin password from stdin, or a generated one if stdin is a terminal';

/**
 * `node dist/cli.js reset-password <login>` (inside the container via `docker exec`):
 * sets a new password for an admin and ends all of their sessions.
 */
export async function resetPasswordCommand(args: readonly string[], io: CliIo): Promise<number> {
  const [login] = args;
  if (!login) {
    io.stderr(`Usage: ${RESET_PASSWORD_USAGE}`);
    return 2;
  }
  const piped = (await io.readStdin())?.split(/\r?\n/)[0]?.trim() ?? '';
  const password = piped === '' ? randomToken(12) : piped;
  const valid = passwordSchema.safeParse(password);
  if (!valid.success) {
    io.stderr(valid.error.issues[0]?.message ?? 'Invalid password');
    return 2;
  }

  const runtime = await openRuntime(loadConfig(io.env));
  try {
    await runtime.ctx.users.resetPassword(login.trim().toLowerCase(), password);
    io.stdout(`Password of "${login}" has been reset; all of their sessions were ended.`);
    if (piped === '') {
      io.stdout(`New password: ${password}`);
    }
    return 0;
  } catch (err) {
    if (err instanceof HttpError) {
      io.stderr(err.message);
      return 1;
    }
    throw err;
  } finally {
    await closeAll(runtime.closers);
  }
}
