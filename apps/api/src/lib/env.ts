import { z } from 'zod';

// El .env vive en la raíz del monorepo; si no existe se usan las variables del entorno.
try {
  process.loadEnvFile(new URL('../../../../.env', import.meta.url));
} catch {
  // sin .env
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DIAS: z.coerce.number().int().positive().default(7),
  CORS_ORIGINS: z.string().transform((s) => s.split(',').map((o) => o.trim())),
  MENU_PUBLIC_URL: z.url(),
});

export const env = schema.parse(process.env);
