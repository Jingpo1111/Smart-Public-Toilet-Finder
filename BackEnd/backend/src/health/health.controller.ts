import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/auth.decorators';
import { PHNOM_PENH_TZ } from '../common/utils/opening-hours';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({
    summary: 'Health check',
    description: 'Checks the database and storage connectivity. Returns 503 when the database is unreachable.',
  })
  async health() {
    const timeout = <T>(p: Promise<T>, ms: number, fallback: T) =>
      Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
    const [db, storage] = await Promise.all([
      timeout(this.prisma.isHealthy(), 3000, false),
      timeout(this.storage.ping(), 3000, false),
    ]);
    const body = {
      status: db && storage ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      timezone: PHNOM_PENH_TZ,
      uptimeSeconds: Math.round(process.uptime()),
      services: {
        database: db ? 'up' : 'down',
        storage: storage ? 'up' : 'unreachable',
        mail: this.mail.isConfigured() ? 'configured' : 'not_configured',
      },
    };
    if (!db) throw new ServiceUnavailableException({ message: 'Database is unavailable', details: body });
    return body;
  }
}
