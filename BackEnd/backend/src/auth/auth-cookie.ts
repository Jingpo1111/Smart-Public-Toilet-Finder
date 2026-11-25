import type { CookieOptions, Response } from 'express';
import type { AppConfigService } from '../config/app-config.service';

export const REFRESH_COOKIE = 'tg_refresh';
/** The refresh cookie is only sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = '/api/auth';

export function refreshCookieOptions(config: AppConfigService, maxAgeMs?: number): CookieOptions {
  const c = config.cookie;
  return {
    httpOnly: true,
    secure: c.secure,
    sameSite: c.sameSite,
    domain: c.domain,
    path: REFRESH_COOKIE_PATH,
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

export function setRefreshCookie(res: Response, config: AppConfigService, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(config, expiresAt.getTime() - Date.now()));
}

export function clearRefreshCookie(res: Response, config: AppConfigService) {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(config));
}
