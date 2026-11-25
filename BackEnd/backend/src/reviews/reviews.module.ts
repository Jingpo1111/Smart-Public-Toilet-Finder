import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ReviewsController, ToiletReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [UsersModule],
  controllers: [ToiletReviewsController, ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
