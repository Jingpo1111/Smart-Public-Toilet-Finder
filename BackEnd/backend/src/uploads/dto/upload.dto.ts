import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ToBoolean, Trim } from '../../common/utils/transformers';

const FILES_DESCRIPTION =
  'Up to 5 images (JPG/JPEG, PNG or WebP, max 5 MB each). Content is verified, EXIF/GPS metadata is stripped and images are re-encoded to WebP. Do not photograph people using toilets, private areas or personally identifying material.';

/** Swagger schema for multipart uploads of several images. */
export class MultiImageUploadSchema {
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' }, description: FILES_DESCRIPTION })
  files: unknown[];
}

export class ToiletImageUploadDto {
  @ApiProperty({ format: 'uuid', description: 'WC to attach the photos to (admin, or manager assigned to it)' })
  @IsUUID()
  toiletId: string;

  @ApiPropertyOptional({ description: 'Make the first uploaded photo the cover image' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  setAsCover?: boolean;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  caption?: string;
}

export class ToiletImageUploadSchema extends ToiletImageUploadDto {
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' }, description: FILES_DESCRIPTION })
  files: unknown[];
}

export class AvatarUploadSchema {
  @ApiProperty({ type: 'string', format: 'binary', description: 'One JPG/PNG/WebP image, max 5 MB. Resized to 512 px.' })
  file: unknown;
}
