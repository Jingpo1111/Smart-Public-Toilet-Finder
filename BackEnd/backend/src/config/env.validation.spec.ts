import type { ConfigService } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.validation';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-xxxxxxxxxxxxxxxx',
  FRONTEND_URL_LOCAL: 'http://localhost:5173',
};

/** AppConfigService over a validated environment (same path the app uses at startup). */
function configFor(env: Record<string, string>) {
  const validated = validateEnv(env) as unknown as Record<string, unknown>;
  return new AppConfigService({ get: (k: string) => validated[k] } as unknown as ConfigService<never, true>);
}

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

  it('requires at least one frontend address and accepts only bare origins', () => {
    const { FRONTEND_URL_LOCAL: _l, ...noFrontend } = valid;
    expect(() => validateEnv(noFrontend)).toThrow(/FRONTEND_URL_LOCAL and\/or FRONTEND_URL_PUBLIC/);
    expect(() => validateEnv({ ...valid, FRONTEND_URL_PUBLIC: 'https://site.example/app' })).toThrow(/origin only/);
    expect(() => validateEnv({ ...valid, FRONTEND_URL_PUBLIC: 'site.example' })).toThrow(/not a valid URL/);
    expect(() => validateEnv({ ...valid, FRONTEND_URL_PUBLIC: 'ftp://site.example' })).toThrow(/http/);
    expect(() => validateEnv({ ...valid, FRONTEND_URL_PUBLIC: 'https://a.example,https://b.example' })).toThrow(/one address/);
    expect(() => validateEnv({ ...valid, FRONTEND_URL_PUBLIC: 'https://site.example/' })).not.toThrow(); // trailing slash ok
  });
});

describe('frontend addresses (local + public)', () => {
  const both = { ...valid, FRONTEND_URL_PUBLIC: 'https://toiletgo.example/' };

  it('allows both origins (plus extra FRONTEND_URL entries) for CORS/CSRF', () => {
    const cfg = configFor({ ...both, FRONTEND_URL: 'https://staging.example, http://localhost:5173' });
    expect(cfg.frontendOrigins).toEqual(['http://localhost:5173', 'https://toiletgo.example', 'https://staging.example']);
  });

  it('builds e-mail/QR links with the public site in production and the local site otherwise', () => {
    expect(configFor({ ...both, NODE_ENV: 'production', COOKIE_SECURE: 'true' }).frontendUrl).toBe('https://toiletgo.example');
    expect(configFor({ ...both, NODE_ENV: 'development' }).frontendUrl).toBe('http://localhost:5173');
    expect(configFor({ ...valid, NODE_ENV: 'production' }).frontendUrl).toBe('http://localhost:5173'); // only local set
  });

  it('still supports the old single FRONTEND_URL variable', () => {
    const { FRONTEND_URL_LOCAL: _l, ...rest } = valid;
    const cfg = configFor({ ...rest, FRONTEND_URL: 'https://old.example,http://localhost:5173' });
    expect(cfg.frontendOrigins).toEqual(['https://old.example', 'http://localhost:5173']);
    expect(cfg.frontendUrl).toBe('https://old.example');
  });
});
