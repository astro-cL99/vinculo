import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'extension/modules/pii.js',
        'extension/modules/pii-rules.js',
        'extension/modules/lab-critical.js',
        'extension/modules/logger.js',
        'extension/modules/utils.js',
        'extension/rut-utils.js',
        'extension/dx-extract.js',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 55,
        statements: 70,
      },
      reporter: ['text', 'json-summary'],
    },
  },
});
