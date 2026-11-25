import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/auth.decorators';
import { AnalyticsService } from './analytics.service';

@ApiTags('Statistics (public)')
@Controller('stats')
export class PublicStatsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Aggregate platform statistics for the homepage (no personal data)' })
  stats() {
    return this.analytics.publicStats();
  }
}
