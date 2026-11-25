import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { CsrfProtected, CurrentUser, Public } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { UsersService } from '../users/users.service';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './auth-cookie';
import { AuthService, SessionResult } from './auth.service';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto';

const CSRF_HEADER_DOC = {
  name: 'X-CSRF-Protection',
  required: true,
  description: 'Must be "1". Protects cookie-authenticated endpoints against CSRF.',
  schema: { type: 'string', enum: ['1'] },
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: AppConfigService,
  ) {}

  /** Sets the refresh cookie and returns only the public part of the session. */
  private respond(res: Response, s: SessionResult) {
    setRefreshCookie(res, this.config, s.refresh.token, s.refresh.expiresAt);
    return { accessToken: s.accessToken, tokenType: s.tokenType, expiresIn: s.expiresIn, user: s.user };
  }

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ResponseMessage('Account created successfully')
  @ApiOperation({
    summary: 'Register a new USER account',
    description:
      'Always creates role USER. Returns an access token and sets the HttpOnly refresh cookie `tg_refresh` (path /api/auth).',
  })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.register(dto, req.get('user-agent')));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ResponseMessage('Logged in successfully')
  @ApiOperation({ summary: 'Log in with e-mail and password', description: 'Sets the HttpOnly refresh cookie.' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.login(dto, req.get('user-agent')));
  }

  @Public()
  @CsrfProtected()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiCookieAuth('refresh-cookie')
  @ApiHeader(CSRF_HEADER_DOC)
  @ResponseMessage('Session refreshed')
  @ApiOperation({
    summary: 'Rotate the refresh cookie and get a new access token',
    description:
      'Send with credentials (cookie) and header X-CSRF-Protection: 1. The old refresh token is revoked; re-using it revokes the whole session family.',
  })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return this.respond(res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], req.get('user-agent')));
    } catch (e) {
      clearRefreshCookie(res, this.config);
      throw e;
    }
  }

  @Public()
  @CsrfProtected()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refresh-cookie')
  @ApiHeader(CSRF_HEADER_DOC)
  @ResponseMessage('Logged out successfully')
  @ApiOperation({ summary: 'Revoke the current session (refresh cookie) and clear the cookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    clearRefreshCookie(res, this.config);
    return null;
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ResponseMessage('Logged out from all devices')
  @ApiOperation({ summary: 'Revoke all sessions and invalidate all access tokens of the current user' })
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.id);
    clearRefreshCookie(res, this.config);
    return null;
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current account (role is the current database role)' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.id);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ResponseMessage('Password reset requested')
  @ApiOperation({
    summary: 'Request a password reset e-mail',
    description:
      'Same response whether or not the account exists. Returns 503 when SMTP is not configured (no e-mail can be sent). The e-mail links to FRONTEND_URL/reset-password?token=…',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ResponseMessage('Password has been reset. Please log in with your new password.')
  @ApiOperation({ summary: 'Reset the password with the e-mailed token (revokes all sessions)' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto);
    return null;
  }
}

@ApiTags('Me')
@ApiBearerAuth()
@Controller('me')
export class AccountController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ResponseMessage('Password changed successfully')
  @ApiOperation({
    summary: 'Change my password',
    description: 'Revokes all other sessions. Returns a new access token and sets a new refresh cookie for this client.',
  })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const s = await this.auth.changePassword(user.id, dto, req.get('user-agent'));
    setRefreshCookie(res, this.config, s.refresh.token, s.refresh.expiresAt);
    return { accessToken: s.accessToken, tokenType: s.tokenType, expiresIn: s.expiresIn, user: s.user };
  }
}
