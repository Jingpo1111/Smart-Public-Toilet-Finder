import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CreateSuggestionDto, MySuggestionQueryDto } from './dto/suggestion.dto';
import { ToiletSuggestionsService } from './toilet-suggestions.service';

@ApiTags('WC suggestions')
@ApiBearerAuth()
@Controller('toilet-suggestions')
export class ToiletSuggestionsController {
  constructor(private readonly suggestions: ToiletSuggestionsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ResponseMessage('Your WC location has been submitted successfully and is waiting for administrator approval.')
  @ApiOperation({
    summary: 'Submit a missing WC location (status is always PENDING)',
    description:
      'JSON body. Upload photos first with POST /uploads/suggestions and pass the returned IDs as imageIds. ' +
      'To correct a rejected submission, pass resubmittedFromId (and optionally retainedImageIds). ' +
      'The submission and its photos stay private until an administrator approves it.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSuggestionDto) {
    return this.suggestions.create(user, dto);
  }
}

@ApiTags('WC suggestions')
@ApiBearerAuth()
@Controller('me/toilet-suggestions')
export class MySuggestionsController {
  constructor(private readonly suggestions: ToiletSuggestionsService) {}

  @Get()
  @ApiOperation({ summary: 'My submissions with status and administrator feedback (paginated)' })
  list(@CurrentUser() user: AuthUser, @Query() q: MySuggestionQueryDto) {
    return this.suggestions.listMine(user, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my submissions, with photos (signed URLs) and review history' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.suggestions.getMine(user, id);
  }
}
