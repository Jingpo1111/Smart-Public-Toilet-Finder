import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { UserRole } from '../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ToBoolean, Trim } from '../../common/utils/transformers';

export class AdminUserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search name, e-mail or phone' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}

export class ChangeRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}

export class ChangeUserStatusDto {
  @ApiProperty({ description: 'false deactivates the account and revokes all sessions' })
  @IsBoolean()
  isActive: boolean;
}

export class CreateAssignmentDto {
  @ApiProperty({ format: 'uuid', description: 'User with role MANAGER' })
  @IsUUID()
  managerId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  toiletId: string;
}

export class AssignmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  toiletId?: string;
}

export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'Toilet' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorId?: string;
}
