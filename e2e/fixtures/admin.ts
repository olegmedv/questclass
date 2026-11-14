// `test` for the admin-area specs: every test gets an installation of its own (a fresh API and
// SPA) with the first admin already signed in in the browser. Admin screens list everything of
// the installation (all learners, all tasks), so only an installation nobody else touches gives
// stable lists and screenshots.
import { apiCall, createAdmin, type CookieJar } from './family';
import type { Stack } from './stack';
import { expect, test as base } from './test';

export interface AdminInstall {
  readonly stack: Stack;
  /** The admin's cookies, for preparing data through the API. */
  readonly jar: CookieJar;
  /** Calls the API of this installation as the admin. */
  call<T>(method: string, path: string, json?: unknown): Promise<T>;
}

export const test = base.extend<{ install: AdminInstall }>({
  install: async ({ freshStack, context }, use) => {
    if (!freshStack.setupToken) {
      throw new Error('A fresh API must print a setup token');
    }
    const host = new URL(freshStack.apiURL).hostname;
    const admin = await createAdmin(freshStack.apiURL, host, freshStack.setupToken);
    await context.addCookies(admin.jar.storageState().cookies);
    await use({
      stack: freshStack,
      jar: admin.jar,
      call: (method, path, json) => apiCall(freshStack.apiURL, admin.jar, method, path, json),
    });
  },
  baseURL: async ({ freshStack }, use) => {
    await use(freshStack.baseURL);
  },
});

export { expect };
export { expectNoHorizontalScroll, expectScreenshot } from './test';
