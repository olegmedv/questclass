import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomToken, safeEqualStrings, sha256Hex } from './crypto';

/** Holds the SHA-256 of the one-time setup token while no admin exists. */
export const SETUP_TOKEN_FILENAME = 'setup-token';

export function setupTokenPath(dataDir: string): string {
  return path.join(dataDir, SETUP_TOKEN_FILENAME);
}

/**
 * Generates a fresh one-time token, stores only its hash in `DATA_DIR/setup-token` and
 * returns the token itself (printed to the container log by the startup hook).
 */
export function issueSetupToken(dataDir: string): string {
  const token = randomToken(24);
  writeFileSync(setupTokenPath(dataDir), `${sha256Hex(token)}\n`, { mode: 0o600 });
  return token;
}

export function hasSetupToken(dataDir: string): boolean {
  return existsSync(setupTokenPath(dataDir));
}

export function verifySetupToken(dataDir: string, token: string): boolean {
  const file = setupTokenPath(dataDir);
  if (!existsSync(file)) {
    return false;
  }
  return safeEqualStrings(readFileSync(file, 'utf8').trim(), sha256Hex(token));
}

export function clearSetupToken(dataDir: string): void {
  rmSync(setupTokenPath(dataDir), { force: true });
}
