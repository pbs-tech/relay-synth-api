import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // config.ts resolves these at module load, so they must exist before the
    // first import rather than inside a beforeAll.
    env: {
      TABLE_NAME: 'relay-synth-test',
      AWS_REGION: 'eu-west-2',
      LOG_LEVEL: 'error',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
