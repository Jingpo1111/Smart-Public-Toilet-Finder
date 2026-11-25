import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigService } from '../config/app-config.service';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenPayload, JWT_ALGORITHM } from './token.service';

/**
 * Verifies the Bearer access token: signature (HS256 only — "none" and other algorithms are
 * rejected), expiry, issuer and audience. Then loads the CURRENT user from the database so that
 * role changes, deactivation and password changes (tokenVersion) take effect immediately.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.jwt.secret,
      algorithms: [JWT_ALGORITHM],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      ignoreExpiration: false,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    if (payload?.typ !== 'access' || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Invalid access token.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, fullName: true, role: true, isActive: true, tokenVersion: true },
    });
    if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException('Your session is no longer valid. Please log in again.');
    }
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, tokenVersion: user.tokenVersion };
  }
}
