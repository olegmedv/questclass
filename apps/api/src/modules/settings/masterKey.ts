import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MASTER_KEY_FILENAME = 'master.key';
const MASTER_KEY_BYTES = 32;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function isErrno(err: unknown, code: string): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === code;
}

/**
 * Loads `DATA_DIR/master.key`, creating it (32 random bytes, mode 0600) on first start.
 * The key never leaves the data volume and is not part of database backups.
 */
export function loadOrCreateMasterKey(dataDir: string): Buffer {
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, MASTER_KEY_FILENAME);
  try {
    const encoded = randomBytes(MASTER_KEY_BYTES).toString('base64');
    writeFileSync(file, `${encoded}\n`, { mode: 0o600, flag: 'wx' });
    console.info(`Created ${file}. Keep an offline copy: without it secrets cannot be read.`);
  } catch (err) {
    if (!isErrno(err, 'EEXIST')) {
      throw err;
    }
  }
  if (process.platform !== 'win32' && (statSync(file).mode & 0o077) !== 0) {
    chmodSync(file, 0o600);
  }
  const encoded = readFileSync(file, 'utf8').trim();
  const key = Buffer.from(encoded, 'base64');
  if (!BASE64.test(encoded) || key.length !== MASTER_KEY_BYTES) {
    throw new Error(`${file} is corrupt: expected ${MASTER_KEY_BYTES} bytes in base64`);
  }
  return key;
}
