import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { CSRF_KEY } from '../decorators/auth.decorators';

export const CSRF_HEADER = 'x-csrf-protection';

/**
 * CSRF defence for routes authenticated by the HttpOnly refresh cookie.
 *
 * 1. Custom header: `X-CSRF-Protection: 1` must be present. Browsers cannot attach custom headers
 *    to cross-origin requests without a CORS preflight, and CORS only allows FRONTEND_URL origins.
 * 2. Origin check: if the browser sends Origin (or Referer), it must be an allowed frontend origin
 *    or the API's own origin (Swagger UI).
 * 3. The cookie itself is SameSite (lax by default) and scoped to /api/auth.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const enabled = this.reflector.getAllAndOverride<boolean>(CSRF_KEY, [context.getHandler(), context.getClass()]);
    if (!enabled) return true;
    const req = context.switchToHttp().getRequest<Request>();

    if (req.get(CSRF_HEADER) !== '1') {
      throw new ForbiddenException('Missing CSRF protection header (X-CSRF-Protection: 1).');
    }
    const origin = req.get('origin') ?? this.originFromReferer(req.get('referer'));
    if (origin && !this.isAllowedOrigin(origin, req)) {
      throw new ForbiddenException('Request origin is not allowed.');
    }
    return true;
  }

  private originFromReferer(referer?: string): string | undefined {
    if (!referer) return undefined;
    try {
      return new URL(referer).origin;
    } catch {
      return 'invalid';
    }
  }

  private isAllowedOrigin(origin: string, req: Request): boolean {
    const normalized = origin.replace(/\/+$/, '');
    if (this.config.frontendOrigins.includes(normalized)) return true;
    const self = `${req.protocol}://${req.get('host')}`;
    return normalized === self;
  }
}
