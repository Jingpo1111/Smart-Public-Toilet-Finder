import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { ReportCategory, ReportStatus } from '../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ToBoolean, Trim } from '../../common/utils/transformers';
import { MAX_IMAGES_PER_REQUEST } from '../../uploads/image-processing.service';

export class CreateReportDto {
  @ApiProperty({ enum: ReportCategory })
  @IsEnum(ReportCategory)
  category: ReportCategory;

  @ApiProperty({ minLength: 5, maxLength: 2000, example: 'There is no water in the hand basin since this morning.' })
  @Trim()
  @IsString()
  @Length(5, 2000)
  description: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: MAX_IMAGES_PER_REQUEST,
    description: 'IDs returned by POST /uploads/reports',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES_PER_REQUEST)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  imageIds?: string[];
}

export class UpdateReportStatusDto {
  @ApiProperty({ enum: ReportStatus })
  @IsEnum(ReportStatus)
  status: ReportStatus;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Required for RESOLVED and REJECTED; shown to the reporter' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}

export class MyReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
}

export class ReportQueryDto extends MyReportQueryDto {
  @ApiPropertyOptional({ enum: ReportCategory })
  @IsOptional()
  @IsEnum(ReportCategory)
  category?: ReportCategory;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  toiletId?: string;

  @ApiPropertyOptional({ description: 'Search description or WC name' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Only PENDING and IN_PROGRESS' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  unresolved?: boolean;
}
