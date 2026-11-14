/**
 * Last line of defence for audit payloads: any field whose name contains a sensitive word
 * (password, pin, token, value, secret, hash…) has its value replaced, at any depth.
 * Booleans and null are kept, so facts like `{ pinSet: true }` survive.
 */

export const REDACTED = '[redacted]';

const SENSITIVE_WORDS: ReadonlySet<string> = new Set([
  'password',
  'passcode',
  'pin',
  'token',
  'value',
  'secret',
  'hash',
]);

/** Splits `newPassword`, `pin_hash`, `API-Token` into lower-case words. */
function wordsOf(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function isSensitiveKey(key: string): boolean {
  return wordsOf(key).some(
    (word) =>
      SENSITIVE_WORDS.has(word) || (word.endsWith('s') && SENSITIVE_WORDS.has(word.slice(0, -1))),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns a deep copy of `value` with sensitive fields masked. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (isSensitiveKey(key) && field !== null && typeof field !== 'boolean') {
      out[key] = REDACTED;
    } else {
      out[key] = redact(field);
    }
  }
  return out;
}
