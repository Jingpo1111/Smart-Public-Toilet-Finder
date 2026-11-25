import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * - Runtime queries use DATABASE_URL through the @prisma/adapter-pg driver adapter
 *   (Supabase transaction pooler, port 6543, is fine for runtime).
 * - Prisma CLI commands (migrate, db seed, studio) use DIRECT_URL — a direct connection or the
 *   Supabase *session* pooler (port 5432). Migrations must not run through the transaction pooler.
 * - Prisma 7 no longer loads .env automatically; `dotenv/config` above does it.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
  },
});
