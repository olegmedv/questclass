import type { Hono } from 'hono';
import { createApp } from '../../src/app';
import type { AppEnv, RouteDef } from '../../src/http/route';
import { DEVICE_COOKIE } from '../../src/modules/auth/routes';
import {
  createClient,
  createLearner,
  loginAdmin,
  seedAdmin,
  trustDevice,
  type RequestOptions,
  type TestClient,
} from '../helpers/client';
import { createTestRuntime, type TestRuntime } from '../helpers/db';

/** Who makes a request in the access matrix. */
export type Persona = 'anon' | 'import' | 'learnerA' | 'learnerB' | 'admin';
export const PERSONAS: readonly Persona[] = ['anon', 'import', 'learnerA', 'learnerB', 'admin'];

export interface TwoLearners {
  readonly runtime: TestRuntime;
  readonly app: Hono<AppEnv>;
  readonly routes: readonly RouteDef[];
  readonly ids: {
    readonly admin: number;
    readonly learnerA: number;
    readonly learnerB: number;
    /** The tablet both learners are signed in on. */
    readonly device: number;
    /** A second trusted device nobody uses (safe to revoke). */
    readonly spareDevice: number;
    /** The import token the `import` persona presents. */
    readonly importToken: number;
  };
  /** A fresh browser carrying the persona's cookies; cookie changes do not leak back. */
  as(persona: Persona): TestClient;
  close(): Promise<void>;
}

function withHeaders(client: TestClient, extra: Record<string, string>): TestClient {
  const request = (method: string, path: string, options: RequestOptions = {}) =>
    client.request(method, path, { ...options, headers: { ...extra, ...options.headers } });
  return {
    cookies: client.cookies,
    request,
    get: (path) => request('GET', path),
    post: (path, json) => request('POST', path, json === undefined ? {} : { json }),
    patch: (path, json) => request('PATCH', path, { json }),
    delete: (path) => request('DELETE', path),
  };
}

/**
 * One admin and two learners (A and B) signed in on the same trusted tablet, each in their own
 * browser, plus an anonymous visitor and an import client.
 */
export async function createTwoLearners(): Promise<TwoLearners> {
  const runtime = await createTestRuntime();
  try {
    const built = createApp(runtime.ctx);
    const app = built.app;
    const admin = await seedAdmin(runtime.ctx);
    const learnerA = await createLearner(runtime.ctx, 'Аня', '1111');
    const learnerB = await createLearner(runtime.ctx, 'Боря', '2222');

    const adminBrowser = createClient(app);
    await loginAdmin(adminBrowser);
    const device = await trustDevice(adminBrowser, 'Планшет');
    const deviceToken = adminBrowser.cookies.get(DEVICE_COOKIE) ?? '';
    adminBrowser.cookies.delete(DEVICE_COOKIE);
    const spareDevice = await trustDevice(adminBrowser, 'Запасной');
    // The admin's own browser is not a child's device.
    adminBrowser.cookies.delete(DEVICE_COOKIE);

    const learnerBrowser = async (userId: number, pin: string): Promise<TestClient> => {
      const browser = createClient(app);
      browser.cookies.set(DEVICE_COOKIE, deviceToken);
      const res = await browser.post('/api/auth/learner-login', { userId, pin });
      if (res.status !== 200) {
        throw new Error(`Learner login failed: ${res.status}`);
      }
      return browser;
    };

    // The lesson-prep tool: a real token, no cookies.
    const issued = runtime.ctx.imports.createToken('lesson-prep', admin);

    const jars: Record<Persona, Map<string, string>> = {
      anon: new Map(),
      import: new Map(),
      learnerA: (await learnerBrowser(learnerA, '1111')).cookies,
      learnerB: (await learnerBrowser(learnerB, '2222')).cookies,
      admin: adminBrowser.cookies,
    };

    return {
      runtime,
      app,
      routes: built.routes,
      ids: { admin, learnerA, learnerB, device, spareDevice, importToken: issued.id },
      as(persona) {
        const browser = createClient(app);
        for (const [name, value] of jars[persona]) {
          browser.cookies.set(name, value);
        }
        return persona === 'import'
          ? withHeaders(browser, { authorization: `Bearer ${issued.token}` })
          : browser;
      },
      close: () => runtime.close(),
    };
  } catch (err) {
    await runtime.close();
    throw err;
  }
}
