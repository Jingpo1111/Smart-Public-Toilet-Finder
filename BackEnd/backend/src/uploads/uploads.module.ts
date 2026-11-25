import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ImageProcessingService } from './image-processing.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [UsersModule],
  controllers: [UploadsController],
  providers: [UploadsService, ImageProcessingService],
  exports: [UploadsService, ImageProcessingService],
})
export class UploadsModule {}
