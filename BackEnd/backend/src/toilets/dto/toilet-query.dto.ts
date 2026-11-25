import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { AccessType, ToiletStatus } from '../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ToBoolean, Trim } from '../../common/utils/transformers';

export const TOILET_SORTS = ['distance', 'rating', 'cleanliness', 'name', 'newest', 'price'] as const;
export type ToiletSort = (typeof TOILET_SORTS)[number];

export const MAX_SEARCH_RADIUS_M = 50_000;
export const MAX_NEARBY_RADIUS_M = 20_000;

/** Filters shared by GET /toilets and GET /toilets/nearby. */
export class ToiletFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search name (EN/KM), address, district or Sangkat', maxLength: 100 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 'Phnom Penh' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  province?: string;

  @ApiPropertyOptional({ example: 'Daun Penh', description: 'Khan (district), case-insensitive exact match' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  district?: string;

  @ApiPropertyOptional({ example: 'Wat Phnom' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  sangkat?: string;

  @ApiPropertyOptional({ enum: AccessType })
  @IsOptional()
  @IsEnum(AccessType)
  accessType?: AccessType;

  @ApiPropertyOptional({ description: 'Shortcut for accessType=FREE' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  free?: boolean;

  @ApiPropertyOptional({ description: 'Maximum price in KHR (FREE WCs always match; PAID with unknown price never match)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    description:
      'true = known to be open now (Asia/Phnom_Penh); false = known to be closed now. WCs with unknown hours match neither.',
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  openNow?: boolean;

  @ApiPropertyOptional({ description: 'true / false filter on known values (unknown never matches)' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  wheelchairAccessible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  hasWater?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  hasSoap?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  babyChanging?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Minimum average overall rating' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Minimum average cleanliness rating' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minCleanliness?: number;

  @ApiPropertyOptional({ enum: ToiletStatus })
  @IsOptional()
  @IsEnum(ToiletStatus)
  status?: ToiletStatus;
}

export class ToiletSearchQueryDto extends ToiletFilterDto {
  @ApiPropertyOptional({ example: 11.5564, description: 'Latitude of the reference point (enables distance)' })
  @ValidateIf((o: ToiletSearchQueryDto) => o.lng !== undefined || o.lat !== undefined)
  @Type(() => Number)
  @IsLatitude({ message: 'lat must be a valid latitude (send lat and lng together)' })
  lat?: number;

  @ApiPropertyOptional({ example: 104.9282, description: 'Longitude of the reference point' })
  @ValidateIf((o: ToiletSearchQueryDto) => o.lng !== undefined || o.lat !== undefined)
  @Type(() => Number)
  @IsLongitude({ message: 'lng must be a valid longitude (send lat and lng together)' })
  lng?: number;

  @ApiPropertyOptional({ description: `Radius in metres around lat/lng (max ${MAX_SEARCH_RADIUS_M})`, minimum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(MAX_SEARCH_RADIUS_M)
  radius?: number;

  @ApiPropertyOptional({ enum: TOILET_SORTS, default: 'rating', description: '"distance" requires lat & lng' })
  @IsOptional()
  @IsIn(TOILET_SORTS)
  sort?: ToiletSort;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class NearbyQueryDto extends ToiletFilterDto {
  @ApiProperty({ example: 11.5564, description: 'Latitude (WGS84)' })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 104.9282, description: 'Longitude (WGS84)' })
  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @ApiPropertyOptional({ default: 2000, minimum: 50, maximum: MAX_NEARBY_RADIUS_M, description: 'Radius in metres' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(MAX_NEARBY_RADIUS_M)
  radius: number = 2000;
}

export class DistanceQueryDto {
  @ApiPropertyOptional({ description: 'Optional reference latitude to include distance' })
  @ValidateIf((o: DistanceQueryDto) => o.lng !== undefined || o.lat !== undefined)
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ description: 'Optional reference longitude to include distance' })
  @ValidateIf((o: DistanceQueryDto) => o.lng !== undefined || o.lat !== undefined)
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}
