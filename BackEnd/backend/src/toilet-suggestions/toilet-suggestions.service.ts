import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessType, Prisma, SuggestionStatus, ToiletStatus } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PaginatedResult, skipTake } from '../common/dto/pagination.dto';
import type { AuthUser } from '../common/types/auth-user';
import { StoredInterval, toOutput } from '../common/utils/opening-hours';
import { NotificationTemplates } from '../notifications/notification-templates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImageAccess, ImageUrlService } from '../storage/image-url.service';
import { StorageCleanupService } from '../storage/storage-cleanup.service';
import { ToiletsService } from '../toilets/toilets.service';
import { facilityPatch, normalizeAccess, parseOpeningHours } from '../toilets/toilet-rules';
import { uploadCutoff } from '../uploads/uploads.service';
import { MAX_IMAGES_PER_REQUEST } from '../uploads/image-processing.service';
import { UsersService } from '../users/users.service';
import { DuplicateDetectorService } from './duplicate-detector.service';
import {
  AdminSuggestionQueryDto,
  CreateSuggestionDto,
  MySuggestionQueryDto,
  ReviewSuggestionDto,
} from './dto/suggestion.dto';

const IMAGES_ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];
const WITH_IMAGES = {
  images: { where: { removedAt: null }, orderBy: IMAGES_ORDER },
  resubmission: { select: { id: true, status: true } },
} satisfies Prisma.ToiletSuggestionInclude;

type SuggestionRow = Prisma.ToiletSuggestionGetPayload<{ include: typeof WITH_IMAGES }>;

/** Opening hours are stored on suggestions as validated JSON intervals. */
export function hoursFromJson(value: Prisma.JsonValue | null): StoredInterval[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is { dayOfWeek: number; openMinute: number; closeMinute: number } =>
      !!v &&
      typeof v === 'object' &&
      typeof (v as Record<string, unknown>).dayOfWeek === 'number' &&
      typeof (v as Record<string, unknown>).openMinute === 'number' &&
      typeof (v as Record<string, unknown>).closeMinute === 'number',
  );
}

