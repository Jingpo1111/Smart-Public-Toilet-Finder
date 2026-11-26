import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { Type } from 'class-transformer';
import { parseDurationToSeconds } from '../common/utils/duration';

const DURATION = /^(\d+|\d+\s*[smhdwSMHDW])$/;

/** Environment variables validated at startup. The process exits with a readable error if invalid. */
export class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  TRUST_PROXY = 0;

  @IsString()
  @Matches(/^postgres(ql)?:\/\//, { message: 'DATABASE_URL must be a postgresql:// connection string' })
  DATABASE_URL: string;

  @IsOptional()
  @IsString()
  DIRECT_URL?: string;

  /** Maximum pooled database connections held by this process. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  DB_POOL_MAX = 10;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters' })
  JWT_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET: string;

  @Matches(DURATION)
  JWT_EXPIRES_IN = '15m';

  @Matches(DURATION)
  JWT_REFRESH_EXPIRES_IN = '7d';

  @IsString()
  @IsNotEmpty()
  JWT_ISSUER = 'toiletgo-kh';

  @IsString()
  @IsNotEmpty()
  JWT_AUDIENCE = 'toiletgo-kh-web';

  @IsIn(['lax', 'strict', 'none'])
  COOKIE_SAMESITE: 'lax' | 'strict' | 'none' = 'lax';

  @IsOptional()
  @IsIn(['true', 'false'])
  COOKIE_SECURE?: string;

  @IsOptional()
  @IsString()
  COOKIE_DOMAIN?: string;

  @IsString()
  @Matches(/^https?:\/\//, { message: 'SUPABASE_URL must be an http(s) URL' })
  SUPABASE_URL: string;

  @IsString()
  @MinLength(20, { message: 'SUPABASE_SERVICE_ROLE_KEY looks invalid' })
  SUPABASE_SERVICE_ROLE_KEY: string;

  @IsString() SUPABASE_TOILET_BUCKET = 'toilet-images';
  @IsString() SUPABASE_SUGGESTION_BUCKET = 'suggestion-images';
  @IsString() SUPABASE_REPORT_BUCKET = 'report-images';
  @IsString() SUPABASE_AVATAR_BUCKET = 'avatars';

  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(7 * 24 * 3600)
  SIGNED_URL_EXPIRES_IN = 3600;

  /** Frontend on your computer, e.g. http://localhost:5173 (allowed by CORS; used for links in development). */
  @IsOptional()
  @IsString()
  FRONTEND_URL_LOCAL?: string;

  /** Public frontend, e.g. https://yourdomain.com (allowed by CORS; used for links in production). */
  @IsOptional()
  @IsString()
  FRONTEND_URL_PUBLIC?: string;

  /** Optional extra allowed origins, comma-separated (kept for backward compatibility). */
  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  @IsOptional() @IsString() SMTP_HOST?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535) SMTP_PORT?: number;
  @IsOptional() @IsString() SMTP_USER?: string;
  @IsOptional() @IsString() SMTP_PASSWORD?: string;
  @IsOptional() @IsIn(['true', 'false']) SMTP_SECURE?: string;
  @IsOptional() @IsString() SMTP_FROM?: string;

  @IsOptional() @IsIn(['true', 'false']) SWAGGER_ENABLED?: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(24 * 60)
  PASSWORD_RESET_EXPIRES_MINUTES = 30;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT = 120;

  @IsOptional() @IsIn(['true', 'false']) THROTTLE_DISABLED?: string;
}

/** Splits a comma-separated list of origins and removes trailing slashes. */
export function splitOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** Returns an error message when `value` is not a bare http(s) origin such as https://yourdomain.com. */
function originError(name: string, value: string): string | null {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol)) return `${name}: "${value}" must start with http:// or https://`;
    if (u.origin !== value) return `${name}: "${value}" must be an origin only, without path (e.g. ${u.origin})`;
    return null;
  } catch {
    return `${name}: "${value}" is not a valid URL (e.g. https://yourdomain.com)`;
  }
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  // Treat empty strings from .env placeholders as "unset" so defaults and @IsOptional apply.
  const cleaned = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== ''));
  const validated = plainToInstance(EnvironmentVariables, cleaned, { enableImplicitConversion: false });
  const errors = validateSync(validated, { skipMissingProperties: false, whitelist: false });

  const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}).map((m) => `  - ${m}`));
  if (validated.JWT_SECRET && validated.JWT_SECRET === validated.JWT_REFRESH_SECRET) {
    messages.push('  - JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }
  for (const key of ['JWT_EXPIRES_IN', 'JWT_REFRESH_EXPIRES_IN'] as const) {
    try {
      parseDurationToSeconds(String(validated[key]));
    } catch (e) {
      messages.push(`  - ${key}: ${(e as Error).message}`);
    }
  }
  if (validated.COOKIE_SAMESITE === 'none' && validated.COOKIE_SECURE === 'false') {
    messages.push('  - COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
  }
  const frontends: [string, string[]][] = [
    ['FRONTEND_URL_LOCAL', splitOrigins(validated.FRONTEND_URL_LOCAL)],
    ['FRONTEND_URL_PUBLIC', splitOrigins(validated.FRONTEND_URL_PUBLIC)],
    ['FRONTEND_URL', splitOrigins(validated.FRONTEND_URL)],
  ];
  if (frontends.every(([, list]) => list.length === 0)) {
    messages.push('  - Set FRONTEND_URL_LOCAL and/or FRONTEND_URL_PUBLIC (the frontend addresses allowed to use this API)');
  }
  for (const [name, list] of frontends) {
    if ((name === 'FRONTEND_URL_LOCAL' || name === 'FRONTEND_URL_PUBLIC') && list.length > 1) {
      messages.push(`  - ${name} must contain one address (use FRONTEND_URL for extra comma-separated origins)`);
    }
    for (const origin of list) {
      const err = originError(name, origin);
      if (err) messages.push(`  - ${err}`);
    }
  }
  if (validated.SMTP_HOST && !validated.SMTP_PORT) {
    messages.push('  - SMTP_PORT is required when SMTP_HOST is set');
  }
  if (messages.length) {
    throw new Error(`Invalid environment configuration:\n${messages.join('\n')}\nSee .env.example.`);
  }
  return validated;
}
