import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UserRole } from '../../generated/prisma/client';
import type { AppConfigService } from '../../config/app-config.service';
import { UpdateProfileDto } from '../../users/dto/update-profile.dto';
import { CsrfGuard } from './csrf.guard';
import { RolesGuard } from './roles.guard';

function ctx(req: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  it('allows routes without @Roles and enforces roles otherwise', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(undefined);
    expect(guard.canActivate(ctx({ user: null }))).toBe(true);

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce([UserRole.ADMIN]);
    expect(() => guard.canActivate(ctx({ user: { role: UserRole.USER } }))).toThrow(ForbiddenException);

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce([UserRole.ADMIN, UserRole.MANAGER]);
    expect(guard.canActivate(ctx({ user: { role: UserRole.MANAGER } }))).toBe(true);
  });
});

describe('CsrfGuard', () => {
  const reflector = new Reflector();
  const config = { frontendOrigins: ['http://localhost:5173'] } as AppConfigService;
  const guard = new CsrfGuard(reflector, config);
  const req = (headers: Record<string, string>) => ({
    protocol: 'http',
    get: (h: string) => (h === 'host' ? 'localhost:3000' : headers[h.toLowerCase()]),
  });

  beforeEach(() => jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true));

  it('requires the custom header', () => {
    expect(() => guard.canActivate(ctx(req({})))).toThrow(ForbiddenException);
  });
  it('checks Origin / Referer against the allow-list (or the API itself for Swagger)', () => {
    expect(guard.canActivate(ctx(req({ 'x-csrf-protection': '1', origin: 'http://localhost:5173' })))).toBe(true);
    expect(guard.canActivate(ctx(req({ 'x-csrf-protection': '1', origin: 'http://localhost:3000' })))).toBe(true);
    expect(guard.canActivate(ctx(req({ 'x-csrf-protection': '1' })))).toBe(true);
    expect(() => guard.canActivate(ctx(req({ 'x-csrf-protection': '1', origin: 'https://evil.example' })))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx(req({ 'x-csrf-protection': '1', referer: 'https://evil.example/page' })))).toThrow(ForbiddenException);
  });
});

describe('DTO whitelist', () => {
  it('UpdateProfileDto declares no role/email/isActive properties', () => {
    const dto = plainToInstance(UpdateProfileDto, { fullName: 'Ok Name', role: 'ADMIN' });
    const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map((e) => e.property)).toEqual(['role']);
  });
});
