import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/client';
import type { AuthUser, RequestWithUser } from '../types/auth-user';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const CSRF_KEY = 'csrfProtected';

/**
 * Route is reachable without a token. If a valid Bearer token is sent anyway, `request.user`
 * is populated (e.g. to return `isFavorite`), otherwise it is null. Invalid tokens are ignored.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restrict a route to the given roles (checked against the CURRENT database role). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Cookie-authenticated route (refresh / logout). Requires the `X-CSRF-Protection: 1` header and,
 * when the browser sends one, an allow-listed Origin.
 */
export const CsrfProtected = () => SetMetadata(CSRF_KEY, true);

/** Injects the authenticated user. Use only on routes protected by the JWT guard. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<RequestWithUser>();
  return req.user as AuthUser;
});

/** Injects the authenticated user or null on @Public() routes. */
export const OptionalUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser | null => {
  const req = ctx.switchToHttp().getRequest<RequestWithUser>();
  return req.user ?? null;
});
