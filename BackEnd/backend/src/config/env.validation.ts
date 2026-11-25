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

  @IsString()
  @IsNotEmpty()
  FRONTEND_URL = 'http://localhost:5173';

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
  if (validated.SMTP_HOST && !validated.SMTP_PORT) {
    messages.push('  - SMTP_PORT is required when SMTP_HOST is set');
  }
  if (messages.length) {
    throw new Error(`Invalid environment configuration:\n${messages.join('\n')}\nSee .env.example.`);
  }
  return validated;
}
