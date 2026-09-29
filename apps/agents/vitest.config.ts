import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      API_TO_AGENTS_INTERNAL_TOKEN: 'test-internal-token-that-is-at-least-32-chars',
      AGENTS_STORAGE_DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      AGENTS_MODEL_PROVIDER: 'mock',
    },
  },
});
