// Component-test environment: jest-dom matchers, a clean DOM after every test, and the
// browser APIs jsdom lacks.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
