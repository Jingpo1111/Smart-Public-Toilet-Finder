import { Module } from '@nestjs/common';
import { ToiletImagesService } from './toilet-images.service';
import { ToiletsController } from './toilets.controller';
import { ToiletsService } from './toilets.service';

@Module({
  controllers: [ToiletsController],
  providers: [ToiletsService, ToiletImagesService],
  exports: [ToiletsService, ToiletImagesService],
})
export class ToiletsModule {}
