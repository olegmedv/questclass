import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * scrypt parameters: N=2^14, r=8, p=5 is one of the OWASP-equivalent settings and needs only
 * 16 MiB per hash (the server budget is 200 MB), see CLAUDE.md rule 13.
 */
const SCRYPT = { N: 2 ** 14, r: 8, p: 5 } as const;
const KEY_LENGTH = 32;
const SALT_BYTES = 16;
const MAX_MEM = 64 * 1024 * 1024;

function scryptAsync(secret: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, KEY_LENGTH, { ...options, maxmem: MAX_MEM }, (err, key) => {
      if (err) {
        reject(err);
      } else {
        resolve(key);
      }
    });
  });
}

/** Runs at most one hash at a time, so a burst of logins cannot exhaust memory. */
let hashQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = hashQueue.then(task, task);
  hashQueue = run.catch(() => undefined);
  return run;
}

/** Hash for a password or PIN: `scrypt$N$r$p$<salt>$<key>` (base64url). */
export function hashSecret(secret: string): Promise<string> {
  return serialized(async () => {
    const salt = randomBytes(SALT_BYTES);
    const key = await scryptAsync(secret, salt, SCRYPT);
    const params = `${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}`;
    return `scrypt$${params}$${salt.toString('base64url')}$${key.toString('base64url')}`;
  });
}

/** Constant-time check of a secret against a stored hash (false for a malformed hash). */
export function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !key) {
    return Promise.resolve(false);
  }
  return serialized(async () => {
    const expected = Buffer.from(key, 'base64url');
    const options = { N: Number(n), r: Number(r), p: Number(p) };
    const actual = await scryptAsync(secret, Buffer.from(salt, 'base64url'), options);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

/** A hash to verify against when the account does not exist (equalises response time). */
let dummyHash: Promise<string> | null = null;
export function dummySecretHash(): Promise<string> {
  dummyHash ??= hashSecret(randomBytes(16).toString('hex'));
  return dummyHash;
}

/** Random URL-safe token for cookies and one-time codes. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function safeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Activity stamp for the admin idle timeout: `<ms>.<hmac>` bound to one session. Kept in a
 * cookie, so sliding the timeout never writes to the database.
 */
export function signActivity(key: Buffer, sessionTokenHash: string, at: number): string {
  const mac = createHmac('sha256', key).update(`${sessionTokenHash}.${at}`).digest('base64url');
  return `${at}.${mac}`;
}

/** Returns the stamped time if the signature is valid for this session, else null. */
export function readActivity(key: Buffer, sessionTokenHash: string, stamp: string): number | null {
  const [atText, mac] = stamp.split('.');
  if (!atText || !mac || !/^\d+$/.test(atText)) {
    return null;
  }
  const at = Number(atText);
  const expected = signActivity(key, sessionTokenHash, at);
  return safeEqualStrings(expected, stamp) ? at : null;
}
