import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CsrfGuard } from './common/guards/csrf.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CacheControlInterceptor } from './common/interceptors/cache-control.interceptor';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { createValidationPipe } from './common/validation';
import { AppConfigService } from './config/app-config.service';
import { AppConfigModule } from './config/config.module';
import { FavoritesModule } from './favorites/favorites.module';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { ManagerAccessModule } from './manager/manager-access.module';
import { ManagerModule } from './manager/manager.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { ReviewsModule } from './reviews/reviews.module';
import { StorageModule } from './storage/storage.module';
import { ToiletSuggestionsModule } from './toilet-suggestions/toilet-suggestions.module';
import { ToiletsModule } from './toilets/toilets.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: config.throttle.limit }],
        skipIf: () => config.throttle.disabled,
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    StorageModule,
    MailModule,
    NotificationsModule,
    ManagerAccessModule,
    UsersModule,
    AuthModule,
    ToiletsModule,
    UploadsModule,
    ToiletSuggestionsModule,
    ReviewsModule,
    ReportsModule,
    FavoritesModule,
    AnalyticsModule,
    ManagerModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit → authenticate → authorise role → CSRF (cookie routes).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
