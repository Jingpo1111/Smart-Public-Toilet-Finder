import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser, Roles } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { AvatarUploadSchema, MultiImageUploadSchema, ToiletImageUploadDto, ToiletImageUploadSchema } from './dto/upload.dto';
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_REQUEST } from './image-processing.service';
import { UploadsService } from './uploads.service';

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES_PER_REQUEST, fields: 10, parts: 20 },
};

/**
 * Upload contract: photos are uploaded FIRST with these endpoints (multipart/form-data), which return
 * image IDs. The IDs are then referenced in JSON bodies (POST /toilet-suggestions `imageIds`,
 * POST /toilets/:id/reports `imageIds`). Unattached uploads expire after 24 hours.
 */
@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('suggestions')
  @UseInterceptors(FilesInterceptor('files', MAX_IMAGES_PER_REQUEST, multerOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: MultiImageUploadSchema })
  @ResponseMessage('Photos uploaded. Attach the returned IDs to your WC submission within 24 hours.')
  @ApiOperation({
    summary: 'Upload private photos for a WC suggestion',
    description:
      'Returns image IDs to send as `imageIds` in POST /toilet-suggestions. Photos stay private (signed URLs for you and administrators only) unless the suggestion is approved.',
  })
  suggestion(@CurrentUser() user: AuthUser, @UploadedFiles() files: Express.Multer.File[]) {
    return this.uploads.uploadSuggestionImages(user, files);
  }

  @Delete('suggestions/:id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Upload deleted')
  @ApiOperation({ summary: 'Delete one of my unattached suggestion photos' })
  async deleteSuggestion(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.uploads.deleteUnattachedSuggestionImage(user, id);
    return null;
  }

  @Post('reports')
  @UseInterceptors(FilesInterceptor('files', MAX_IMAGES_PER_REQUEST, multerOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: MultiImageUploadSchema })
  @ResponseMessage('Photos uploaded. Attach the returned IDs to your report within 24 hours.')
  @ApiOperation({
    summary: 'Upload private photos for a maintenance report',
    description: 'Returns image IDs to send as `imageIds` in POST /toilets/:id/reports.',
  })
  report(@CurrentUser() user: AuthUser, @UploadedFiles() files: Express.Multer.File[]) {
    return this.uploads.uploadReportImages(user, files);
  }

  @Delete('reports/:id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Upload deleted')
  @ApiOperation({ summary: 'Delete one of my unattached report photos' })
  async deleteReport(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.uploads.deleteUnattachedReportImage(user, id);
    return null;
  }

  @Post('toilets')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @UseInterceptors(FilesInterceptor('files', MAX_IMAGES_PER_REQUEST, multerOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ToiletImageUploadSchema })
  @ResponseMessage('WC photos uploaded')
  @ApiOperation({
    summary: 'Upload photos directly to a WC (ADMIN, or MANAGER assigned to that WC)',
    description: 'Photos are linked immediately and become public if the WC is verified and not archived.',
  })
  toilet(
    @CurrentUser() user: AuthUser,
    @Body() dto: ToiletImageUploadDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.uploads.uploadToiletImages(user, dto.toiletId, files, { setAsCover: dto.setAsCover, caption: dto.caption });
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { ...multerOptions, limits: { ...multerOptions.limits, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: AvatarUploadSchema })
  @ResponseMessage('Avatar updated')
  @ApiOperation({ summary: 'Upload or replace my avatar (returns my updated profile)' })
  avatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.uploads.uploadAvatar(user, file);
  }

  @Delete('avatar')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Avatar removed')
  @ApiOperation({ summary: 'Remove my avatar' })
  deleteAvatar(@CurrentUser() user: AuthUser) {
    return this.uploads.deleteAvatar(user);
  }
}
