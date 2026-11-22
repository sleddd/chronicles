import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // No feature previews in tests (services/previews already defaults to none — this pins it whatever the shell sets), so the
    // user objects the routes return stay as the tests expect
    env: { PREVIEW_ACCOUNT_IDS: '' },
    // The route tests hash real passwords (bcrypt, 12 rounds, several a test).
    // With test files sharing the CPU one now and then ran past the 5 s default
    testTimeout: 20_000,
  },
});
