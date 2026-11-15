import type { Hono } from 'hono';
import type { AppContext } from '../../src/app';
import type { AppEnv } from '../../src/http/route';

export interface ClientOptions {
  /** Address of the TCP peer as the server sees it (default 127.0.0.1). */
  readonly peer?: string;
  /** X-Forwarded-For sent with every request. */
  readonly forwardedFor?: string;
}

export interface RequestOptions {
  readonly json?: unknown;
  /** Raw bytes (a file upload), sent as `application/octet-stream`. */
  readonly bytes?: Uint8Array;
  readonly headers?: Record<string, string>;
}

/** A browser stand-in: keeps cookies between requests like a real cookie jar. */
export interface TestClient {
  readonly cookies: Map<string, string>;
  request(method: string, path: string, options?: RequestOptions): Promise<Response>;
  get(path: string): Promise<Response>;
  post(path: string, json?: unknown): Promise<Response>;
  patch(path: string, json: unknown): Promise<Response>;
  delete(path: string): Promise<Response>;
}

function applySetCookie(jar: Map<string, string>, header: string): void {
  const [pair = '', ...attributes] = header.split(';');
  const eq = pair.indexOf('=');
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a));
  if (expired || value === '') {
    jar.delete(name);
  } else {
    jar.set(name, value);
  }
}

export function createClient(app: Hono<AppEnv>, options: ClientOptions = {}): TestClient {
  const cookies = new Map<string, string>();
  const env = {
    incoming: { socket: { remoteAddress: options.peer ?? '127.0.0.1' } },
  } as unknown as AppEnv['Bindings'];

  const request = async (method: string, path: string, opts: RequestOptions = {}) => {
    const headers: Record<string, string> = { ...opts.headers };
    if (cookies.size > 0) {
      headers['cookie'] = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    if (options.forwardedFor) {
      headers['x-forwarded-for'] = options.forwardedFor;
    }
    let body: string | Uint8Array | undefined;
    if (opts.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.json);
    } else if (opts.bytes !== undefined) {
      headers['content-type'] = 'application/octet-stream';
      body = opts.bytes;
    }
    const res = await app.request(path, { method, headers, ...(body && { body }) }, env);
    for (const header of res.headers.getSetCookie()) {
      applySetCookie(cookies, header);
    }
    return res;
  };

  return {
    cookies,
    request,
    get: (path) => request('GET', path),
    post: (path, json) => request('POST', path, json === undefined ? {} : { json }),
    patch: (path, json) => request('PATCH', path, { json }),
    delete: (path) => request('DELETE', path),
  };
}

export interface AdminCredentials {
  readonly name: string;
  readonly login: string;
  readonly password: string;
}

export const ADMIN: AdminCredentials = {
  name: 'Мама',
  login: 'mama',
  password: 'correct-horse-battery',
};

/** Creates the first admin directly (no setup token) and returns its id. */
export async function seedAdmin(ctx: AppContext, admin: AdminCredentials = ADMIN): Promise<number> {
  return (await ctx.users.createFirstAdmin(admin)).id;
}

/** Logs the client in as an admin; throws if that fails. */
export async function loginAdmin(
  client: TestClient,
  admin: AdminCredentials = ADMIN,
): Promise<void> {
  const res = await client.post('/api/auth/login', {
    login: admin.login,
    password: admin.password,
  });
  if (res.status !== 200) {
    throw new Error(`Admin login failed: ${res.status} ${await res.text()}`);
  }
}

/** Marks the client's browser as a trusted (child's) device; the client must be an admin. */
export async function trustDevice(client: TestClient, name = 'Планшет'): Promise<number> {
  const res = await client.post('/api/auth/devices', { name });
  if (res.status !== 201) {
    throw new Error(`Trusting the device failed: ${res.status} ${await res.text()}`);
  }
  return ((await res.json()) as { id: number }).id;
}

export async function createLearner(ctx: AppContext, name: string, pin: string): Promise<number> {
  return (await ctx.users.create({ role: 'learner', name, pin }, null)).id;
}

/** Errors are `{ error: { code } }`; returns the code. */
export async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}
