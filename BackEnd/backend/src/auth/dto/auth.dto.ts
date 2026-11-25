import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { Language } from '../../generated/prisma/client';
import { ToLowerCaseTrimmed, Trim } from '../../common/utils/transformers';

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
export const PASSWORD_MESSAGE = 'password must be 8–128 characters and contain at least one letter and one number';

export class RegisterDto {
  @ApiProperty({ example: 'sokha@example.com' })
  @ToLowerCaseTrimmed()
  @IsEmail({}, { message: 'email must be a valid e-mail address' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Str0ngPassw0rd', minLength: 8, maxLength: 128 })
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiProperty({ example: 'Sokha Chan', minLength: 2, maxLength: 120 })
  @Trim()
  @IsString()
  @Length(2, 120)
  fullName: string;

  @ApiPropertyOptional({ example: '+855 12 345 678' })
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{6,32}$/, { message: 'phone must be a valid phone number' })
  phone?: string;

  @ApiPropertyOptional({ enum: Language, default: Language.EN })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;
}

export class LoginDto {
  @ApiProperty({ example: 'sokha@example.com' })
  @ToLowerCaseTrimmed()
  @IsEmail({}, { message: 'email must be a valid e-mail address' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Str0ngPassw0rd' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'sokha@example.com' })
  @ToLowerCaseTrimmed()
  @IsEmail({}, { message: 'email must be a valid e-mail address' })
  @MaxLength(254)
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from the reset link (?token=…)' })
  @IsString()
  @Length(20, 200)
  token: string;

  @ApiProperty({ example: 'N3wStr0ngPassw0rd' })
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ example: 'N3wStr0ngPassw0rd' })
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  newPassword: string;
}
