import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { AppConfigService } from '../config/app-config.service';

/**
 * Prisma 7 client using the node-postgres driver adapter.
 * The connection is opened lazily on the first query, so the app can boot (and report
 * "database: down" from /api/health) even when the database is temporarily unreachable.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        max: config.dbPoolMax,
        // Reuse warm connections between bursts, fail fast instead of queueing forever,
        // and keep TCP alive so idle connections to the pooler are not silently dropped.
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        keepAlive: true,
      }),
      log: config.isProduction ? ['error'] : ['warn', 'error'],
    });
  }

  /** Opens the first pooled connection in the background so the first real request does not pay for it. */
  onModuleInit(): void {
    void this.$queryRaw`SELECT 1`.catch((error: Error) =>
      this.logger.warn(`Database warm-up failed: ${error.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.warn(`Database health check failed: ${(error as Error).message}`);
      return false;
    }
  }
}
