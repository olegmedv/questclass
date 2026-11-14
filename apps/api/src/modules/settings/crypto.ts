import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const FORMAT_VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Derives purpose-specific keys from the master key, so it is never used directly. */
export interface Keyring {
  derive(purpose: string): Buffer;
}

export function createKeyring(masterKey: Buffer): Keyring {
  const cache = new Map<string, Buffer>();
  return {
    derive(purpose) {
      let key = cache.get(purpose);
      if (!key) {
        const info = `questclass/${purpose}`;
        key = Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), info, KEY_BYTES));
        cache.set(purpose, key);
      }
      return key;
    },
  };
}

/**
 * AES-256-GCM with a random IV. `aad` binds the ciphertext to its context (the secret's
 * key), so a ciphertext copied to another row does not decrypt.
 */
export function encrypt(key: Buffer, plaintext: string, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const parts = [iv, tag, data].map((part) => part.toString('base64url'));
  return [FORMAT_VERSION, ...parts].join('.');
}

/** Reverses `encrypt`; throws if the data was altered or the key/AAD do not match. */
export function decrypt(key: Buffer, token: string, aad: string): string {
  const [version, iv, tag, data] = token.split('.');
  if (version !== FORMAT_VERSION || !iv || !tag || data === undefined) {
    throw new Error('Unsupported ciphertext format');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
