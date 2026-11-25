import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ToBoolean, TrimNullable, Trim } from '../../common/utils/transformers';

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, description: 'Overall rating (integer 1–5)' })
  @IsInt({ message: 'rating must be an integer from 1 to 5' })
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Cleanliness rating (integer 1–5)' })
  @IsInt({ message: 'cleanlinessRating must be an integer from 1 to 5' })
  @Min(1)
  @Max(5)
  cleanlinessRating: number;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @TrimNullable()
  @IsString()
  @MaxLength(2000)
  comment?: string | null;
}

export class UpdateReviewDto extends PartialType(CreateReviewDto) {}

export class PublicReviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['newest', 'highest', 'lowest'], default: 'newest' })
  @IsOptional()
  @IsIn(['newest', 'highest', 'lowest'])
  sort?: 'newest' | 'highest' | 'lowest';
}

export class AdminReviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  toiletId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isHidden?: boolean;

  @ApiPropertyOptional({ description: 'Search in comments' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class ModerateReviewDto {
  @ApiProperty({ description: 'true hides the review from public lists and rating averages' })
  @IsBoolean()
  isHidden: boolean;

  @ApiPropertyOptional({ maxLength: 500, description: 'Required when hiding' })
  @ValidateIf((o: ModerateReviewDto) => o.isHidden === true || o.reason !== undefined)
  @Trim()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
