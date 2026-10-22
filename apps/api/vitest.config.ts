import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Las imágenes de los tests van a una carpeta temporal, no a apps/api/uploads.
    env: { NODE_ENV: 'test', UPLOADS_DIR: join(tmpdir(), 'menu-qr-test-uploads') },
    globalSetup: ['tests/globalSetup.ts'],
    // Todos los tests comparten la BD de tests: se corren en serie.
    fileParallelism: false,
  },
});
