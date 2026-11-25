import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../src/generated/prisma/client';
import { createTestApp, createUser, PASSWORD, resetDatabase, TestContext } from './support/test-app';

const CSRF = { 'X-CSRF-Protection': '1' };
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const refreshCookieOf = (res: { headers: Record<string, unknown> }) =>
  ([] as string[]).concat((res.headers['set-cookie'] as string[]) ?? []).find((c) => c.startsWith('tg_refresh='));

describe('Authentication & authorization (e2e)', () => {
  let ctx: TestContext;
  const jwt = new JwtService();

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('registration', () => {
    it('creates a USER and sets an HttpOnly refresh cookie scoped to /api/auth', async () => {
      const res = await ctx
        .http()
        .post('/api/auth/register')
        .send({ email: '  New.User@Example.com ', password: 'Abcdefg1', fullName: 'New User' })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('USER');
      expect(res.body.data.user.email).toBe('new.user@example.com');
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
      expect(res.body.data.tokenType).toBe('Bearer');
      const cookie = refreshCookieOf(res)!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Path=\/api\/auth/);
      expect(cookie).toMatch(/SameSite=Lax/);
    });

    it('rejects a client-supplied role (mass assignment)', async () => {
      const res = await ctx
        .http()
        .post('/api/auth/register')
        .send({ email: 'evil@example.com', password: 'Abcdefg1', fullName: 'Evil', role: 'ADMIN' })
        .expect(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.details)).toContain('role');
      expect(await ctx.prisma.user.count({ where: { email: 'evil@example.com' } })).toBe(0);
    });

    it('rejects weak passwords and duplicate e-mails', async () => {
      await ctx.http().post('/api/auth/register').send({ email: 'weak@example.com', password: 'short', fullName: 'Weak' }).expect(400);
      await ctx
        .http()
        .post('/api/auth/register')
        .send({ email: 'new.user@example.com', password: 'Abcdefg1', fullName: 'Dup' })
        .expect(409);
    });
  });

  describe('login and access tokens', () => {
    it('rejects bad credentials with 401 and the same message for unknown accounts', async () => {
      await createUser(ctx, 'login@example.com');
      const a = await ctx.http().post('/api/auth/login').send({ email: 'login@example.com', password: 'Wrong-pass1' }).expect(401);
      const b = await ctx.http().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Wrong-pass1' }).expect(401);
      expect(a.body.message).toBe(b.body.message);
    });

    it('requires a token for protected routes', async () => {
      await ctx.http().get('/api/auth/me').expect(401);
      const u = await createUser(ctx, 'me@example.com');
      const res = await ctx.http().get('/api/auth/me').set(u.auth).expect(200);
      expect(res.body.data.email).toBe('me@example.com');
    });

    it('rejects tampered, unsigned, foreign-signed, expired and wrong-audience tokens', async () => {
      const u = await createUser(ctx, 'tamper@example.com');
      const [h, p, s] = u.token.split('.');
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>;

      // 1. Role claim changed to ADMIN, original signature kept
      const tampered = `${h}.${b64({ ...payload, role: 'ADMIN' })}.${s}`;
      await ctx.http().get('/api/admin/dashboard').set('Authorization', `Bearer ${tampered}`).expect(401);
      // 2. alg=none
      const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...payload, role: 'ADMIN' })}.`;
      await ctx.http().get('/api/auth/me').set('Authorization', `Bearer ${none}`).expect(401);
      // 3. Signed with another secret
      const foreign = jwt.sign({ ...payload, role: 'ADMIN' }, { secret: 'attacker-secret-attacker-secret-1234567890' });
      await ctx.http().get('/api/auth/me').set('Authorization', `Bearer ${foreign}`).expect(401);
      // 4. Expired
      const { exp: _e, iat: _i, ...rest } = payload;
      const expired = jwt.sign({ ...rest }, { secret: process.env.JWT_SECRET, expiresIn: -10 });
      await ctx.http().get('/api/auth/me').set('Authorization', `Bearer ${expired}`).expect(401);
      // 5. Wrong audience / issuer
      const { aud: _a, iss: _s, ...core } = rest;
      const wrongAud = jwt.sign(core, { secret: process.env.JWT_SECRET, audience: 'other-app', issuer: 'toiletgo-kh', expiresIn: 60 });
      await ctx.http().get('/api/auth/me').set('Authorization', `Bearer ${wrongAud}`).expect(401);
      // 6. Valid signature but a USER token claiming ADMIN role cannot reach admin routes (role is read from DB)
      const forgedButSigned = jwt.sign({ ...core, role: 'ADMIN' }, { secret: process.env.JWT_SECRET, audience: 'toiletgo-kh-web', issuer: 'toiletgo-kh', expiresIn: 60 });
      await ctx.http().get('/api/admin/dashboard').set('Authorization', `Bearer ${forgedButSigned}`).expect(403);
      // 7. Refresh token used as access token
      const refreshValue = u.cookie.split(';')[0].split('=')[1];
      await ctx.http().get('/api/auth/me').set('Authorization', `Bearer ${refreshValue}`).expect(401);
    });

    it('applies role changes immediately and ignores token role claims', async () => {
      const admin = await createUser(ctx, 'roles-admin@example.com', UserRole.ADMIN);
      const u = await createUser(ctx, 'roles-user@example.com');
      await ctx.http().get('/api/manager/dashboard').set(u.auth).expect(403);
      await ctx.http().patch(`/api/admin/users/${u.id}/role`).set(admin.auth).send({ role: 'MANAGER' }).expect(200);
      await ctx.http().get('/api/manager/dashboard').set(u.auth).expect(200); // same token, new DB role
      await ctx.http().patch(`/api/admin/users/${u.id}/role`).set(admin.auth).send({ role: 'USER' }).expect(200);
      await ctx.http().get('/api/manager/dashboard').set(u.auth).expect(403);
      // Admin cannot change own role
      await ctx.http().patch(`/api/admin/users/${admin.id}/role`).set(admin.auth).send({ role: 'USER' }).expect(403);
      // USER cannot change roles
      await ctx.http().patch(`/api/admin/users/${admin.id}/role`).set(u.auth).send({ role: 'USER' }).expect(403);
    });

    it('invalidates tokens of deactivated accounts', async () => {
      const admin = await createUser(ctx, 'deact-admin@example.com', UserRole.ADMIN);
      const u = await createUser(ctx, 'deact-user@example.com');
      await ctx.http().patch(`/api/admin/users/${u.id}/status`).set(admin.auth).send({ isActive: false }).expect(200);
      await ctx.http().get('/api/auth/me').set(u.auth).expect(401);
      await ctx.http().post('/api/auth/refresh').set(CSRF).set('Cookie', u.cookie).expect(401);
      await ctx.http().post('/api/auth/login').send({ email: u.email, password: PASSWORD }).expect(403);
    });
  });

  describe('refresh-token rotation, CSRF and logout', () => {
    it('requires the CSRF header and an allowed Origin', async () => {
      const u = await createUser(ctx, 'csrf@example.com');
      await ctx.http().post('/api/auth/refresh').set('Cookie', u.cookie).expect(403);
      await ctx.http().post('/api/auth/refresh').set(CSRF).set('Origin', 'https://evil.example').set('Cookie', u.cookie).expect(403);
      await ctx.http().post('/api/auth/refresh').set(CSRF).set('Origin', 'http://localhost:5173').set('Cookie', u.cookie).expect(200);
    });

    it('answers both the local and the public frontend (CORS + CSRF), and nobody else', async () => {
      for (const origin of ['http://localhost:5173', 'https://toiletgo.test.invalid']) {
        const pre = await ctx
          .http()
          .options('/api/auth/refresh')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'POST')
          .set('Access-Control-Request-Headers', 'x-csrf-protection,content-type');
        expect(pre.headers['access-control-allow-origin']).toBe(origin);
        expect(pre.headers['access-control-allow-credentials']).toBe('true');
        const u = await createUser(ctx, `origin-${new URL(origin).hostname}@example.com`);
        await ctx.http().post('/api/auth/refresh').set(CSRF).set('Origin', origin).set('Cookie', u.cookie).expect(200);
      }
      const evil = await ctx.http().options('/api/auth/refresh').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rotates the cookie; re-using a rotated token later revokes the whole family', async () => {
      const u = await createUser(ctx, 'rotate@example.com');
      const r1 = await ctx.http().post('/api/auth/refresh').set(CSRF).set('Cookie', u.cookie).expect(200);
      const c1 = refreshCookieOf(r1)!;
      expect(c1).not.toEqual(u.cookie);
      expect(r1.body.data.accessToken).toBeTruthy();

      // Immediate reuse (within the 10 s grace window) is rejected but does not revoke the family.
      await ctx.http().post('/api/auth/refresh').set(CSRF).set('Cookie', u.cookie).expect(401);
      const r2 = await ctx.http().post('/api/auth/refresh').set(CSRF).set('Cookie', c1).expect(200);
      const c2 = refreshCookieOf(r2)!;

      // Simulate the stolen original token being replayed later → family revoked.
      await ctx.prisma.refreshToken.updateMany({
        where: { userId: u.id, replacedById: { not: null } },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });
      await ctx.http().post('/api/auth/refresh').set(CSRF).set('Cookie', u.cookie).expect(401);
      await ctx.http().post('/api/auth/refresh').set(CSRF).set('Cookie', c2).expect(401);
      const audit = await ctx.prisma.auditLog.count({ where: { actorId: u.id, action: 'auth.refresh_token_reuse_detected' } });
      expect(audit).toBe(1);
    });

    it('stores only hashes of refresh tokens', async () => {
      const u = await createUser(ctx, 'hash@example.com');
      const raw = u.cookie.split(';')[0].split('=')[1];
      const rows = await ctx.prisma.refreshToken.findMany({ where: { userId: u.id } });
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(r.tokenHash).not.toContain(raw.slice(0, 20));
    });

    it('logout revokes the session and clears the cookie', async () => {
      const u = await createUser(ctx, 'logout@example.com');
      const res = await ctx.http().post('/api/auth/logout').set(CSRF).set('Cookie', u.cookie).expect(200);
      expect(refreshCookieOf(res)).toMatch(/tg_refresh=;/);
      await ctx.http().post('/api/auth/refresh').set(CSRF).set('Cookie', u.cookie).expect(401);
    });
  });

  describe('profile and passwords', () => {
    it('updates profile fields but rejects role/email changes', async () => {
      const u = await createUser(ctx, 'profile@example.com');
      const ok = await ctx.http().patch('/api/me/profile').set(u.auth).send({ fullName: 'Renamed', preferredLanguage: 'KM' }).expect(200);
      expect(ok.body.data.fullName).toBe('Renamed');
      expect(ok.body.data.preferredLanguage).toBe('KM');
      await ctx.http().patch('/api/me/profile').set(u.auth).send({ role: 'ADMIN' }).expect(400);
      await ctx.http().patch('/api/me/profile').set(u.auth).send({ email: 'x@example.com' }).expect(400);
      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(row.role).toBe('USER');
    });

    it('change-password invalidates old tokens and sessions', async () => {
      const u = await createUser(ctx, 'chpw@example.com');
      await ctx.http().post('/api/me/change-password').set(u.auth).send({ currentPassword: 'wrong', newPassword: 'N3w-Passw0rd' }).expect(400);
      const res = await ctx.http().post('/api/me/change-password').set(u.auth).send({ currentPassword: PASSWORD, newPassword: 'N3w-Passw0rd' }).expect(200);
      await ctx.http().get('/api/auth/me').set(u.auth).expect(401);
      await ctx.http().post('/api/auth/refresh').set(CSRF).set('Cookie', u.cookie).expect(401);
      await ctx.http().get('/api/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken}`).expect(200);
      await ctx.http().post('/api/auth/login').send({ email: u.email, password: 'N3w-Passw0rd' }).expect(200);
    });

    it('forgot/reset password via the mail service; tokens are single use', async () => {
      const u = await createUser(ctx, 'reset@example.com');
      ctx.mail.sent.length = 0;
      const unknown = await ctx.http().post('/api/auth/forgot-password').send({ email: 'ghost@example.com' }).expect(202);
      const known = await ctx.http().post('/api/auth/forgot-password').send({ email: u.email }).expect(202);
      expect(unknown.body.data.message).toBe(known.body.data.message);
      await new Promise((r) => setTimeout(r, 50));
      expect(ctx.mail.sent).toHaveLength(1);
      const token = new URL(ctx.mail.sent[0].text).searchParams.get('token')!;
      expect(new URL(ctx.mail.sent[0].text).origin).toBe('http://localhost:5173');
      const stored = await ctx.prisma.passwordResetToken.findFirstOrThrow({ where: { userId: u.id } });
      expect(stored.tokenHash).not.toBe(token);

      await ctx.http().post('/api/auth/reset-password').send({ token, newPassword: 'Res3t-Passw0rd' }).expect(200);
      await ctx.http().post('/api/auth/reset-password').send({ token, newPassword: 'Again-Passw0rd1' }).expect(400);
      await ctx.http().get('/api/auth/me').set(u.auth).expect(401);
      await ctx.http().post('/api/auth/login').send({ email: u.email, password: 'Res3t-Passw0rd' }).expect(200);
    });

    it('returns 503 instead of claiming delivery when SMTP is not configured', async () => {
      ctx.mail.configured = false;
      try {
        const res = await ctx.http().post('/api/auth/forgot-password').send({ email: 'reset@example.com' }).expect(503);
        expect(res.body.message).toMatch(/SMTP/);
      } finally {
        ctx.mail.configured = true;
      }
    });
  });

  it('uses the documented error envelope and never leaks internals', async () => {
    const res = await ctx.http().get('/api/toilets/not-a-uuid').expect(400);
    expect(res.body).toMatchObject({ success: false, statusCode: 400, error: 'Bad Request' });
    expect(JSON.stringify(res.body)).not.toMatch(/stack|prisma|SELECT/i);
    const malformed = await ctx.http().post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json').expect(400);
    expect(malformed.body.message).toBe('Malformed JSON request body.');
  });
});
