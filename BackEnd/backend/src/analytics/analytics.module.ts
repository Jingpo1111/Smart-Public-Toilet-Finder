import { Module } from '@nestjs/common';
import { PublicStatsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [PublicStatsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
