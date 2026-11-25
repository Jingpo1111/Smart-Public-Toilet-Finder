import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AuditService, DbClient } from '../audit/audit.service';
import { PaginatedResult, skipTake } from '../common/dto/pagination.dto';
import type { AuthUser } from '../common/types/auth-user';
import { publicDisplayName } from '../common/utils/display-name';
import { NotificationTemplates } from '../notifications/notification-templates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImageUrlService } from '../storage/image-url.service';
import { PUBLIC_TOILET_WHERE } from '../toilets/toilet-query.builder';
import { UsersService } from '../users/users.service';
import { AdminReviewQueryDto, CreateReviewDto, ModerateReviewDto, PublicReviewQueryDto, UpdateReviewDto } from './dto/review.dto';

const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly urls: ImageUrlService,
    private readonly users: UsersService,
  ) {}

  /**
   * Recomputes averages from ELIGIBLE (non-hidden) reviews. Called inside the review transaction
   * after locking the toilet row, so concurrent reviews of the same WC cannot produce stale aggregates.
   */
  async recalculate(db: DbClient, toiletId: string) {
    const agg = await db.review.aggregate({
      where: { toiletId, isHidden: false },
      _avg: { rating: true, cleanlinessRating: true },
      _count: { _all: true },
    });
    await db.toilet.update({
      where: { id: toiletId },
      data: {
        averageRating: round2(agg._avg.rating),
        cleanlinessRating: round2(agg._avg.cleanlinessRating),
        reviewCount: agg._count._all,
      },
    });
  }

  private async lockToilet(tx: Prisma.TransactionClient, toiletId: string) {
    await tx.$queryRaw`SELECT "id" FROM "Toilet" WHERE "id" = ${toiletId}::uuid FOR UPDATE`;
  }

  private async withAvatars<T extends { user: { id: string; fullName: string; avatarPath: string | null } }>(rows: T[]) {
    const refs = rows.map((r) => this.users.avatarRef(r.user.id, r.user.avatarPath)).filter((x): x is NonNullable<typeof x> => !!x);
    return this.urls.sign(refs);
  }

  private publicShape(
    r: { id: string; rating: number; cleanlinessRating: number; comment: string | null; createdAt: Date; updatedAt: Date; user: { id: string; fullName: string; avatarPath: string | null } },
    avatars: Map<string, { url: string; expiresAt: string }>,
  ) {
    return {
      id: r.id,
      rating: r.rating,
      cleanlinessRating: r.cleanlinessRating,
      comment: r.comment,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      // Privacy: public lists show "First L." and no user id or e-mail.
      author: { displayName: publicDisplayName(r.user.fullName), avatar: avatars.get(`avatar:${r.user.id}`) ?? null },
    };
  }

  private ownShape(r: { id: string; toiletId: string; rating: number; cleanlinessRating: number; comment: string | null; isHidden: boolean; hiddenReason: string | null; createdAt: Date; updatedAt: Date; toilet?: { id: string; name: string; nameKm: string | null } }) {
    return {
      id: r.id,
      toiletId: r.toiletId,
      toilet: r.toilet ?? undefined,
      rating: r.rating,
      cleanlinessRating: r.cleanlinessRating,
      comment: r.comment,
      isHidden: r.isHidden,
      hiddenReason: r.hiddenReason,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async listPublic(toiletId: string, q: PublicReviewQueryDto) {
    const toilet = await this.prisma.toilet.findFirst({ where: { id: toiletId, ...PUBLIC_TOILET_WHERE }, select: { id: true } });
    if (!toilet) throw new NotFoundException('WC not found.');
    const where: Prisma.ReviewWhereInput = { toiletId, isHidden: false };
    const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
      q.sort === 'highest'
        ? [{ rating: 'desc' }, { createdAt: 'desc' }]
        : q.sort === 'lowest'
          ? [{ rating: 'asc' }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }];
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: [...orderBy, { id: 'asc' }],
        include: { user: { select: { id: true, fullName: true, avatarPath: true } } },
        ...skipTake(q),
      }),
      this.prisma.review.count({ where }),
    ]);
    const avatars = await this.withAvatars(rows);
    return PaginatedResult.of(rows.map((r) => this.publicShape(r, avatars)), total, q.page, q.limit);
  }

  async create(user: AuthUser, toiletId: string, dto: CreateReviewDto) {
    const toilet = await this.prisma.toilet.findFirst({ where: { id: toiletId, ...PUBLIC_TOILET_WHERE }, select: { id: true } });
    if (!toilet) throw new NotFoundException('WC not found.');
    try {
      const review = await this.prisma.$transaction(async (tx) => {
        await this.lockToilet(tx, toiletId);
        const r = await tx.review.create({
          data: { toiletId, userId: user.id, rating: dto.rating, cleanlinessRating: dto.cleanlinessRating, comment: dto.comment ?? null },
        });
        await this.recalculate(tx, toiletId);
        return r;
      });
      return this.ownShape(review);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.review.findUnique({
          where: { userId_toiletId: { userId: user.id, toiletId } },
          select: { id: true },
        });
        throw new ConflictException({
          message: 'You have already reviewed this WC. Use PATCH /reviews/:id to update your review.',
          details: { reviewId: existing?.id },
        });
      }
      throw e;
    }
  }

  private async getOwned(user: AuthUser, id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found.');
    if (review.userId !== user.id) throw new ForbiddenException('You can only change your own review.');
    return review;
  }

  async update(user: AuthUser, id: string, dto: UpdateReviewDto) {
    const review = await this.getOwned(user, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockToilet(tx, review.toiletId);
      const r = await tx.review.update({
        where: { id },
        data: {
          ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
          ...(dto.cleanlinessRating !== undefined ? { cleanlinessRating: dto.cleanlinessRating } : {}),
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
        },
      });
      await this.recalculate(tx, review.toiletId);
      return r;
    });
    return this.ownShape(updated);
  }

  async remove(user: AuthUser, id: string) {
    const review = await this.getOwned(user, id);
    await this.prisma.$transaction(async (tx) => {
      await this.lockToilet(tx, review.toiletId);
      await tx.review.delete({ where: { id } });
      await this.recalculate(tx, review.toiletId);
    });
  }

  async listMine(user: AuthUser, q: PublicReviewQueryDto) {
    const where = { userId: user.id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: { toilet: { select: { id: true, name: true, nameKm: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.review.count({ where }),
    ]);
    return PaginatedResult.of(rows.map((r) => this.ownShape(r)), total, q.page, q.limit);
  }

  // ───────────── Moderation (admin) ─────────────

  async adminList(q: AdminReviewQueryDto) {
    const where: Prisma.ReviewWhereInput = {
      ...(q.toiletId ? { toiletId: q.toiletId } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.isHidden !== undefined ? { isHidden: q.isHidden } : {}),
      ...(q.q ? { comment: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true, avatarPath: true } },
          toilet: { select: { id: true, name: true, nameKm: true } },
          moderatedBy: { select: { id: true, fullName: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.review.count({ where }),
    ]);
    const avatars = await this.withAvatars(rows);
    return PaginatedResult.of(
      rows.map((r) => ({
        ...this.ownShape(r),
        toilet: r.toilet,
        user: { id: r.user.id, fullName: r.user.fullName, email: r.user.email, avatar: avatars.get(`avatar:${r.user.id}`) ?? null },
        moderatedBy: r.moderatedBy,
        moderatedAt: r.moderatedAt,
      })),
      total,
      q.page,
      q.limit,
    );
  }

  async moderate(admin: AuthUser, id: string, dto: ModerateReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id }, include: { toilet: { select: { name: true } } } });
    if (!review) throw new NotFoundException('Review not found.');
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockToilet(tx, review.toiletId);
      const r = await tx.review.update({
        where: { id },
        data: {
          isHidden: dto.isHidden,
          hiddenReason: dto.isHidden ? (dto.reason ?? null) : null,
          moderatedById: admin.id,
          moderatedAt: new Date(),
        },
      });
      await this.recalculate(tx, review.toiletId);
      if (review.isHidden !== dto.isHidden) {
        await this.notifications.notify(review.userId, NotificationTemplates.reviewModerated(id, review.toilet.name, dto.isHidden), tx);
      }
      await this.audit.log(
        { actorId: admin.id, action: dto.isHidden ? 'review.hidden' : 'review.unhidden', entityType: 'Review', entityId: id, metadata: { reason: dto.reason } },
        tx,
      );
      return r;
    });
    return this.ownShape(updated);
  }

  async adminDelete(admin: AuthUser, id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found.');
    await this.prisma.$transaction(async (tx) => {
      await this.lockToilet(tx, review.toiletId);
      await tx.review.delete({ where: { id } });
      await this.recalculate(tx, review.toiletId);
      await this.audit.log({ actorId: admin.id, action: 'review.deleted', entityType: 'Review', entityId: id, metadata: { toiletId: review.toiletId, userId: review.userId } }, tx);
    });
  }
}
