import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import type { AuthUser } from '../common/types/auth-user';
import { ManagerAccessService } from '../manager/manager-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImageUrlService } from '../storage/image-url.service';
import { StorageCleanupService } from '../storage/storage-cleanup.service';
import { StorageService } from '../storage/storage.service';
import { UsersService } from '../users/users.service';
import { ImageProcessingService, MAX_IMAGES_PER_REQUEST, ProcessedImage } from './image-processing.service';

/** Uploaded-but-unattached suggestion/report photos expire after this many hours and are deleted. */
export const UPLOAD_REFERENCE_TTL_HOURS = 24;
/** Max unattached uploads a user may hold at once, per kind. */
export const MAX_PENDING_UPLOADS = 20;
/** Max uploads per user per rolling 24 h, per kind. */
export const MAX_DAILY_UPLOADS = 60;
export const MAX_TOILET_IMAGES = 20;

export interface UploadedImage {
  id: string;
  url: string | null;
  expiresAt: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  /** For suggestion/report uploads: attach the ID to a submission before this time. */
  attachBefore?: string;
  /** True when an identical photo was already uploaded and the existing record is returned. */
  duplicate: boolean;
}

export function uploadCutoff(): Date {
  return new Date(Date.now() - UPLOAD_REFERENCE_TTL_HOURS * 3600_000);
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cleanup: StorageCleanupService,
    private readonly urls: ImageUrlService,
    private readonly processing: ImageProcessingService,
    private readonly config: AppConfigService,
    private readonly access: ManagerAccessService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  private get buckets() {
    return this.config.supabase.buckets;
  }

  private async processAll(files: Express.Multer.File[] | undefined, maxDimension?: number) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No image uploaded. Send multipart/form-data with one or more "files" fields.');
    }
    if (files.length > MAX_IMAGES_PER_REQUEST) {
      throw new BadRequestException(`At most ${MAX_IMAGES_PER_REQUEST} images can be uploaded per request.`);
    }
    const processed: ProcessedImage[] = [];
    for (const f of files) processed.push(await this.processing.process(f, maxDimension));
    if (new Set(processed.map((p) => p.sha256)).size !== processed.length) {
      throw new BadRequestException('The same image was included more than once.');
    }
    return processed;
  }

  /** Uploads every image or none: on any failure, already-uploaded objects are removed. */
  private async storeAll(bucket: string, prefix: string, processed: ProcessedImage[]) {
    const paths: string[] = [];
    try {
      for (const p of processed) {
        const path = `${prefix}/${randomUUID()}.webp`;
        await this.storage.upload(bucket, path, p.buffer, p.mimeType);
        paths.push(path);
      }
      return paths;
    } catch (e) {
      await this.cleanup.safeRemove(bucket, paths);
      throw e;
    }
  }

  private async enforceQuota(kind: 'suggestion' | 'report', userId: string, incoming: number) {
    const cutoff = uploadCutoff();
    const recent = { uploaderId: userId, createdAt: { gte: cutoff } };
    const [pending, daily] =
      kind === 'suggestion'
        ? await Promise.all([
            this.prisma.suggestionImage.count({ where: { ...recent, suggestionId: null } }),
            this.prisma.suggestionImage.count({ where: recent }),
          ])
        : await Promise.all([
            this.prisma.reportImage.count({ where: { ...recent, reportId: null } }),
            this.prisma.reportImage.count({ where: recent }),
          ]);
    if (pending + incoming > MAX_PENDING_UPLOADS) {
      throw new HttpException(
        `Upload quota exceeded: at most ${MAX_PENDING_UPLOADS} unattached photos. Submit or delete existing uploads first.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (daily + incoming > MAX_DAILY_UPLOADS) {
      throw new HttpException(
        `Daily upload quota exceeded (${MAX_DAILY_UPLOADS} photos per 24 hours).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async toUploaded(
    rows: { id: string; bucket: string; objectPath: string; mimeType: string; width: number | null; height: number | null; sizeBytes: number; createdAt: Date }[],
    duplicates: Set<string>,
    withAttachBefore: boolean,
  ): Promise<UploadedImage[]> {
    const signed = await this.urls.sign(rows);
    return rows.map((r) => ({
      id: r.id,
      url: signed.get(r.id)?.url ?? null,
      expiresAt: signed.get(r.id)?.expiresAt ?? null,
      mimeType: r.mimeType,
      width: r.width,
      height: r.height,
      sizeBytes: r.sizeBytes,
      ...(withAttachBefore
        ? { attachBefore: new Date(r.createdAt.getTime() + UPLOAD_REFERENCE_TTL_HOURS * 3600_000).toISOString() }
        : {}),
      duplicate: duplicates.has(r.id),
    }));
  }

  // ───────────── Suggestion photos (private until approved) ─────────────

  async uploadSuggestionImages(user: AuthUser, files: Express.Multer.File[] | undefined) {
    const processed = await this.processAll(files);
    const existing = await this.prisma.suggestionImage.findMany({
      where: {
        uploaderId: user.id,
        suggestionId: null,
        removedAt: null,
        createdAt: { gte: uploadCutoff() },
        sha256: { in: processed.map((p) => p.sha256) },
      },
    });
    const fresh = processed.filter((p) => !existing.some((e) => e.sha256 === p.sha256));
    await this.enforceQuota('suggestion', user.id, fresh.length);

    const bucket = this.buckets.suggestion;
    const paths = await this.storeAll(bucket, user.id, fresh);
    let created;
    try {
      created = await this.prisma.$transaction(
        fresh.map((p, i) =>
          this.prisma.suggestionImage.create({
            data: {
              uploaderId: user.id,
              bucket,
              objectPath: paths[i],
              mimeType: p.mimeType,
              sizeBytes: p.sizeBytes,
              width: p.width,
              height: p.height,
              sha256: p.sha256,
            },
          }),
        ),
      );
    } catch (e) {
      await this.cleanup.safeRemove(bucket, paths);
      throw e;
    }
    const ordered = processed.map(
      (p) => existing.find((e) => e.sha256 === p.sha256) ?? created.find((c) => c.sha256 === p.sha256)!,
    );
    return this.toUploaded(ordered, new Set(existing.map((e) => e.id)), true);
  }

  async deleteUnattachedSuggestionImage(user: AuthUser, id: string) {
    const img = await this.prisma.suggestionImage.findFirst({ where: { id, uploaderId: user.id } });
    if (!img) throw new NotFoundException('Upload not found.');
    if (img.suggestionId) throw new ConflictException('This photo is already part of a submission and cannot be deleted.');
    await this.prisma.suggestionImage.delete({ where: { id } });
    await this.cleanup.removeIfUnreferenced(img.bucket, img.objectPath);
  }

  // ───────────── Report photos (private) ─────────────

  async uploadReportImages(user: AuthUser, files: Express.Multer.File[] | undefined) {
    const processed = await this.processAll(files);
    const existing = await this.prisma.reportImage.findMany({
      where: {
        uploaderId: user.id,
        reportId: null,
        createdAt: { gte: uploadCutoff() },
        sha256: { in: processed.map((p) => p.sha256) },
      },
    });
    const fresh = processed.filter((p) => !existing.some((e) => e.sha256 === p.sha256));
    await this.enforceQuota('report', user.id, fresh.length);

    const bucket = this.buckets.report;
    const paths = await this.storeAll(bucket, user.id, fresh);
    let created;
    try {
      created = await this.prisma.$transaction(
        fresh.map((p, i) =>
          this.prisma.reportImage.create({
            data: {
              uploaderId: user.id,
              bucket,
              objectPath: paths[i],
              mimeType: p.mimeType,
              sizeBytes: p.sizeBytes,
              width: p.width,
              height: p.height,
              sha256: p.sha256,
            },
          }),
        ),
      );
    } catch (e) {
      await this.cleanup.safeRemove(bucket, paths);
      throw e;
    }
    const ordered = processed.map(
      (p) => existing.find((e) => e.sha256 === p.sha256) ?? created.find((c) => c.sha256 === p.sha256)!,
    );
    return this.toUploaded(ordered, new Set(existing.map((e) => e.id)), true);
  }

  async deleteUnattachedReportImage(user: AuthUser, id: string) {
    const img = await this.prisma.reportImage.findFirst({ where: { id, uploaderId: user.id } });
    if (!img) throw new NotFoundException('Upload not found.');
    if (img.reportId) throw new ConflictException('This photo is already part of a report and cannot be deleted.');
    await this.prisma.reportImage.delete({ where: { id } });
    await this.cleanup.removeIfUnreferenced(img.bucket, img.objectPath);
  }

  // ───────────── Toilet photos (admin or assigned manager) ─────────────

  async uploadToiletImages(
    user: AuthUser,
    toiletId: string,
    files: Express.Multer.File[] | undefined,
    opts: { setAsCover?: boolean; caption?: string },
  ) {
    const toilet = await this.access.assertCanManageToilet(user, toiletId);
    const processed = await this.processAll(files);
    const [count, dupes] = await Promise.all([
      this.prisma.toiletImage.count({ where: { toiletId } }),
      this.prisma.toiletImage.findMany({
        where: { toiletId, sha256: { in: processed.map((p) => p.sha256) } },
        select: { id: true },
      }),
    ]);
    if (dupes.length > 0) throw new ConflictException('One or more of these photos were already uploaded for this WC.');
    if (count + processed.length > MAX_TOILET_IMAGES) {
      throw new BadRequestException(`A WC can have at most ${MAX_TOILET_IMAGES} photos. Delete some first.`);
    }

    const bucket = this.buckets.toilet;
    const paths = await this.storeAll(bucket, `toilets/${toiletId}`, processed);
    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const max = await tx.toiletImage.aggregate({ where: { toiletId }, _max: { sortOrder: true } });
        const start = (max._max.sortOrder ?? -1) + 1;
        const rows = [];
        for (let i = 0; i < processed.length; i++) {
          const p = processed[i];
          rows.push(
            await tx.toiletImage.create({
              data: {
                toiletId,
                bucket,
                objectPath: paths[i],
                mimeType: p.mimeType,
                sizeBytes: p.sizeBytes,
                width: p.width,
                height: p.height,
                sha256: p.sha256,
                caption: opts.caption,
                sortOrder: start + i,
                uploadedById: user.id,
              },
            }),
          );
        }
        if (opts.setAsCover || !toilet.coverImageId) {
          await tx.toilet.update({ where: { id: toiletId }, data: { coverImageId: rows[0].id } });
        }
        await this.audit.log(
          {
            actorId: user.id,
            action: 'toilet.images_uploaded',
            entityType: 'Toilet',
            entityId: toiletId,
            metadata: { imageIds: rows.map((r) => r.id) },
          },
          tx,
        );
        return rows;
      });
    } catch (e) {
      await this.cleanup.safeRemove(bucket, paths);
      throw e;
    }
    return this.toUploaded(created, new Set(), false);
  }

  // ───────────── Avatars ─────────────

  async uploadAvatar(user: AuthUser, file: Express.Multer.File | undefined) {
    const [processed] = await this.processAll(file ? [file] : undefined, 512);
    const bucket = this.buckets.avatar;
    const [path] = await this.storeAll(bucket, user.id, [processed]);
    let previous: string | null = null;
    try {
      previous = (await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { avatarPath: true } }))
        .avatarPath;
      await this.prisma.user.update({ where: { id: user.id }, data: { avatarPath: path } });
    } catch (e) {
      await this.cleanup.safeRemove(bucket, [path]);
      throw e;
    }
    if (previous) await this.cleanup.safeRemove(bucket, [previous]);
    return this.users.getProfile(user.id);
  }

  async deleteAvatar(user: AuthUser) {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { avatarPath: true } });
    if (row.avatarPath) {
      await this.prisma.user.update({ where: { id: user.id }, data: { avatarPath: null } });
      await this.cleanup.safeRemove(this.buckets.avatar, [row.avatarPath]);
    }
    return this.users.getProfile(user.id);
  }

  // ───────────── Maintenance ─────────────

  /** Hourly: deletes expired, never-attached uploads and stale auth tokens. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'upload-cleanup' })
  async cleanupExpired(): Promise<{ suggestionImages: number; reportImages: number }> {
    const cutoff = uploadCutoff();
    let suggestionImages = 0;
    let reportImages = 0;
    try {
      const staleS = await this.prisma.suggestionImage.findMany({
        where: { suggestionId: null, createdAt: { lt: cutoff } },
        take: 500,
      });
      for (const img of staleS) {
        const del = await this.prisma.suggestionImage.deleteMany({ where: { id: img.id, suggestionId: null } });
        if (del.count) {
          suggestionImages++;
          await this.cleanup.removeIfUnreferenced(img.bucket, img.objectPath);
        }
      }
      const staleR = await this.prisma.reportImage.findMany({
        where: { reportId: null, createdAt: { lt: cutoff } },
        take: 500,
      });
      for (const img of staleR) {
        const del = await this.prisma.reportImage.deleteMany({ where: { id: img.id, reportId: null } });
        if (del.count) {
          reportImages++;
          await this.cleanup.removeIfUnreferenced(img.bucket, img.objectPath);
        }
      }
      const dayAgo = new Date(Date.now() - 24 * 3600_000);
      await this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: dayAgo } } });
      await this.prisma.passwordResetToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: dayAgo } }, { usedAt: { lt: dayAgo } }] },
      });
      if (suggestionImages || reportImages) {
        this.logger.log(`Cleanup removed ${suggestionImages} suggestion and ${reportImages} report uploads.`);
      }
    } catch (e) {
      this.logger.error(`Upload cleanup failed: ${(e as Error).message}`);
    }
    return { suggestionImages, reportImages };
  }
}
