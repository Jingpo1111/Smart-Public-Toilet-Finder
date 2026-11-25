import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { AccessType, Prisma, ToiletStatus, UserRole } from '../../src/generated/prisma/client';
import { MailService } from '../../src/mail/mail.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/storage/storage.service';
import { FakeMailService, InMemoryStorageService } from './in-memory-storage';

export interface TestContext {
  app: NestExpressApplication;
  prisma: PrismaService;
  storage: InMemoryStorageService;
  mail: FakeMailService;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestContext> {
  const storage = new InMemoryStorageService();
  const mail = new FakeMailService();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useValue(storage)
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: ['error'] });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, storage, mail, http: () => request(app.getHttpServer()) };
}

/** Empties every table (test database only — guarded in global-setup). */
export async function resetDatabase(prisma: PrismaService) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
}

export const PASSWORD = 'Test-Passw0rd';
let passwordHash: Promise<string> | null = null;

export async function createUser(ctx: TestContext, email: string, role: UserRole = UserRole.USER, fullName = 'Test User') {
  passwordHash ??= argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const user = await ctx.prisma.user.create({ data: { email, passwordHash: await passwordHash, fullName, role } });
  const res = await ctx.http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('tg_refresh='))!;
  return { id: user.id, email, token: res.body.data.accessToken as string, cookie, auth: { Authorization: `Bearer ${res.body.data.accessToken}` } };
}

export async function createToilet(ctx: TestContext, overrides: Partial<Prisma.ToiletUncheckedCreateInput> = {}, hours?: { dayOfWeek: number; openMinute: number; closeMinute: number }[]) {
  const now = new Date();
  return ctx.prisma.toilet.create({
    data: {
      name: 'Test WC',
      address: 'Test address, Phnom Penh',
      district: 'Daun Penh',
      latitude: 11.5564,
      longitude: 104.9282,
      accessType: AccessType.FREE,
      priceKhr: 0,
      status: ToiletStatus.OPEN,
      isVerified: true,
      verifiedAt: now,
      lastVerifiedAt: now,
      ...overrides,
      facility: { create: { hasWater: true, hasSoap: null, wheelchairAccessible: null, babyChanging: null } },
      openingHours: hours ? { create: hours } : undefined,
    },
  });
}

/** An original generated test image (solid colour). Optionally embeds EXIF metadata. */
export async function testImage(format: 'png' | 'jpeg' | 'webp' = 'png', color = '#059669', withExif = false): Promise<Buffer> {
  let img = sharp({ create: { width: 640, height: 480, channels: 3, background: color } });
  if (withExif) img = img.withExif({ IFD0: { Copyright: 'secret-owner', Artist: 'Private Person' } });
  return img.toFormat(format).toBuffer();
}

export const ALL_DAYS_OPEN = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, openMinute: 0, closeMinute: 1440 }));
