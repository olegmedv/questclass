import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    // Integration tests start a full runtime and hash passwords with scrypt. With every test file
    // running in parallel the CPU is shared, and the 5 s default is sometimes not enough.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
