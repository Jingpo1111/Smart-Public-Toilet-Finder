import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Language, UserRole } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { randomToken, sha256Hex } from '../common/utils/crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PROFILE_SELECT, UserProfile, UsersService } from '../users/users.service';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export interface SessionResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserProfile;
  /** Not serialised to the client; the controller places it in the HttpOnly cookie. */
  refresh: { token: string; expiresAt: Date };
}

export const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for this e-mail address, a password reset link will be sent to it.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  private async session(userId: string, userAgent?: string, familyId?: string): Promise<SessionResult> {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { ...PROFILE_SELECT, tokenVersion: true },
    });
    const { tokenVersion, ...profileRow } = row;
    const issued = await this.tokens.issue({ id: row.id, role: row.role, tokenVersion }, userAgent, familyId);
    return {
      accessToken: issued.accessToken,
      tokenType: 'Bearer',
      expiresIn: issued.expiresIn,
      user: await this.users.toProfile(profileRow),
      refresh: { token: issued.refreshToken, expiresAt: issued.refreshExpiresAt },
    };
  }

  /** Public registration ALWAYS creates a USER; the DTO does not even accept a role. */
  async register(dto: RegisterDto, userAgent?: string): Promise<SessionResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (existing) throw new ConflictException('An account with this e-mail address already exists.');
    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        phone: dto.phone,
        preferredLanguage: dto.preferredLanguage ?? Language.EN,
        role: UserRole.USER,
        lastLoginAt: new Date(),
      },
      select: { id: true },
    });
    await this.audit.log({ actorId: user.id, action: 'auth.register', entityType: 'User', entityId: user.id });
    return this.session(user.id, userAgent);
  }

  async login(dto: LoginDto, userAgent?: string): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, passwordHash: true, isActive: true },
    });
    if (!user) {
      await this.passwords.verifyDummy(dto.password);
      throw new UnauthorizedException('Invalid e-mail or password.');
    }
    if (!(await this.passwords.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid e-mail or password.');
    }
    if (!user.isActive) throw new ForbiddenException('This account has been deactivated. Contact an administrator.');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.session(user.id, userAgent);
  }

  async refresh(refreshToken: string | undefined, userAgent?: string): Promise<SessionResult> {
    if (!refreshToken) throw new UnauthorizedException('No refresh token. Please log in.');
    const rotated = await this.tokens.rotate(refreshToken, userAgent);
    const row = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      select: { ...PROFILE_SELECT, tokenVersion: true },
    });
    if (!row || !row.isActive) {
      await this.tokens.revokeFamily(rotated.familyId);
      throw new UnauthorizedException('Your session is no longer valid. Please log in again.');
    }
    const { tokenVersion, ...profileRow } = row;
    const access = await this.tokens.signAccess({ id: row.id, role: row.role, tokenVersion });
    return {
      accessToken: access.accessToken,
      tokenType: 'Bearer',
      expiresIn: access.expiresIn,
      user: await this.users.toProfile(profileRow),
      refresh: { token: rotated.refreshToken, expiresAt: rotated.refreshExpiresAt },
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    const userId = await this.tokens.revokeByToken(refreshToken);
    if (userId) await this.audit.log({ actorId: userId, action: 'auth.logout', entityType: 'User', entityId: userId });
  }

  /** Revokes every session and invalidates all outstanding access tokens. */
  async logoutAll(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
      await this.tokens.revokeAllForUser(userId, tx);
      await this.audit.log({ actorId: userId, action: 'auth.logout_all', entityType: 'User', entityId: userId }, tx);
    });
  }

  /**
   * Always answers the same way for existing and unknown e-mails (no account enumeration).
   * Refuses with 503 when SMTP is not configured, so the API never claims an e-mail was sent.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    if (!this.mail.isConfigured()) {
      throw new ServiceUnavailableException(
        'Password reset by e-mail is not available because e-mail delivery (SMTP) is not configured on this server.',
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, fullName: true, email: true, isActive: true, preferredLanguage: true },
    });
    if (user?.isActive) {
      const token = randomToken(32);
      const minutes = this.config.passwordResetExpiresMinutes;
      await this.prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.passwordResetToken.create({
          data: { userId: user.id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + minutes * 60_000) },
        });
        await this.audit.log(
          { actorId: user.id, action: 'auth.password_reset_requested', entityType: 'User', entityId: user.id },
          tx,
        );
      });
      const link = `${this.config.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
      // Fire-and-forget so response timing does not reveal whether the account exists.
      void this.mail
        .sendPasswordReset(user.email, user.fullName, link, minutes, user.preferredLanguage)
        .catch((e: Error) => this.logger.error(`Password reset e-mail to user ${user.id} failed: ${e.message}`));
    }
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256Hex(dto.token) } });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('This password reset link is invalid or has expired. Please request a new one.');
    }
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('This password reset link is invalid or has expired. Please request a new one.');
      }
      const user = await tx.user.findUnique({ where: { id: record.userId }, select: { isActive: true } });
      if (!user?.isActive) throw new BadRequestException('This account cannot be reset.');
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await this.tokens.revokeAllForUser(record.userId, tx);
      await this.audit.log(
        { actorId: record.userId, action: 'auth.password_reset', entityType: 'User', entityId: record.userId },
        tx,
      );
    });
  }

  /** Changes the password, signs out every other session and returns a fresh session for this client. */
  async changePassword(userId: string, dto: ChangePasswordDto, userAgent?: string): Promise<SessionResult> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    if (!(await this.passwords.verify(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('Current password is incorrect.');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('The new password must be different from the current password.');
    }
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, tokenVersion: { increment: 1 } } });
      await this.tokens.revokeAllForUser(userId, tx);
      await this.audit.log({ actorId: userId, action: 'auth.password_changed', entityType: 'User', entityId: userId }, tx);
    });
    return this.session(userId, userAgent);
  }
}
