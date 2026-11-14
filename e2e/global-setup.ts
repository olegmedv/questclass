// Prepares one installation for the whole run: video fixtures, API + SPA on a temporary
// DATA_DIR, the test family and the browser sessions of each persona.
import { seedFamily } from './fixtures/family';
import { STORAGE } from './fixtures/paths';
import { startStack } from './fixtures/stack';
import { ensureVideoFixtures } from './fixtures/video';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const video = ensureVideoFixtures();
  const stack = await startStack();
  try {
    if (!stack.setupToken) {
      throw new Error('A fresh API must print a setup token');
    }
    const family = await seedFamily(stack.apiURL, stack.setupToken);
    family.adminJar.writeStorageState(STORAGE.admin);
    family.learnerJar.writeStorageState(STORAGE.learner);
    family.deviceJar.writeStorageState(STORAGE.device);
    // Workers inherit these variables (see fixtures/test.ts).
    process.env['E2E_BASE_URL'] = stack.baseURL;
    process.env['E2E_API_URL'] = stack.apiURL;
    process.env['E2E_FAMILY'] = JSON.stringify({ admin: family.admin, learner: family.learner });
    process.env['E2E_VIDEO_MP4'] = video.mp4;
    process.env['E2E_VIDEO_HLS'] = video.hls;
  } catch (err) {
    await stack.stop();
    throw err;
  }
  return () => stack.stop();
}
