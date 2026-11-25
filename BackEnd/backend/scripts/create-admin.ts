/**
 * Creates the administrator from ADMIN_EMAIL / ADMIN_PASSWORD, or promotes/reactivates that account.
 * Unlike the seed, this creates NO sample data and may be used in production.
 *   npm run admin:create
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient, UserRole } from '../src/generated/prisma/client';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!email || !password || !url) throw new Error('ADMIN_EMAIL, ADMIN_PASSWORD and DATABASE_URL/DIRECT_URL are required.');
  if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters and contain letters and digits.');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, fullName: process.env.ADMIN_NAME || 'ToiletGo Administrator', role: UserRole.ADMIN },
      // Changing the password/role invalidates existing sessions of this account.
      update: { passwordHash, role: UserRole.ADMIN, isActive: true, tokenVersion: { increment: 1 } },
    });
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.auditLog.create({
      data: { actorId: null, action: existing ? 'admin.promoted_by_script' : 'admin.created_by_script', entityType: 'User', entityId: user.id },
    });
    console.log(`✔ Administrator ${existing ? 'updated' : 'created'}: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error('✖', (e as Error).message || e);
  process.exit(1);
});
