import { validateEnv } from './env.validation';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-xxxxxxxxxxxxxxxx',
};

describe('environment validation', () => {
  it('accepts a minimal valid configuration and applies defaults', () => {
    const env = validateEnv({ ...valid, PORT: '3000', SMTP_HOST: '' });
    expect(env.PORT).toBe(3000);
    expect(env.JWT_EXPIRES_IN).toBe('15m');
    expect(env.SUPABASE_TOILET_BUCKET).toBe('toilet-images');
    expect(env.SMTP_HOST).toBeUndefined(); // empty placeholder treated as unset
  });

  it('fails fast on missing or unsafe values', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/at least 32/);
    expect(() => validateEnv({ ...valid, JWT_REFRESH_SECRET: valid.JWT_SECRET })).toThrow(/must be different/);
    expect(() => validateEnv({ ...valid, COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' })).toThrow(/requires COOKIE_SECURE/);
    expect(() => validateEnv({ ...valid, SMTP_HOST: 'smtp.example.com' })).toThrow(/SMTP_PORT/);
    expect(() => validateEnv({ ...valid, JWT_EXPIRES_IN: 'forever' })).toThrow();
  });
});
