import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';
import { sha256Hex } from '../common/utils/crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export const JWT_ALGORITHM = 'HS256' as const;

export interface AccessTokenPayload {
  sub: string;
  /** Informational only — the server always uses the database role. */
  role: string;
  /** Token version; must match User.tokenVersion. */
  tv: number;
  typ: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  fam: string;
  typ: 'refresh';
}

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** Window in which presenting an already-rotated refresh token is treated as a benign race (two tabs). */
const REUSE_GRACE_MS = 10_000;

/**
 * Access tokens: short-lived HS256 JWT (Bearer header).
 * Refresh tokens: HS256 JWT signed with a separate secret, delivered only as an HttpOnly cookie.
 * Each refresh token is stored as a SHA-256 hash; refreshing rotates it, and re-using a rotated
 * token revokes the whole login family (token theft detection).
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async issue(user: { id: string; role: string; tokenVersion: number }, userAgent?: string, familyId?: string) {
    const access = await this.signAccess(user);
    const refresh = await this.createRefresh(user.id, familyId ?? randomUUID(), userAgent);
    return { ...access, ...refresh } satisfies IssuedTokens;
  }

  async signAccess(user: { id: string; role: string; tokenVersion: number }) {
    const { secret, expiresInSeconds, issuer, audience } = this.config.jwt;
    const payload: AccessTokenPayload = { sub: user.id, role: user.role, tv: user.tokenVersion, typ: 'access' };
    const accessToken = await this.jwt.signAsync(payload, {
      secret,
      algorithm: JWT_ALGORITHM,
      expiresIn: expiresInSeconds,
      issuer,
      audience,
    });
    return { accessToken, expiresIn: expiresInSeconds };
  }

  private async signRefresh(userId: string, jti: string, familyId: string) {
    const { refreshSecret, refreshExpiresInSeconds, issuer, audience } = this.config.jwt;
    const payload: Omit<RefreshTokenPayload, 'jti'> = { sub: userId, fam: familyId, typ: 'refresh' };
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: refreshSecret,
      algorithm: JWT_ALGORITHM,
      expiresIn: refreshExpiresInSeconds,
      issuer,
      audience,
      jwtid: jti,
    });
    return { refreshToken, refreshExpiresAt: new Date(Date.now() + refreshExpiresInSeconds * 1000) };
  }

  private async createRefresh(userId: string, familyId: string, userAgent?: string) {
    const id = randomUUID();
    const signed = await this.signRefresh(userId, id, familyId);
    await this.prisma.refreshToken.create({
      data: {
        id,
        userId,
        familyId,
        tokenHash: sha256Hex(signed.refreshToken),
        expiresAt: signed.refreshExpiresAt,
        userAgent: userAgent?.slice(0, 255),
      },
    });
    return signed;
  }

  async verifyRefresh(token: string): Promise<RefreshTokenPayload> {
    const { refreshSecret, issuer, audience } = this.config.jwt;
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: refreshSecret,
        algorithms: [JWT_ALGORITHM],
        issuer,
        audience,
      });
      if (payload.typ !== 'refresh' || !payload.jti || !payload.sub || !payload.fam) throw new Error('bad type');
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
  }

  /** Validates and rotates a refresh token. Returns the user id and the new refresh token. */
  async rotate(token: string, userAgent?: string) {
    const payload = await this.verifyRefresh(token);
    const record = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!record || record.tokenHash !== sha256Hex(token) || record.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
    if (record.revokedAt) {
      // A token that was ROTATED (not merely logged out) being presented again signals theft,
      // unless it happens within a few seconds (parallel requests from two tabs).
      const rotated = record.replacedById !== null;
      const withinGrace = Date.now() - record.revokedAt.getTime() < REUSE_GRACE_MS;
      if (rotated && !withinGrace) {
        await this.revokeFamily(record.familyId);
        await this.audit.log({
          actorId: record.userId,
          action: 'auth.refresh_token_reuse_detected',
          entityType: 'RefreshToken',
          entityId: record.id,
          metadata: { familyId: record.familyId },
        });
        this.logger.warn(`Refresh-token reuse detected for user ${record.userId}; session family revoked.`);
      }
      throw new UnauthorizedException('Refresh token has already been used or revoked. Please log in again.');
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const newId = randomUUID();
    const signed = await this.signRefresh(record.userId, newId, record.familyId);
    await this.prisma.$transaction(async (tx) => {
      // Atomic claim: only one concurrent request can rotate a given token.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: newId },
      });
      if (claimed.count !== 1) {
        throw new UnauthorizedException('Refresh token has already been used or revoked. Please log in again.');
      }
      await tx.refreshToken.create({
        data: {
          id: newId,
          userId: record.userId,
          familyId: record.familyId,
          tokenHash: sha256Hex(signed.refreshToken),
          expiresAt: signed.refreshExpiresAt,
          userAgent: userAgent?.slice(0, 255),
        },
      });
    });
    return { userId: record.userId, familyId: record.familyId, ...signed };
  }

  /** Revokes the login family of the given refresh token, if it is valid. Never throws. */
  async revokeByToken(token: string | undefined): Promise<string | null> {
    if (!token) return null;
    try {
      const payload = await this.verifyRefresh(token);
      const record = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
      if (!record || record.tokenHash !== sha256Hex(token)) return null;
      await this.revokeFamily(record.familyId);
      return record.userId;
    } catch {
      return null;
    }
  }

  async revokeFamily(familyId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string, db: Pick<PrismaService, 'refreshToken'> = this.prisma) {
    await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
