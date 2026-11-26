import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelope, ApiPaginatedEnvelope } from '../common/decorators/api-envelope.decorator';
import { CacheFor } from '../common/interceptors/cache-control.interceptor';
import { OptionalUser, Public } from '../common/decorators/auth.decorators';
import type { AuthUser } from '../common/types/auth-user';
import { DISTANCE_NOTE } from '../common/utils/geo';
import { DistanceQueryDto, NearbyQueryDto, ToiletSearchQueryDto } from './dto/toilet-query.dto';
import { ToiletDetailResponse, ToiletSummaryResponse } from './dto/toilet.response';
import { ToiletsService } from './toilets.service';

/**
 * Public WC discovery. Returns ONLY verified, non-archived WCs — never pending or rejected suggestions.
 * Static routes (/nearby, /districts) are declared before /:id, and :id must be a UUID.
 */
@ApiTags('Toilets (public)')
@Controller('toilets')
export class ToiletsController {
  constructor(private readonly toilets: ToiletsService) {}

  @Public()
  @CacheFor(15)
  @Get()
  @ApiOperation({
    summary: 'Search and filter verified WCs (paginated)',
    description: `Optional lat/lng add a distance to each item and enable sort=distance and radius. ${DISTANCE_NOTE}`,
  })
  @ApiPaginatedEnvelope(ToiletSummaryResponse)
  search(@Query() q: ToiletSearchQueryDto) {
    return this.toilets.search(q);
  }

  @Public()
  @CacheFor(15)
  @Get('nearby')
  @ApiOperation({
    summary: 'Nearby verified WCs within a radius, nearest first (paginated)',
    description: `Query parameters are named lat and lng. ${DISTANCE_NOTE} The caller's location is not stored.`,
  })
  @ApiPaginatedEnvelope(ToiletSummaryResponse)
  nearby(@Query() q: NearbyQueryDto) {
    return this.toilets.nearby(q);
  }

  @Public()
  @CacheFor(120)
  @Get('districts')
  @ApiOperation({ summary: 'Districts (Khan) that have verified WCs, with counts' })
  districts() {
    return this.toilets.districts();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'WC details (verified, non-archived only). isFavorite is included when authenticated.' })
  @ApiEnvelope(ToiletDetailResponse)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: DistanceQueryDto,
    @OptionalUser() viewer: AuthUser | null,
  ) {
    return this.toilets.findPublic(id, viewer, q);
  }

  @Public()
  @Get(':id/images')
  @ApiOperation({ summary: 'Fresh signed URLs for the photos of a verified WC (use when URLs expire)' })
  images(@Param('id', ParseUUIDPipe) id: string) {
    return this.toilets.publicImages(id);
  }
}