@Injectable()
export class ToiletSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly duplicates: DuplicateDetectorService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly urls: ImageUrlService,
    private readonly cleanup: StorageCleanupService,
    private readonly toilets: ToiletsService,
    private readonly users: UsersService,
  ) {}

  // ─────────────────────────── Mapping ───────────────────────────

  private async signImages(rows: { images: SuggestionRow['images'] }[]) {
    return this.urls.sign(rows.flatMap((r) => r.images));
  }

  private base(s: SuggestionRow, signed: Map<string, ImageAccess>) {
    const images = s.images.map((i) => ({ ...(signed.get(i.id) ?? { id: i.id, url: null, expiresAt: null }), isCover: i.isCover }));
    const hours = hoursFromJson(s.openingHours);
    return {
      id: s.id,
      status: s.status,
      name: s.name,
      nameKm: s.nameKm,
      description: s.description,
      address: s.address,
      province: s.province,
      district: s.district,
      sangkat: s.sangkat,
      latitude: s.latitude,
      longitude: s.longitude,
      accessType: s.accessType,
      priceKhr: s.priceKhr,
      facilities: {
        hasWater: s.hasWater,
        hasSoap: s.hasSoap,
        wheelchairAccessible: s.wheelchairAccessible,
        babyChanging: s.babyChanging,
        hasToiletPaper: s.hasToiletPaper,
      },
      openingHours: hours.map(toOutput),
      openingHoursKnown: hours.length > 0,
      notes: s.notes,
      images,
      coverImage: images.find((i) => i.isCover) ?? images[0] ?? null,
      feedback: { reviewedAt: s.reviewedAt, rejectionReason: s.rejectionReason, reviewNote: s.reviewNote },
      /** Only set once APPROVED; links to the public WC page. */
      publishedToiletId: s.status === SuggestionStatus.APPROVED ? s.publishedToiletId : null,
      resubmittedFromId: s.resubmittedFromId,
      resubmissionId: s.resubmission?.id ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  // ─────────────────────────── Contributor ───────────────────────────

  async create(user: AuthUser, dto: CreateSuggestionDto) {
    const access = normalizeAccess(dto.accessType ?? AccessType.UNKNOWN, dto.priceKhr);
    const hours = parseOpeningHours(dto.openingHours);
    const imageIds = dto.imageIds ?? [];
    const retainedIds = dto.retainedImageIds ?? [];
    if (imageIds.length + retainedIds.length > MAX_IMAGES_PER_REQUEST) {
      throw new BadRequestException(`A submission can include at most ${MAX_IMAGES_PER_REQUEST} photos.`);
    }
    if (imageIds.some((id) => retainedIds.includes(id))) {
      throw new BadRequestException('An image cannot be in both imageIds and retainedImageIds.');
    }
    if (dto.coverImageId && ![...imageIds, ...retainedIds].includes(dto.coverImageId)) {
      throw new BadRequestException('coverImageId must be one of imageIds or retainedImageIds.');
    }

    let previousId: string | undefined;
    if (dto.resubmittedFromId) {
      const prev = await this.prisma.toiletSuggestion.findUnique({
        where: { id: dto.resubmittedFromId },
        select: { id: true, contributorId: true, status: true, resubmission: { select: { id: true } } },
      });
      if (!prev || prev.contributorId !== user.id) throw new NotFoundException('The suggestion to correct was not found.');
      if (prev.status !== SuggestionStatus.REJECTED) {
        throw new ConflictException('Only rejected suggestions can be corrected and submitted again.');
      }
      if (prev.resubmission) throw new ConflictException('This suggestion has already been corrected and resubmitted.');
      previousId = prev.id;
    } else if (retainedIds.length) {
      throw new BadRequestException('retainedImageIds can only be used together with resubmittedFromId.');
    }

    // Validate image ownership/type/expiry and duplicates before writing anything.
    const [uploads, retained] = await Promise.all([
      imageIds.length
        ? this.prisma.suggestionImage.findMany({
            where: { id: { in: imageIds }, uploaderId: user.id, suggestionId: null, removedAt: null, createdAt: { gte: uploadCutoff() } },
          })
        : [],
      retainedIds.length
        ? this.prisma.suggestionImage.findMany({ where: { id: { in: retainedIds }, suggestionId: previousId, removedAt: null } })
        : [],
    ]);
    if (uploads.length !== imageIds.length) {
      throw new BadRequestException(
        'One or more imageIds are invalid, expired, already used or were not uploaded by you. Upload them again with POST /uploads/suggestions.',
      );
    }
    if (retained.length !== retainedIds.length) {
      throw new BadRequestException('retainedImageIds must be photos of the rejected suggestion you are correcting.');
    }
    const hashes = [...uploads, ...retained].map((i) => i.sha256);
    if (new Set(hashes).size !== hashes.length) throw new BadRequestException('The same photo was included more than once.');

    const duplicates = await this.duplicates.find(dto.latitude, dto.longitude, dto.name, {
      excludeSuggestionIds: previousId ? [previousId] : [],
    });
    const f = facilityPatch(dto.facilities);
    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const s = await tx.toiletSuggestion.create({
        data: {
          contributorId: user.id,
          status: SuggestionStatus.PENDING, // never taken from the client
          name: dto.name,
          nameKm: dto.nameKm,
          description: dto.description ?? null,
          address: dto.address,
          province: dto.province ?? 'Phnom Penh',
          district: dto.district ?? null,
          sangkat: dto.sangkat ?? null,
          latitude: dto.latitude,
          longitude: dto.longitude,
          ...access,
          hasWater: f.hasWater ?? null,
          hasSoap: f.hasSoap ?? null,
          wheelchairAccessible: f.wheelchairAccessible ?? null,
          babyChanging: f.babyChanging ?? null,
          hasToiletPaper: f.hasToiletPaper ?? null,
          openingHours: hours.length ? (hours as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          notes: dto.notes ?? null,
          hasPotentialDuplicate: duplicates.length > 0,
          duplicateCandidates: duplicates.length ? (duplicates as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          resubmittedFromId: previousId,
        },
      });

      // Atomic attach: only the caller's still-unattached, unexpired uploads can be claimed.
      if (imageIds.length) {
        const res = await tx.suggestionImage.updateMany({
          where: { id: { in: imageIds }, uploaderId: user.id, suggestionId: null, removedAt: null, createdAt: { gte: uploadCutoff() } },
          data: { suggestionId: s.id, attachedAt: now },
        });
        if (res.count !== imageIds.length) {
          throw new ConflictException('One or more photos were attached to another submission at the same time. Please retry.');
        }
      }
      // Re-used photos of the rejected suggestion are referenced by new rows; the original rows keep the history.
      const copyOf = new Map<string, string>();
      for (const oldId of retainedIds) {
        const o = retained.find((r) => r.id === oldId)!;
        const copy = await tx.suggestionImage.create({
          data: {
            suggestionId: s.id,
            uploaderId: user.id,
            bucket: o.bucket,
            objectPath: o.objectPath,
            mimeType: o.mimeType,
            sizeBytes: o.sizeBytes,
            width: o.width,
            height: o.height,
            sha256: o.sha256,
            attachedAt: now,
          },
        });
        copyOf.set(oldId, copy.id);
      }
      const ordered = [...imageIds, ...retainedIds.map((id) => copyOf.get(id)!)];
      const cover = dto.coverImageId ? (copyOf.get(dto.coverImageId) ?? dto.coverImageId) : ordered[0];
      for (let i = 0; i < ordered.length; i++) {
        await tx.suggestionImage.update({ where: { id: ordered[i] }, data: { sortOrder: i, isCover: ordered[i] === cover } });
      }

      await this.notifications.notifyAdmins(NotificationTemplates.suggestionSubmitted(s.id, s.name), tx, user.id);
      await this.audit.log(
        {
          actorId: user.id,
          action: previousId ? 'suggestion.resubmitted' : 'suggestion.submitted',
          entityType: 'ToiletSuggestion',
          entityId: s.id,
          metadata: { resubmittedFromId: previousId ?? null, photos: ordered.length, possibleDuplicates: duplicates.length },
        },
        tx,
      );
      return s;
    });
    return this.getMine(user, created.id);
  }

  async listMine(user: AuthUser, q: MySuggestionQueryDto) {
    const where: Prisma.ToiletSuggestionWhereInput = { contributorId: user.id, ...(q.status ? { status: q.status } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.toiletSuggestion.findMany({ where, include: WITH_IMAGES, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...skipTake(q) }),
      this.prisma.toiletSuggestion.count({ where }),
    ]);
    const signed = await this.signImages(rows);
    return PaginatedResult.of(rows.map((r) => this.base(r, signed)), total, q.page, q.limit);
  }

  /** Contributors can only read their own submissions (404 for anyone else's). */
  async getMine(user: AuthUser, id: string) {
    const row = await this.prisma.toiletSuggestion.findFirst({ where: { id, contributorId: user.id }, include: WITH_IMAGES });
    if (!row) throw new NotFoundException('Submission not found.');
    const signed = await this.signImages([row]);
    return { ...this.base(row, signed), history: await this.history(row) };
  }

  /** Earlier rejected versions of a corrected submission (oldest first). */
  private async history(row: { resubmittedFromId: string | null }) {
    const chain: { id: string; status: SuggestionStatus; name: string; rejectionReason: string | null; reviewNote: string | null; reviewedAt: Date | null; createdAt: Date }[] = [];
    let prevId = row.resubmittedFromId;
    for (let i = 0; prevId && i < 20; i++) {
      const prev = await this.prisma.toiletSuggestion.findUnique({
        where: { id: prevId },
        select: { id: true, status: true, name: true, rejectionReason: true, reviewNote: true, reviewedAt: true, createdAt: true, resubmittedFromId: true },
      });
      if (!prev) break;
      const { resubmittedFromId, ...rest } = prev;
      chain.unshift(rest);
      prevId = resubmittedFromId;
    }
    return chain;
  }

  // ─────────────────────────── Administrator ───────────────────────────

  async adminList(q: AdminSuggestionQueryDto) {
    const and: Prisma.ToiletSuggestionWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.district) and.push({ district: { equals: q.district, mode: 'insensitive' } });
    if (q.hasPotentialDuplicate !== undefined) and.push({ hasPotentialDuplicate: q.hasPotentialDuplicate });
    if (q.contributorId) and.push({ contributorId: q.contributorId });
    if (q.q) {
      const c = { contains: q.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { name: c },
          { nameKm: c },
          { address: c },
          { district: c },
          { sangkat: c },
          { contributor: { fullName: c } },
          { contributor: { email: c } },
        ],
      });
    }
    const where = { AND: and };
    const include = {
      ...WITH_IMAGES,
      contributor: { select: { id: true, fullName: true, email: true, avatarPath: true } },
    } satisfies Prisma.ToiletSuggestionInclude;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.toiletSuggestion.findMany({
        where,
        include,
        orderBy: [{ createdAt: q.sort === 'oldest' ? 'asc' : 'desc' }, { id: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.toiletSuggestion.count({ where }),
    ]);
    const signed = await this.signImages(rows);
    const avatarRefs = rows
      .map((r) => this.users.avatarRef(r.contributor.id, r.contributor.avatarPath))
      .filter((x): x is NonNullable<typeof x> => !!x);
    const avatars = await this.urls.sign(avatarRefs);
    const items = rows.map((r) => {
      const b = this.base(r, signed);
      return {
        ...b,
        imageCount: b.images.length,
        hasPotentialDuplicate: r.hasPotentialDuplicate,
        contributor: {
          id: r.contributor.id,
          fullName: r.contributor.fullName,
          email: r.contributor.email,
          avatar: avatars.get(`avatar:${r.contributor.id}`) ?? null,
        },
      };
    });
    return PaginatedResult.of(items, total, q.page, q.limit);
  }

  async adminGet(id: string) {
    const row = await this.prisma.toiletSuggestion.findUnique({
      where: { id },
      include: {
        images: { orderBy: IMAGES_ORDER },
        resubmission: { select: { id: true, status: true } },
        contributor: { select: { id: true, fullName: true, email: true, phone: true, avatarPath: true, createdAt: true, role: true } },
        reviewedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!row) throw new NotFoundException('Submission not found.');
    const visible = { ...row, images: row.images.filter((i) => !i.removedAt) };
    const signed = await this.signImages([visible]);
    const [stats, liveDuplicates, avatar, history] = await Promise.all([
      this.prisma.toiletSuggestion.groupBy({
        by: ['status'],
        where: { contributorId: row.contributorId },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      row.status === SuggestionStatus.PENDING
        ? this.duplicates.find(row.latitude, row.longitude, row.name, { excludeSuggestionIds: [row.id] })
        : Promise.resolve(null),
      this.urls.signOne(this.users.avatarRef(row.contributor.id, row.contributor.avatarPath)),
      this.history(row),
    ]);
    const { avatarPath: _a, ...contributor } = row.contributor;
    return {
      ...this.base(visible, signed),
      contributor: {
        ...contributor,
        avatar,
        submissions: Object.fromEntries(stats.map((st) => [st.status, st._count._all])),
      },
      hasPotentialDuplicate: row.hasPotentialDuplicate,
      /** Candidates recorded at submission time. */
      duplicateCandidatesAtSubmission: row.duplicateCandidates ?? [],
      /** Candidates recalculated now (pending submissions only). */
      duplicateCandidates: liveDuplicates ?? row.duplicateCandidates ?? [],
      removedImages: row.images
        .filter((i) => i.removedAt)
        .map((i) => ({ id: i.id, removedAt: i.removedAt, removedReason: i.removedReason })),
      reviewedBy: row.reviewedBy,
      reviewCorrections: row.reviewCorrections,
      publishedToiletId: row.publishedToiletId,
      history,
    };
  }

  async review(admin: AuthUser, id: string, dto: ReviewSuggestionDto) {
    return dto.status === SuggestionStatus.APPROVED ? this.approve(admin, id, dto) : this.reject(admin, id, dto);
  }

  private conflict(s: { status: SuggestionStatus; publishedToiletId: string | null; reviewedAt: Date | null }) {
    return new ConflictException({
      message:
        s.status === SuggestionStatus.APPROVED
          ? 'This submission has already been approved.'
          : 'This submission has already been rejected.',
      details: { status: s.status, publishedToiletId: s.publishedToiletId, reviewedAt: s.reviewedAt },
    });
  }

  /**
   * Approval: validates the final data, then in ONE transaction locks the suggestion row
   * (SELECT … FOR UPDATE), re-checks it is still PENDING, creates the verified Toilet with
   * facilities, opening hours and photo links, marks the suggestion APPROVED with the unique
   * publishedToiletId, notifies the contributor and writes the audit log. Concurrent or repeated
   * approvals wait for the lock and then receive 409 Conflict, so duplicate toilets cannot be created.
   *
   * Photos are NOT copied in storage: the published ToiletImage rows reference the same private
   * objects, and public signed URLs are only issued once the database says the WC is public.
   * A failed transaction therefore never exposes pending images.
   */
  private async approve(admin: AuthUser, id: string, dto: ReviewSuggestionDto) {
    const s = await this.prisma.toiletSuggestion.findUnique({
      where: { id },
      include: { images: { where: { removedAt: null }, orderBy: IMAGES_ORDER } },
    });
    if (!s) throw new NotFoundException('Submission not found.');
    if (s.contributorId === admin.id) throw new ForbiddenException('You cannot review your own submission.');
    if (s.status !== SuggestionStatus.PENDING) throw this.conflict(s);

    const c = dto.corrections ?? {};
    for (const k of ['name', 'address', 'latitude', 'longitude', 'province'] as const) {
      if ((c as Record<string, unknown>)[k] === null) throw new BadRequestException(`corrections.${k} cannot be null.`);
    }
    // Corrections override the submitted values; `null` clears optional fields.
    const opt = <T>(corrected: T | null | undefined, original: T | null): T | null =>
      corrected !== undefined ? (corrected ?? null) : original;
    const final = {
      name: c.name ?? s.name,
      nameKm: opt(c.nameKm, s.nameKm),
      description: opt(c.description, s.description),
      address: c.address ?? s.address,
      province: c.province ?? s.province,
      district: opt(c.district, s.district),
      sangkat: opt(c.sangkat, s.sangkat),
      latitude: c.latitude ?? s.latitude,
      longitude: c.longitude ?? s.longitude,
      notes: opt(c.notes, s.notes),
    };
    const accessChanged = c.accessType !== undefined && c.accessType !== s.accessType;
    const access = normalizeAccess(
      c.accessType ?? s.accessType,
      c.priceKhr !== undefined ? c.priceKhr : accessChanged ? undefined : s.priceKhr,
    );
    const hours = c.openingHours !== undefined ? parseOpeningHours(c.openingHours) : hoursFromJson(s.openingHours);
    const facilities = {
      hasWater: s.hasWater,
      hasSoap: s.hasSoap,
      wheelchairAccessible: s.wheelchairAccessible,
      babyChanging: s.babyChanging,
      hasToiletPaper: s.hasToiletPaper,
      hasHandDryer: null,
      isGenderNeutral: null,
      ...facilityPatch(c.facilities),
    };

    const publish = dto.publishImageIds ? s.images.filter((i) => dto.publishImageIds!.includes(i.id)) : s.images;
    if (dto.publishImageIds && publish.length !== dto.publishImageIds.length) {
      throw new BadRequestException('publishImageIds must reference photos of this submission.');
    }
    const coverSource = dto.coverImageId
      ? publish.find((i) => i.id === dto.coverImageId)
      : (publish.find((i) => i.isCover) ?? publish[0]);
    if (dto.coverImageId && !coverSource) throw new BadRequestException('coverImageId must be one of the published photos.');

    const now = new Date();
    const toiletId = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ status: SuggestionStatus }[]>`
          SELECT "status" FROM "ToiletSuggestion" WHERE "id" = ${id}::uuid FOR UPDATE`;
        if (locked.length === 0) throw new NotFoundException('Submission not found.');
        if (locked[0].status !== SuggestionStatus.PENDING) {
          throw this.conflict(await tx.toiletSuggestion.findUniqueOrThrow({ where: { id } }));
        }

        const toilet = await tx.toilet.create({
          data: {
            ...final,
            ...access,
            status: c.status ?? ToiletStatus.OPEN,
            isVerified: true,
            verifiedAt: now,
            lastVerifiedAt: now,
            verifiedById: admin.id,
            createdById: admin.id,
            facility: { create: facilities },
            openingHours: { create: hours },
          },
        });

        let coverId: string | null = null;
        for (let i = 0; i < publish.length; i++) {
          const img = publish[i];
          const ti = await tx.toiletImage.create({
            data: {
              toiletId: toilet.id,
              bucket: img.bucket,
              objectPath: img.objectPath,
              mimeType: img.mimeType,
              sizeBytes: img.sizeBytes,
              width: img.width,
              height: img.height,
              sha256: img.sha256,
              sortOrder: i,
              uploadedById: s.contributorId,
              sourceSuggestionImageId: img.id,
            },
          });
          if (img.id === coverSource?.id) coverId = ti.id;
        }
        if (coverId) await tx.toilet.update({ where: { id: toilet.id }, data: { coverImageId: coverId } });

        await tx.toiletSuggestion.update({
          where: { id },
          data: {
            status: SuggestionStatus.APPROVED,
            publishedToiletId: toilet.id,
            reviewedById: admin.id,
            reviewedAt: now,
            reviewNote: dto.reviewNote ?? null,
            reviewCorrections: dto.corrections ? (dto.corrections as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          },
        });
        await this.notifications.notify(s.contributorId, NotificationTemplates.suggestionApproved(id, toilet.id, toilet.name), tx);
        await this.audit.log(
          {
            actorId: admin.id,
            action: 'suggestion.approved',
            entityType: 'ToiletSuggestion',
            entityId: id,
            metadata: { toiletId: toilet.id, correctedFields: Object.keys(c), publishedImages: publish.length },
          },
          tx,
        );
        return toilet.id;
      },
      { timeout: 20_000, maxWait: 10_000 },
    );

    return { suggestion: await this.adminGet(id), toilet: await this.toilets.getForManagement(toiletId) };
  }

  /** Rejection: PENDING → REJECTED only, with a reason. Location and photos stay private. */
  private async reject(admin: AuthUser, id: string, dto: ReviewSuggestionDto) {
    if (!dto.rejectionReason) throw new BadRequestException('rejectionReason is required when rejecting.');
    if (dto.corrections || dto.publishImageIds || dto.coverImageId) {
      throw new BadRequestException('corrections, publishImageIds and coverImageId only apply to approval.');
    }
    const s = await this.prisma.toiletSuggestion.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Submission not found.');
    if (s.contributorId === admin.id) throw new ForbiddenException('You cannot review your own submission.');
    if (s.status !== SuggestionStatus.PENDING) throw this.conflict(s);

    await this.prisma.$transaction(async (tx) => {
      const res = await tx.toiletSuggestion.updateMany({
        where: { id, status: SuggestionStatus.PENDING },
        data: {
          status: SuggestionStatus.REJECTED,
          rejectionReason: dto.rejectionReason,
          reviewNote: dto.reviewNote ?? null,
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
      });
      if (res.count !== 1) throw this.conflict(await tx.toiletSuggestion.findUniqueOrThrow({ where: { id } }));
      await this.notifications.notify(
        s.contributorId,
        NotificationTemplates.suggestionRejected(id, s.name, dto.rejectionReason!),
        tx,
      );
      await this.audit.log(
        { actorId: admin.id, action: 'suggestion.rejected', entityType: 'ToiletSuggestion', entityId: id, metadata: { reason: dto.rejectionReason } },
        tx,
      );
    });
    return { suggestion: await this.adminGet(id), toilet: null };
  }

  /** Moderation: hides an inappropriate submission photo and deletes the object when nothing else uses it. */
  async adminRemoveImage(admin: AuthUser, suggestionId: string, imageId: string, reason?: string) {
    const img = await this.prisma.suggestionImage.findFirst({ where: { id: imageId, suggestionId, removedAt: null } });
    if (!img) throw new NotFoundException('Photo not found for this submission.');
    await this.prisma.$transaction(async (tx) => {
      await tx.suggestionImage.update({
        where: { id: imageId },
        data: { removedAt: new Date(), removedReason: reason ?? null, isCover: false },
      });
      await this.audit.log(
        { actorId: admin.id, action: 'suggestion.image_removed', entityType: 'ToiletSuggestion', entityId: suggestionId, metadata: { imageId, reason } },
        tx,
      );
    });
    await this.cleanup.removeIfUnreferenced(img.bucket, img.objectPath);
    return this.adminGet(suggestionId);
  }
}
