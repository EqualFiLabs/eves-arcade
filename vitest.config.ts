import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/sim/**/*.test.ts', 'tests/content/**/*.test.ts', 'tests/controls/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
