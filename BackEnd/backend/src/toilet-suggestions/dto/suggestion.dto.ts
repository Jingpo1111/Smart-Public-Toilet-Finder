import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { SuggestionStatus, ToiletStatus } from '../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ToBoolean, Trim } from '../../common/utils/transformers';
import { ToiletCoreDto } from '../../toilets/dto/toilet-fields.dto';
import { MAX_IMAGES_PER_REQUEST } from '../../uploads/image-processing.service';

/**
 * Submit a missing WC location. Photos are uploaded first with POST /uploads/suggestions;
 * send the returned IDs as `imageIds`. Status is always set to PENDING by the server.
 */
export class CreateSuggestionDto extends ToiletCoreDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: MAX_IMAGES_PER_REQUEST,
    description: 'IDs returned by POST /uploads/suggestions (your own uploads, not older than 24 h)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES_PER_REQUEST)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  imageIds?: string[];

  @ApiPropertyOptional({ format: 'uuid', description: 'One of imageIds / retainedImageIds to use as cover photo' })
  @IsOptional()
  @IsUUID()
  coverImageId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'When correcting a REJECTED suggestion: its ID. The rejected suggestion and its review history are kept.',
  })
  @IsOptional()
  @IsUUID()
  resubmittedFromId?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Photos of the rejected suggestion (resubmittedFromId) to reuse without uploading again',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES_PER_REQUEST)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  retainedImageIds?: string[];
}

/** Corrections an administrator may apply while approving. The original submission is not modified. */
export class SuggestionCorrectionsDto extends PartialType(ToiletCoreDto) {
  @ApiPropertyOptional({ enum: ToiletStatus, default: ToiletStatus.OPEN, description: 'Operational status of the published WC' })
  @IsOptional()
  @IsEnum(ToiletStatus)
  status?: ToiletStatus;
}

export class ReviewSuggestionDto {
  @ApiProperty({ enum: [SuggestionStatus.APPROVED, SuggestionStatus.REJECTED] })
  @IsIn([SuggestionStatus.APPROVED, SuggestionStatus.REJECTED])
  status: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ minLength: 5, maxLength: 1000, description: 'Required when rejecting; shown to the contributor' })
  @ValidateIf((o: ReviewSuggestionDto) => o.status === SuggestionStatus.REJECTED || o.rejectionReason !== undefined)
  @Trim()
  @IsString()
  @Length(5, 1000)
  rejectionReason?: string;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Optional feedback for the contributor' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;

  @ApiPropertyOptional({ type: SuggestionCorrectionsDto, description: 'Approval only: corrected WC data to publish' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SuggestionCorrectionsDto)
  corrections?: SuggestionCorrectionsDto;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Approval only: which suggestion photos to publish (default: all not removed by moderation)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES_PER_REQUEST)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  publishImageIds?: string[];

  @ApiPropertyOptional({ format: 'uuid', description: 'Approval only: suggestion photo to use as the cover' })
  @IsOptional()
  @IsUUID()
  coverImageId?: string;
}

export class MySuggestionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SuggestionStatus })
  @IsOptional()
  @IsEnum(SuggestionStatus)
  status?: SuggestionStatus;
}

export class AdminSuggestionQueryDto extends MySuggestionQueryDto {
  @ApiPropertyOptional({ description: 'Search name, address, district, Sangkat, contributor name/e-mail' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  district?: string;

  @ApiPropertyOptional({ description: 'Only submissions flagged as possible duplicates' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  hasPotentialDuplicate?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  contributorId?: string;

  @ApiPropertyOptional({ enum: ['newest', 'oldest'], default: 'newest' })
  @IsOptional()
  @IsIn(['newest', 'oldest'])
  sort?: 'newest' | 'oldest';
}

export class RemoveImageQueryDto {
  @ApiPropertyOptional({ maxLength: 300, description: 'Moderation reason' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
