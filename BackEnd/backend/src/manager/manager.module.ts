import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ReportsModule } from '../reports/reports.module';
import { ToiletsModule } from '../toilets/toilets.module';
import { ManagerController } from './manager.controller';
import { ManagerService } from './manager.service';

@Module({
  imports: [ToiletsModule, ReportsModule, AnalyticsModule],
  controllers: [ManagerController],
  providers: [ManagerService],
})
export class ManagerModule {}
