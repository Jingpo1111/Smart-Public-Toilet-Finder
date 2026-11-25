import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { ManagerAccessService } from '../manager/manager-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImageUrlService } from '../storage/image-url.service';
import { StorageCleanupService } from '../storage/storage-cleanup.service';

/** Photo management for published WCs (admin, or the manager assigned to the WC). */
@Injectable()
export class ToiletImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ManagerAccessService,
    private readonly urls: ImageUrlService,
    private readonly cleanup: StorageCleanupService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, toiletId: string) {
    const toilet = await this.access.assertCanManageToilet(user, toiletId);
    const images = await this.prisma.toiletImage.findMany({
      where: { toiletId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const signed = await this.urls.sign(images);
    return images.map((i) => ({
      id: i.id,
      url: signed.get(i.id)?.url ?? null,
      expiresAt: signed.get(i.id)?.expiresAt ?? null,
      width: i.width,
      height: i.height,
      sizeBytes: i.sizeBytes,
      caption: i.caption,
      sortOrder: i.sortOrder,
      isCover: toilet.coverImageId === i.id,
      fromSuggestion: i.sourceSuggestionImageId !== null,
      createdAt: i.createdAt,
    }));
  }

  async setCover(user: AuthUser, toiletId: string, imageId: string) {
    await this.access.assertCanManageToilet(user, toiletId);
    const img = await this.prisma.toiletImage.findFirst({ where: { id: imageId, toiletId }, select: { id: true } });
    if (!img) throw new NotFoundException('Image not found for this WC.');
    await this.prisma.toilet.update({ where: { id: toiletId }, data: { coverImageId: imageId } });
    await this.audit.log({ actorId: user.id, action: 'toilet.cover_changed', entityType: 'Toilet', entityId: toiletId, metadata: { imageId } });
    return this.list(user, toiletId);
  }

  /** Deletes a photo (also used for moderation of inappropriate images). */
  async remove(user: AuthUser, toiletId: string, imageId: string, reason?: string) {
    const toilet = await this.access.assertCanManageToilet(user, toiletId);
    const img = await this.prisma.toiletImage.findFirst({ where: { id: imageId, toiletId } });
    if (!img) throw new NotFoundException('Image not found for this WC.');
    await this.prisma.$transaction(async (tx) => {
      if (toilet.coverImageId === imageId) {
        const next = await tx.toiletImage.findFirst({
          where: { toiletId, id: { not: imageId } },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { id: true },
        });
        await tx.toilet.update({ where: { id: toiletId }, data: { coverImageId: next?.id ?? null } });
      }
      await tx.toiletImage.delete({ where: { id: imageId } });
      await this.audit.log(
        { actorId: user.id, action: 'toilet.image_deleted', entityType: 'Toilet', entityId: toiletId, metadata: { imageId, reason } },
        tx,
      );
    });
    await this.cleanup.removeIfUnreferenced(img.bucket, img.objectPath);
    return this.list(user, toiletId);
  }
}
