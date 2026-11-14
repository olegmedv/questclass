/** Recognising SQLite constraint failures (the driver may wrap the original error in `cause`). */

function messages(err: unknown): string[] {
  const out: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current instanceof Error && depth < 3; depth += 1) {
    out.push(current.message);
    current = current.cause;
  }
  return out;
}

/** A row is still referenced (FK `ON DELETE RESTRICT`) or references a missing row. */
export function isForeignKeyViolation(err: unknown): boolean {
  return messages(err).some((m) => m.includes('FOREIGN KEY constraint failed'));
}

/** A UNIQUE index on `table.column` (as SQLite names it, e.g. `subjects.key`) was violated. */
export function isUniqueViolation(err: unknown, column: string): boolean {
  return messages(err).some((m) => m.includes(`UNIQUE constraint failed: ${column}`));
}
