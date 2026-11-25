import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AccessType } from '../../generated/prisma/client';
import { CAMBODIA_BOUNDS } from '../../common/utils/geo';
import { TIME_PATTERN } from '../../common/utils/opening-hours';
import { Trim, TrimNullable } from '../../common/utils/transformers';

export const MAX_PRICE_KHR = 100_000;

/** Facility flags. `null` (or omitted) means UNKNOWN — not the same as `false`. */
export class FacilitiesDto {
  @ApiPropertyOptional({ nullable: true, description: 'Running water. null = unknown' })
  @IsOptional()
  @IsBoolean()
  hasWater?: boolean | null;

  @ApiPropertyOptional({ nullable: true, description: 'Soap available. null = unknown' })
  @IsOptional()
  @IsBoolean()
  hasSoap?: boolean | null;

  @ApiPropertyOptional({ nullable: true, description: 'Wheelchair accessible. null = unknown' })
  @IsOptional()
  @IsBoolean()
  wheelchairAccessible?: boolean | null;

  @ApiPropertyOptional({ nullable: true, description: 'Baby changing facilities. null = unknown' })
  @IsOptional()
  @IsBoolean()
  babyChanging?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  hasToiletPaper?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  hasHandDryer?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isGenderNeutral?: boolean | null;
}

/**
 * One opening interval in Asia/Phnom_Penh local time.
 * closesAt <= opensAt means the interval ends the next day (e.g. 18:00 → 02:00).
 * Use is24Hours: true for an all-day interval. An empty/absent list means "hours unknown".
 */
export class OpeningHourDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday … 6 = Saturday' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiPropertyOptional({ example: '06:00', description: 'HH:mm (24 h)' })
  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: 'opensAt must be HH:mm' })
  opensAt?: string;

  @ApiPropertyOptional({ example: '21:00', description: 'HH:mm (24 h); 24:00 allowed' })
  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: 'closesAt must be HH:mm' })
  closesAt?: string;

  @ApiPropertyOptional({ description: 'Open all day (ignores opensAt/closesAt)' })
  @IsOptional()
  @IsBoolean()
  is24Hours?: boolean;
}

/** Location and description fields shared by suggestions and admin-created WCs. */
export class ToiletCoreDto {
  @ApiProperty({ example: 'Wat Phnom Public Toilet', minLength: 2, maxLength: 150 })
  @Trim()
  @IsString()
  @Length(2, 150)
  name: string;

  @ApiPropertyOptional({ example: 'បង្គន់សាធារណៈវត្តភ្នំ', maxLength: 150 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(150)
  nameKm?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @TrimNullable()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({ example: 'Street 94, near Wat Phnom park entrance', minLength: 3, maxLength: 300 })
  @Trim()
  @IsString()
  @Length(3, 300)
  address: string;

  @ApiPropertyOptional({ example: 'Phnom Penh', default: 'Phnom Penh', maxLength: 80 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  province?: string;

  @ApiPropertyOptional({ example: 'Daun Penh', description: 'Khan (district)', maxLength: 80 })
  @IsOptional()
  @TrimNullable()
  @IsString()
  @MaxLength(80)
  district?: string | null;

  @ApiPropertyOptional({ example: 'Wat Phnom', maxLength: 80 })
  @IsOptional()
  @TrimNullable()
  @IsString()
  @MaxLength(80)
  sangkat?: string | null;

  @ApiProperty({ example: 11.5764, minimum: CAMBODIA_BOUNDS.minLat, maximum: CAMBODIA_BOUNDS.maxLat })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(CAMBODIA_BOUNDS.minLat, { message: 'latitude must be within Cambodia' })
  @Max(CAMBODIA_BOUNDS.maxLat, { message: 'latitude must be within Cambodia' })
  latitude: number;

  @ApiProperty({ example: 104.9231, minimum: CAMBODIA_BOUNDS.minLng, maximum: CAMBODIA_BOUNDS.maxLng })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(CAMBODIA_BOUNDS.minLng, { message: 'longitude must be within Cambodia' })
  @Max(CAMBODIA_BOUNDS.maxLng, { message: 'longitude must be within Cambodia' })
  longitude: number;

  @ApiPropertyOptional({ enum: AccessType, default: AccessType.UNKNOWN })
  @IsOptional()
  @IsEnum(AccessType)
  accessType?: AccessType;

  @ApiPropertyOptional({
    nullable: true,
    minimum: 0,
    maximum: MAX_PRICE_KHR,
    example: 500,
    description: 'Integer price in Cambodian riel (KHR). FREE → 0; PAID with unknown price → null.',
  })
  @IsOptional()
  @IsInt({ message: 'priceKhr must be a whole number of riel' })
  @Min(0)
  @Max(MAX_PRICE_KHR)
  priceKhr?: number | null;

  @ApiPropertyOptional({ type: FacilitiesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FacilitiesDto)
  facilities?: FacilitiesDto;

  @ApiPropertyOptional({ type: [OpeningHourDto], nullable: true, description: 'null or [] = unknown hours' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => OpeningHourDto)
  openingHours?: OpeningHourDto[] | null;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @TrimNullable()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
