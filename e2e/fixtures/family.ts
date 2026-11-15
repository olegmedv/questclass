// Test family: the first admin, one learner and a trusted (children's) device, created through
// the real API. Sessions are handed to the browser as Playwright storage states.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax';
}

/** A minimal cookie jar for one client of the API (cookies are host-wide, ports do not matter). */
export class CookieJar {
  private readonly cookies = new Map<string, { value: string; expires: number }>();

  constructor(private readonly host: string) {}

  store(res: Response): void {
    for (const header of res.headers.getSetCookie()) {
      const [pair = '', ...attributes] = header.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const maxAge = attributes
        .map((a) => /^\s*max-age=(-?\d+)\s*$/i.exec(a)?.[1])
        .find((v) => v !== undefined);
      if (value === '' || maxAge === '0') {
        this.cookies.delete(name);
      } else {
        const expires = maxAge === undefined ? -1 : Math.floor(Date.now() / 1000) + Number(maxAge);
        this.cookies.set(name, { value, expires });
      }
    }
  }

  header(): string {
    return [...this.cookies].map(([name, { value }]) => `${name}=${value}`).join('; ');
  }

  only(...names: string[]): CookieJar {
    const copy = new CookieJar(this.host);
    for (const name of names) {
      const cookie = this.cookies.get(name);
      if (cookie) copy.cookies.set(name, cookie);
    }
    return copy;
  }

  /** Playwright storage state with these cookies. */
  storageState(): { cookies: StoredCookie[]; origins: [] } {
    const cookies = [...this.cookies].map(([name, { value, expires }]) => ({
      name,
      value,
      domain: this.host,
      path: '/',
      expires,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax' as const,
    }));
    return { cookies, origins: [] };
  }

  writeStorageState(file: string): void {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(this.storageState(), null, 2));
  }
}

export async function apiCall<T>(
  apiURL: string,
  jar: CookieJar,
  method: string,
  path: string,
  json?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const cookie = jar.header();
  if (cookie) headers['cookie'] = cookie;
  if (json !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(apiURL + path, {
    method,
    headers,
    ...(json !== undefined && { body: JSON.stringify(json) }),
  });
  jar.store(res);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

export const ADMIN = { login: 'mama', password: 'e2e-password-1', name: 'Мама' } as const;
export const LEARNER = { name: 'Саша', pin: '2468' } as const;
export const DEVICE_NAME = 'Планшет (e2e)';

export interface Family {
  readonly admin: typeof ADMIN & { readonly id: number };
  readonly learner: typeof LEARNER & { readonly id: number };
  /** Cookies of the admin's browser (session + idle stamp). */
  readonly adminJar: CookieJar;
  /** Cookies of the trusted children's device with the learner signed in. */
  readonly learnerJar: CookieJar;
  /** Cookies of the trusted device with nobody signed in (profile picker). */
  readonly deviceJar: CookieJar;
}

export async function createAdmin(apiURL: string, host: string, token: string) {
  const jar = new CookieJar(host);
  const me = await apiCall<{ id: number }>(apiURL, jar, 'POST', '/api/setup', { token, ...ADMIN });
  return { id: me.id, jar };
}

export async function createLearner(apiURL: string, adminJar: CookieJar, learner = LEARNER) {
  const user = await apiCall<{ id: number }>(apiURL, adminJar, 'POST', '/api/admin/users', {
    role: 'learner',
    name: learner.name,
    pin: learner.pin,
  });
  return user.id;
}

/** Runs setup on a fresh API and creates the learner and the trusted device. */
export async function seedFamily(apiURL: string, token: string): Promise<Family> {
  const host = new URL(apiURL).hostname;
  const admin = await createAdmin(apiURL, host, token);
  const learnerId = await createLearner(apiURL, admin.jar);
  // The device cookie is issued to the admin's browser; the children's device gets a copy of it.
  const trusted = admin.jar.only('qc_session', 'qc_act');
  await apiCall(apiURL, trusted, 'POST', '/api/auth/devices', { name: DEVICE_NAME });
  const deviceJar = trusted.only('qc_device');
  const learnerJar = deviceJar.only('qc_device');
  await apiCall(apiURL, learnerJar, 'POST', '/api/auth/learner-login', {
    userId: learnerId,
    pin: LEARNER.pin,
  });
  return {
    admin: { ...ADMIN, id: admin.id },
    learner: { ...LEARNER, id: learnerId },
    adminJar: admin.jar,
    learnerJar,
    deviceJar,
  };
}
