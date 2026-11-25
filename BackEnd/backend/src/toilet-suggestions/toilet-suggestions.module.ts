import { Module } from '@nestjs/common';
import { ToiletsModule } from '../toilets/toilets.module';
import { UsersModule } from '../users/users.module';
import { DuplicateDetectorService } from './duplicate-detector.service';
import { MySuggestionsController, ToiletSuggestionsController } from './toilet-suggestions.controller';
import { ToiletSuggestionsService } from './toilet-suggestions.service';

@Module({
  imports: [ToiletsModule, UsersModule],
  controllers: [ToiletSuggestionsController, MySuggestionsController],
  providers: [ToiletSuggestionsService, DuplicateDetectorService],
  exports: [ToiletSuggestionsService],
})
export class ToiletSuggestionsModule {}
