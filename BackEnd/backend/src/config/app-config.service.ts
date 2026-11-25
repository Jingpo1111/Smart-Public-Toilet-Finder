import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseDurationToSeconds } from '../common/utils/duration';
import { EnvironmentVariables } from './env.validation';

export interface BucketConfig {
  toilet: string;
  suggestion: string;
  report: string;
  avatar: string;
}

/** Strongly typed, read-only view over validated environment variables. */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  private get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv() {
    return this.get('NODE_ENV');
  }
  get isProduction() {
    return this.nodeEnv === 'production';
  }
  get isTest() {
    return this.nodeEnv === 'test';
  }
  get port() {
    return Number(this.get('PORT'));
  }
  get trustProxy() {
    return Number(this.get('TRUST_PROXY'));
  }
  get databaseUrl() {
    return this.get('DATABASE_URL');
  }

  /** Allowed browser origins for CORS / CSRF origin checks. */
  get frontendOrigins(): string[] {
    return String(this.get('FRONTEND_URL'))
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean);
  }
  /** Primary frontend URL used to build links in e-mails and QR codes. */
  get frontendUrl(): string {
    return this.frontendOrigins[0];
  }

  get jwt() {
    return {
      secret: this.get('JWT_SECRET'),
      refreshSecret: this.get('JWT_REFRESH_SECRET'),
      expiresInSeconds: parseDurationToSeconds(String(this.get('JWT_EXPIRES_IN'))),
      refreshExpiresInSeconds: parseDurationToSeconds(String(this.get('JWT_REFRESH_EXPIRES_IN'))),
      issuer: this.get('JWT_ISSUER'),
      audience: this.get('JWT_AUDIENCE'),
    };
  }

  get cookie() {
    const secureEnv = this.get('COOKIE_SECURE');
    return {
      sameSite: this.get('COOKIE_SAMESITE'),
      secure: secureEnv === undefined ? this.isProduction : secureEnv === 'true',
      domain: this.get('COOKIE_DOMAIN') || undefined,
    };
  }

  get supabase() {
    return {
      url: this.get('SUPABASE_URL'),
      serviceRoleKey: this.get('SUPABASE_SERVICE_ROLE_KEY'),
      signedUrlExpiresIn: Number(this.get('SIGNED_URL_EXPIRES_IN')),
      buckets: {
        toilet: this.get('SUPABASE_TOILET_BUCKET'),
        suggestion: this.get('SUPABASE_SUGGESTION_BUCKET'),
        report: this.get('SUPABASE_REPORT_BUCKET'),
        avatar: this.get('SUPABASE_AVATAR_BUCKET'),
      } satisfies BucketConfig,
    };
  }

  get smtp() {
    const host = this.get('SMTP_HOST');
    return {
      configured: Boolean(host),
      host,
      port: this.get('SMTP_PORT') ? Number(this.get('SMTP_PORT')) : undefined,
      user: this.get('SMTP_USER'),
      password: this.get('SMTP_PASSWORD'),
      secure: this.get('SMTP_SECURE') === 'true',
      from: this.get('SMTP_FROM') || 'ToiletGo KH <no-reply@localhost>',
    };
  }

  get swaggerEnabled(): boolean {
    const v = this.get('SWAGGER_ENABLED');
    return v === undefined ? !this.isProduction : v === 'true';
  }

  get passwordResetExpiresMinutes() {
    return Number(this.get('PASSWORD_RESET_EXPIRES_MINUTES'));
  }

  get throttle() {
    return { limit: Number(this.get('THROTTLE_LIMIT')), disabled: this.get('THROTTLE_DISABLED') === 'true' };
  }
}
