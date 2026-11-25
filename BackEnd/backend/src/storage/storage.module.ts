import { Global, Module } from '@nestjs/common';
import { ImageUrlService } from './image-url.service';
import { StorageCleanupService } from './storage-cleanup.service';
import { StorageService } from './storage.service';
import { SupabaseStorageService } from './supabase-storage.service';

@Global()
@Module({
  providers: [{ provide: StorageService, useClass: SupabaseStorageService }, ImageUrlService, StorageCleanupService],
  exports: [StorageService, ImageUrlService, StorageCleanupService],
})
export class StorageModule {}
