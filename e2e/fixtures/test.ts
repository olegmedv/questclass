// The `test` used by every spec: base URL of the shared installation, personas (browser
// sessions), a fresh installation on demand, and screenshot helpers.
import { expect, test as base, type Locator, type Page } from '@playwright/test';
import type { Family } from './family';
import { STORAGE, type Persona } from './paths';
import { startStack, type Stack } from './stack';

export interface E2EEnv {
  readonly baseURL: string;
  readonly apiURL: string;
  readonly family: Pick<Family, 'admin' | 'learner'>;
  readonly video: { readonly mp4: string; readonly hls: string };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set: run the suite through playwright.config.ts (global setup)`,
    );
  }
  return value;
}

export function e2eEnv(): E2EEnv {
  return {
    baseURL: requireEnv('E2E_BASE_URL'),
    apiURL: requireEnv('E2E_API_URL'),
    family: JSON.parse(requireEnv('E2E_FAMILY')) as E2EEnv['family'],
    video: { mp4: requireEnv('E2E_VIDEO_MP4'), hls: requireEnv('E2E_VIDEO_HLS') },
  };
}

interface Fixtures {
  /** Who is signed in in this browser: admin, learner (on the trusted device), the trusted
   *  device without a session, or nobody. Set with `test.use({ persona })`. */
  persona: Persona;
  env: E2EEnv;
  /** A separate, not yet set up installation (for setup flows); stopped after the test. */
  freshStack: Stack;
}

export const test = base.extend<Fixtures>({
  persona: ['anon', { option: true }],
  // Playwright needs the destructuring pattern even when a fixture has no dependencies.
  // eslint-disable-next-line no-empty-pattern
  env: async ({}, use) => {
    await use(e2eEnv());
  },
  baseURL: async ({ env }, use) => {
    await use(env.baseURL);
  },
  storageState: async ({ persona }, use) => {
    await use(persona === 'anon' ? { cookies: [], origins: [] } : STORAGE[persona]);
  },
  // eslint-disable-next-line no-empty-pattern
  freshStack: async ({}, use) => {
    const stack = await startStack();
    await use(stack);
    await stack.stop();
  },
});

export { expect };

/**
 * Screenshot baselines exist only for Linux (they are made in the Playwright container, like
 * CI). Elsewhere the comparison is skipped, so the suite stays runnable and never writes
 * baselines from another OS. `E2E_SCREENSHOTS=1|0` forces it on or off.
 */
export const screenshotsEnabled =
  process.env['E2E_SCREENSHOTS'] === '1' ||
  (process.platform === 'linux' && process.env['E2E_SCREENSHOTS'] !== '0');

export async function expectScreenshot(
  target: Page | Locator,
  name: string,
  /** Parts that differ between runs (a playing video) are painted over. */
  options: { readonly mask?: Locator[] } = {},
): Promise<void> {
  if (!screenshotsEnabled) {
    test.info().annotations.push({
      type: 'screenshot skipped',
      description: `${name}: baselines are made in the Linux container (pnpm e2e:update)`,
    });
    return;
  }
  if ('goto' in target) {
    await expect(target).toHaveScreenshot(`${name}.png`, { fullPage: true, ...options });
  } else {
    await expect(target).toHaveScreenshot(`${name}.png`, options);
  }
}

/** The page must fit the viewport width: no horizontal scrolling. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}
