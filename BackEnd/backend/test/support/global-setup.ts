import { execSync } from 'node:child_process';

/**
 * Applies migrations to the isolated test database. Refuses databases that do not look like test
 * databases so that integration tests can never mutate development or production data.
 */
export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for e2e tests (see test/support/env.ts).');
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(dbName) && process.env.ALLOW_ANY_TEST_DB !== 'true') {
    throw new Error(`Refusing to run e2e tests against database "${dbName}": its name must contain "test".`);
  }
  if (/supabase\.(co|com)/.test(url) && process.env.ALLOW_REMOTE_TEST_DB !== 'true') {
    throw new Error('Refusing to run e2e tests against a Supabase host. Use a local/isolated test database.');
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
