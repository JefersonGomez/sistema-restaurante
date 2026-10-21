import { execSync } from 'node:child_process';

// Aplica las migraciones a la BD de tests antes de correr la suite.
export default function () {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    // sin .env
  }
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Falta DATABASE_URL_TEST');
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: url },
  });
}
