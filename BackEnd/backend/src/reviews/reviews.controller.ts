import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CreateReviewDto, PublicReviewQueryDto, UpdateReviewDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@Controller('toilets/:id/reviews')
export class ToiletReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public reviews of a verified WC (hidden reviews excluded; author shown as "First L.")' })
  list(@Param('id', ParseUUIDPipe) id: string, @Query() q: PublicReviewQueryDto) {
    return this.reviews.listPublic(id, q);
  }

  @Post()
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ResponseMessage('Review submitted')
  @ApiOperation({ summary: 'Review a WC (one review per user and WC; 409 if you already reviewed it)' })
  create(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user, id, dto);
  }
}

@ApiTags('Reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Patch('reviews/:id')
  @ResponseMessage('Review updated')
  @ApiOperation({ summary: 'Edit my review' })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReviewDto) {
    return this.reviews.update(user, id, dto);
  }

  @Delete('reviews/:id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Review deleted')
  @ApiOperation({ summary: 'Delete my review' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.reviews.remove(user, id);
    return null;
  }

  @Get('me/reviews')
  @ApiOperation({ summary: 'My reviews (including any hidden by moderation)' })
  mine(@CurrentUser() user: AuthUser, @Query() q: PublicReviewQueryDto) {
    return this.reviews.listMine(user, q);
  }
}
