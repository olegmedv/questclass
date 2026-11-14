#!/usr/bin/env node
// Container HEALTHCHECK: the server in this container answers GET /api/health with 200.
// The probe never touches the database (see modules/health/routes.ts).
const port = process.env.PORT || '8080';

try {
  const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(4000),
  });
  process.exit(res.status === 200 ? 0 : 1);
} catch {
  process.exit(1);
}
