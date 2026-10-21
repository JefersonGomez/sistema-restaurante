import { z } from 'zod';

// El .env vive en la raíz del monorepo; si no existe se usan las variables del entorno.
try {
  process.loadEnvFile(new URL('../../../../.env', import.meta.url));
} catch {
  // sin .env
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.url(),
  DATABASE_URL_TEST: z.url().optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DIAS: z.coerce.number().int().positive().default(7),
  CORS_ORIGINS: z.string().transform((s) => s.split(',').map((o) => o.trim())),
  MENU_PUBLIC_URL: z.url(),
});

const parsed = schema.parse(process.env);

// En tests se usa siempre la BD de tests para no tocar la de desarrollo.
if (parsed.NODE_ENV === 'test') {
  if (!parsed.DATABASE_URL_TEST) throw new Error('Falta DATABASE_URL_TEST');
  parsed.DATABASE_URL = parsed.DATABASE_URL_TEST;
}

export const env = parsed;
