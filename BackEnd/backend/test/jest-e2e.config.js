/**
 * Integration / end-to-end tests. They boot the real Nest application against a real PostgreSQL
 * database given by TEST_DATABASE_URL (never production). Supabase Storage and SMTP are replaced
 * with in-memory test doubles; see test/support/.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  globalSetup: '<rootDir>/test/support/global-setup.ts',
  setupFiles: ['reflect-metadata', '<rootDir>/test/support/env.ts'],
  testEnvironment: 'node',
  testTimeout: 60000,
};
