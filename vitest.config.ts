import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/**/index.ts',
        'src/automator/solo-runner.ts', // Requires real Hedera Solo — integration-only
      ],
      thresholds: {
        branches: 60,
        functions: 75,
        lines: 75,
        statements: 75,
      },
    },
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@types': resolve(__dirname, 'src/types'),
      '@simulator': resolve(__dirname, 'src/simulator'),
      '@automator': resolve(__dirname, 'src/automator'),
      '@migration': resolve(__dirname, 'src/migration'),
      '@ai': resolve(__dirname, 'src/ai'),
    },
  },
});
