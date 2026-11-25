import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AccessType, ToiletStatus } from '../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ToBoolean, Trim } from '../../common/utils/transformers';
import { ToiletCoreDto } from './toilet-fields.dto';

/** Admin-created WCs are verified immediately (only administrators can do this). */
export class AdminCreateToiletDto extends ToiletCoreDto {
  @ApiPropertyOptional({ enum: ToiletStatus, default: ToiletStatus.OPEN })
  @IsOptional()
  @IsEnum(ToiletStatus)
  status?: ToiletStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  descriptionKm?: string;
}

/** All fields optional. `null` clears optional fields; required fields (name, address, coordinates) cannot be null. */
export class AdminUpdateToiletDto extends PartialType(AdminCreateToiletDto) {}

/**
 * Fields an assigned MANAGER may change: description, notes, operational status, access/price,
 * facilities and opening hours. Name, address, coordinates, verification and archive are admin-only;
 * sending them returns 400.
 */
export class ManagerUpdateToiletDto extends PickType(AdminUpdateToiletDto, [
  'description',
  'descriptionKm',
  'notes',
  'status',
  'accessType',
  'priceKhr',
  'facilities',
  'openingHours',
] as const) {}

export class ArchiveToiletQueryDto {
  @ApiPropertyOptional({ maxLength: 500, description: 'Reason for archiving' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SetCoverDto {
  @ApiProperty({ format: 'uuid', description: 'ID of one of this WC\'s photos' })
  @IsUUID()
  imageId: string;
}

export class AdminToiletQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search name, address, district, Sangkat' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ToiletStatus })
  @IsOptional()
  @IsEnum(ToiletStatus)
  status?: ToiletStatus;

  @ApiPropertyOptional({ enum: AccessType })
  @IsOptional()
  @IsEnum(AccessType)
  accessType?: AccessType;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  district?: string;

  @ApiPropertyOptional({ enum: ['exclude', 'include', 'only'], default: 'exclude', description: 'Archived WCs' })
  @IsOptional()
  @IsIn(['exclude', 'include', 'only'])
  archived: 'exclude' | 'include' | 'only' = 'exclude';

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only WCs assigned to this manager' })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({ enum: ['newest', 'name', 'rating', 'updated'], default: 'newest' })
  @IsOptional()
  @IsIn(['newest', 'name', 'rating', 'updated'])
  sort?: 'newest' | 'name' | 'rating' | 'updated';
}
