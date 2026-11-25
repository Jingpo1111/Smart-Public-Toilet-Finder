import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuthModule } from '../auth/auth.module';
import { ReportsModule } from '../reports/reports.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { ToiletSuggestionsModule } from '../toilet-suggestions/toilet-suggestions.module';
import { ToiletsModule } from '../toilets/toilets.module';
import { UsersModule } from '../users/users.module';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [AnalyticsModule, AuthModule, ReportsModule, ReviewsModule, ToiletSuggestionsModule, ToiletsModule, UsersModule],
  controllers: [AdminController],
  providers: [AdminUsersService],
})
export class AdminModule {}
