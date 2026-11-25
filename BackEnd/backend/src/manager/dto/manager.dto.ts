import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxDate,
  MaxLength,
  Min,
} from 'class-validator';
import { ToiletStatus } from '../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Trim } from '../../common/utils/transformers';

export class ManagerToiletQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ToiletStatus })
  @IsOptional()
  @IsEnum(ToiletStatus)
  status?: ToiletStatus;
}

export class CreateCleaningScheduleDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday … 6 = Saturday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: '07:30', description: 'Local time HH:mm (Asia/Phnom_Penh)' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:mm' })
  startTime: string;

  @ApiPropertyOptional({ maxLength: 120, description: 'Cleaner or team name' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  assignedTo?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCleaningScheduleDto extends PartialType(CreateCleaningScheduleDto) {}

export class CleaningScheduleQueryDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  toiletId?: string;
}

export class CreateCleaningLogDto {
  @ApiPropertyOptional({ description: 'When the cleaning happened (ISO 8601). Defaults to now; cannot be in the future.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MaxDate(() => new Date(Date.now() + 5 * 60_000), { message: 'cleanedAt cannot be in the future' })
  cleanedAt?: Date;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  waterRefilled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  soapRefilled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paperRefilled?: boolean;
}

export class CleaningLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  toiletId?: string;
}
