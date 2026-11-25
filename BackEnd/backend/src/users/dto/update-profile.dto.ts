import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { Language } from '../../generated/prisma/client';
import { Trim, TrimNullable } from '../../common/utils/transformers';

/**
 * Profile update. Only these properties are accepted; anything else (role, email, isActive, …)
 * is rejected with 400 by the global whitelist validation.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Sokha Chan', minLength: 2, maxLength: 120 })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(2, 120)
  fullName?: string;

  @ApiPropertyOptional({ example: '+855 12 345 678', nullable: true, description: 'Send null to remove' })
  @IsOptional()
  @TrimNullable()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Matches(/^\+?[0-9 ()-]{6,32}$/, { message: 'phone must be a valid phone number' })
  phone?: string | null;

  @ApiPropertyOptional({ enum: Language })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;
}
