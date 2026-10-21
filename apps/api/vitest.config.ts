import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test' },
    globalSetup: ['tests/globalSetup.ts'],
    // Todos los tests comparten la BD de tests: se corren en serie.
    fileParallelism: false,
  },
});
