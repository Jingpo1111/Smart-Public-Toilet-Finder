import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImageUrlService } from './image-url.service';
import { StorageService } from './storage.service';

/**
 * Storage operations cannot take part in database transactions, so deletions are done
 * best-effort AFTER the database change, and only when no remaining row references the object
 * (a suggestion photo can be shared by a resubmission and by the published toilet).
 */
@Injectable()
export class StorageCleanupService {
  private readonly logger = new Logger(StorageCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly urls: ImageUrlService,
  ) {}

  async referenceCount(bucket: string, objectPath: string): Promise<number> {
    const [s, t, r] = await this.prisma.$transaction([
      this.prisma.suggestionImage.count({ where: { bucket, objectPath, removedAt: null } }),
      this.prisma.toiletImage.count({ where: { bucket, objectPath } }),
      this.prisma.reportImage.count({ where: { bucket, objectPath } }),
    ]);
    return s + t + r;
  }

  async removeIfUnreferenced(bucket: string, objectPath: string): Promise<boolean> {
    this.urls.forget(bucket, objectPath);
    if ((await this.referenceCount(bucket, objectPath)) > 0) return false;
    return this.safeRemove(bucket, [objectPath]);
  }

  /** Removes objects, logging (not throwing) on failure; the hourly cleanup job retries orphans. */
  async safeRemove(bucket: string, paths: string[]): Promise<boolean> {
    if (paths.length === 0) return true;
    paths.forEach((p) => this.urls.forget(bucket, p));
    try {
      await this.storage.remove(bucket, paths);
      return true;
    } catch (e) {
      this.logger.error(`Could not remove ${paths.length} object(s) from ${bucket}: ${(e as Error).message}`);
      return false;
    }
  }
}
