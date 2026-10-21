import { defineConfig, env } from 'prisma/config';

// El .env vive en la raíz del monorepo.
try {
  process.loadEnvFile('../../.env');
} catch {
  // sin .env: se usan las variables del entorno
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
