// Prepares the installations for the whole run: video fixtures; the shared installation (API +
// SPA on a temporary DATA_DIR) with the test family and the browser sessions of each persona; and
// a second installation for the learner-screen specs, where every test adds a learner and tasks
// of its own (so the learner lists of the shared one stay fixed for the login screenshots).
import { seedFamily } from './fixtures/family';
import { LEARNING_STORAGE, STORAGE } from './fixtures/paths';
import { startStack, type Stack } from './fixtures/stack';
import { ensureVideoFixtures } from './fixtures/video';

async function seeded(stack: Stack) {
  if (!stack.setupToken) {
    throw new Error('A fresh API must print a setup token');
  }
  return seedFamily(stack.apiURL, stack.setupToken);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const video = ensureVideoFixtures();
  const stacks: Stack[] = [];
  const stopAll = () => Promise.all(stacks.map((stack) => stack.stop())).then(() => undefined);
  try {
    const stack = await startStack();
    stacks.push(stack);
    const learning = await startStack();
    stacks.push(learning);
    const family = await seeded(stack);
    family.adminJar.writeStorageState(STORAGE.admin);
    family.learnerJar.writeStorageState(STORAGE.learner);
    family.deviceJar.writeStorageState(STORAGE.device);
    const learningFamily = await seeded(learning);
    learningFamily.adminJar.writeStorageState(LEARNING_STORAGE.admin);
    learningFamily.deviceJar.writeStorageState(LEARNING_STORAGE.device);
    // Workers inherit these variables (see fixtures/test.ts and fixtures/learning.ts).
    process.env['E2E_BASE_URL'] = stack.baseURL;
    process.env['E2E_API_URL'] = stack.apiURL;
    process.env['E2E_FAMILY'] = JSON.stringify({ admin: family.admin, learner: family.learner });
    process.env['E2E_LEARNING_BASE_URL'] = learning.baseURL;
    process.env['E2E_VIDEO_MP4'] = video.mp4;
    process.env['E2E_VIDEO_HLS'] = video.hls;
  } catch (err) {
    await stopAll();
    throw err;
  }
  return stopAll;
}
