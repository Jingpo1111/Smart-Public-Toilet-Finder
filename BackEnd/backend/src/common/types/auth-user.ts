import type { Request } from 'express';
import type { UserRole } from '../../generated/prisma/client';

/**
 * The authenticated principal attached to `request.user`.
 * Loaded from the database on every request (role is NEVER taken from the JWT claims),
 * so role changes and deactivation apply immediately.
 */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  tokenVersion: number;
}

export type RequestWithUser = Request & { user?: AuthUser | null };
