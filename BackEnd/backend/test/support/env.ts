/**
 * Loaded by Jest (setupFiles) BEFORE any application module is imported, so the config module
 * validates these values instead of a developer's .env. Tests never use production resources:
 * storage and mail are replaced by in-memory doubles and the database comes from TEST_DATABASE_URL.
 */
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Point it at an isolated PostgreSQL database whose name contains "test", e.g.\n' +
      '  TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/toiletgo_test npm run test:e2e',
  );
}

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: testDb,
  DIRECT_URL: testDb,
  JWT_SECRET: 'test-access-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  JWT_ISSUER: 'toiletgo-kh',
  JWT_AUDIENCE: 'toiletgo-kh-web',
  SUPABASE_URL: 'http://storage.test.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-used-in-tests',
  FRONTEND_URL_LOCAL: 'http://localhost:5173',
  FRONTEND_URL_PUBLIC: 'https://toiletgo.test.invalid',
  THROTTLE_DISABLED: 'true',
  COOKIE_SECURE: 'false',
  COOKIE_SAMESITE: 'lax',
  SWAGGER_ENABLED: 'false',
  SMTP_HOST: 'smtp.test.invalid',
  SMTP_PORT: '2525',
  SMTP_FROM: 'ToiletGo KH Test <no-reply@test.invalid>',
});
