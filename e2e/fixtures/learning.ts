// `test` for the learner-screen specs (home, quiz, video). They run on a second installation
// prepared by global setup (the shared one keeps a fixed set of learners for the login
// screenshots); each test gets a learner of its own, signed in on the trusted device, with tasks
// assigned to it only — so specs running in parallel never see each other's tasks.
import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { createLearner, signIn, type TestLearner } from './content';
import { LEARNING_STORAGE } from './paths';
import { e2eEnv, expect, test as base } from './test';

interface LearningFixtures {
  /** The admin of the learning installation, as an API client. */
  admin: APIRequestContext;
  /** A fresh learner of this test, already signed in in `page`. */
  learner: TestLearner;
  /** Paths of the generated video fixtures. */
  clips: { readonly mp4: string; readonly hls: string };
}

function learningBaseURL(): string {
  const url = process.env['E2E_LEARNING_BASE_URL'];
  if (!url) throw new Error('E2E_LEARNING_BASE_URL is not set: run through playwright.config.ts');
  return url;
}

export const test = base.extend<LearningFixtures>({
  // eslint-disable-next-line no-empty-pattern
  baseURL: async ({}, use) => {
    await use(learningBaseURL());
  },
  // The browser is the trusted children's device of the learning installation.
  // eslint-disable-next-line no-empty-pattern
  storageState: async ({}, use) => {
    await use(LEARNING_STORAGE.device);
  },
  // eslint-disable-next-line no-empty-pattern
  admin: async ({}, use) => {
    const admin = await playwrightRequest.newContext({
      baseURL: learningBaseURL(),
      storageState: LEARNING_STORAGE.admin,
    });
    await use(admin);
    await admin.dispose();
  },
  learner: async ({ admin, page }, use) => {
    const learner = await createLearner(admin);
    await signIn(page, learner);
    await use(learner);
  },
  // eslint-disable-next-line no-empty-pattern
  clips: async ({}, use) => {
    await use(e2eEnv().video);
  },
});

export { expect };
export { expectNoHorizontalScroll, expectScreenshot } from './test';
