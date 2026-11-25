import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import type { AuthUser } from '../common/types/auth-user';
import { FavoritesService } from './favorites.service';

@ApiTags('Favorites')
@ApiBearerAuth()
@Controller('me/favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: 'My favourite WCs (paginated, with cover photos)' })
  list(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.favorites.list(user, q);
  }

  @Post(':toiletId')
  @ResponseMessage('Added to favorites')
  @ApiOperation({ summary: 'Add a verified WC to my favourites (idempotent)' })
  add(@CurrentUser() user: AuthUser, @Param('toiletId', ParseUUIDPipe) toiletId: string) {
    return this.favorites.add(user, toiletId);
  }

  @Delete(':toiletId')
  @ResponseMessage('Removed from favorites')
  @ApiOperation({ summary: 'Remove a WC from my favourites (idempotent)' })
  remove(@CurrentUser() user: AuthUser, @Param('toiletId', ParseUUIDPipe) toiletId: string) {
    return this.favorites.remove(user, toiletId);
  }
}
