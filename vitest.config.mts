import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      include: ['src/**/*.ts'],
      thresholds: {
        branches: 55,
        functions: 65,
        lines: 60,
        statements: 60,
      },
    },
  },
});
