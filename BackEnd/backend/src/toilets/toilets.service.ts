import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessType, Prisma, ReportStatus, ToiletStatus } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PaginatedResult, skipTake } from '../common/dto/pagination.dto';
import type { AuthUser } from '../common/types/auth-user';
import { boundingBox, distanceInfo, haversineMeters } from '../common/utils/geo';
import { isOpenAt, PHNOM_PENH_TZ, phnomPenhNow, toOutput } from '../common/utils/opening-hours';
import { PrismaService } from '../prisma/prisma.service';
import { ImageAccess, ImageUrlService } from '../storage/image-url.service';
import { AdminCreateToiletDto, AdminToiletQueryDto, AdminUpdateToiletDto, ManagerUpdateToiletDto } from './dto/admin-toilet.dto';
import { MAX_SEARCH_RADIUS_M, NearbyQueryDto, ToiletFilterDto, ToiletSearchQueryDto, ToiletSort } from './dto/toilet-query.dto';
import type { AdminToiletResponse, ToiletDetailResponse, ToiletSummaryResponse } from './dto/toilet.response';
import { buildPublicToiletWhere, PUBLIC_TOILET_WHERE, textSearch } from './toilet-query.builder';
import { emptyFacilities, FACILITY_KEYS, facilityPatch, normalizeAccess, parseOpeningHours } from './toilet-rules';

const HOURS_ORDER = [{ dayOfWeek: 'asc' as const }, { openMinute: 'asc' as const }];
const IMAGE_ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

export const TOILET_LIST_INCLUDE = {
  facility: true,
  openingHours: { orderBy: HOURS_ORDER },
  coverImage: true,
  images: { orderBy: IMAGE_ORDER, take: 1 },
} satisfies Prisma.ToiletInclude;

export const TOILET_DETAIL_INCLUDE = {
  facility: true,
  openingHours: { orderBy: HOURS_ORDER },
  coverImage: true,
  images: { orderBy: IMAGE_ORDER },
} satisfies Prisma.ToiletInclude;

type ListRow = Prisma.ToiletGetPayload<{ include: typeof TOILET_LIST_INCLUDE }>;
type DetailRow = Prisma.ToiletGetPayload<{ include: typeof TOILET_DETAIL_INCLUDE }>;

/** Safety cap for distance queries (candidates inside the bounding box). */
const MAX_DISTANCE_CANDIDATES = 5000;
const REQUIRED_FIELDS = ['name', 'address', 'latitude', 'longitude', 'province'] as const;

@Injectable()
export class ToiletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly urls: ImageUrlService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────── Mapping ───────────────────────────

  private coverOf(row: ListRow | DetailRow) {
    return row.coverImage ?? row.images[0] ?? null;
  }

  /** CLOSED / UNDER_MAINTENANCE → false; OPEN → evaluated against the schedule (null when unknown). */
  private computeOpenNow(
    row: { status: ToiletStatus; openingHours: { dayOfWeek: number; openMinute: number; closeMinute: number }[] },
    now = phnomPenhNow(),
  ): boolean | null {
    if (row.status !== ToiletStatus.OPEN) return false;
    return isOpenAt(row.openingHours, now);
  }

  private summary(row: ListRow | DetailRow, signed: Map<string, ImageAccess>, now: ReturnType<typeof phnomPenhNow>, distanceMeters?: number): ToiletSummaryResponse {
    const cover = this.coverOf(row);
    const facilities = { ...emptyFacilities() };
    if (row.facility) for (const k of FACILITY_KEYS) facilities[k] = row.facility[k];
    return {
      id: row.id,
      name: row.name,
      nameKm: row.nameKm,
      address: row.address,
      province: row.province,
      district: row.district,
      sangkat: row.sangkat,
      latitude: row.latitude,
      longitude: row.longitude,
      accessType: row.accessType,
      priceKhr: row.priceKhr,
      status: row.status,
      facilities,
      averageRating: row.averageRating,
      cleanlinessRating: row.cleanlinessRating,
      reviewCount: row.reviewCount,
      isVerified: row.isVerified,
      lastVerifiedAt: row.lastVerifiedAt,
      openNow: this.computeOpenNow(row, now),
      openingHoursKnown: row.openingHours.length > 0,
      coverImage: cover ? (signed.get(cover.id) ?? null) : null,
      ...(distanceMeters !== undefined ? { distance: distanceInfo(distanceMeters) } : {}),
      isSampleData: row.isSampleData,
    };
  }

  /** Maps rows to public summaries, signing all cover images in one batch. */
  async toSummaries(rows: ListRow[], distances?: Map<string, number>): Promise<ToiletSummaryResponse[]> {
    const covers = rows.map((r) => this.coverOf(r)).filter((c): c is NonNullable<typeof c> => !!c);
    const signed = await this.urls.sign(covers);
    const now = phnomPenhNow();
    return rows.map((r) => this.summary(r, signed, now, distances?.get(r.id)));
  }

  private async toDetail(row: DetailRow, distanceMeters?: number): Promise<ToiletDetailResponse> {
    const refs = [...row.images, ...(row.coverImage ? [row.coverImage] : [])];
    const signed = await this.urls.sign(refs);
    return {
      ...this.summary(row, signed, phnomPenhNow(), distanceMeters),
      description: row.description,
      descriptionKm: row.descriptionKm,
      notes: row.notes,
      openingHours: row.openingHours.map(toOutput),
      timezone: PHNOM_PENH_TZ,
      images: row.images.map((i) => signed.get(i.id)).filter((x): x is ImageAccess => !!x),
      verifiedAt: row.verifiedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ─────────────────────────── Public discovery ───────────────────────────

  private orderBy(sort: ToiletSort | undefined, order: 'asc' | 'desc' | undefined): Prisma.ToiletOrderByWithRelationInput[] {
    const dir = order;
    switch (sort) {
      case 'name':
        return [{ name: dir ?? 'asc' }, { id: 'asc' }];
      case 'newest':
        return [{ createdAt: dir ?? 'desc' }, { id: 'asc' }];
      case 'price':
        return [{ priceKhr: { sort: dir ?? 'asc', nulls: 'last' } }, { id: 'asc' }];
      case 'cleanliness':
        return [{ cleanlinessRating: { sort: dir ?? 'desc', nulls: 'last' } }, { reviewCount: 'desc' }, { id: 'asc' }];
      case 'rating':
      default:
        return [{ averageRating: { sort: dir ?? 'desc', nulls: 'last' } }, { reviewCount: 'desc' }, { id: 'asc' }];
    }
  }

  /**
   * Distance pipeline: index-friendly bounding-box pre-filter in SQL, exact Haversine distance in
   * the service, then radius filter, sort and pagination. Only ids/coordinates are loaded for
   * candidates; full rows are loaded for the requested page only.
   */
  private async distancePage(
    where: Prisma.ToiletWhereInput,
    lat: number,
    lng: number,
    radius: number,
    page: number,
    limit: number,
    sort: ToiletSort,
    order?: 'asc' | 'desc',
  ) {
    const box = boundingBox(lat, lng, radius);
    const candidates = await this.prisma.toilet.findMany({
      where: {
        AND: [where, { latitude: { gte: box.minLat, lte: box.maxLat }, longitude: { gte: box.minLng, lte: box.maxLng } }],
      },
      select: { id: true, latitude: true, longitude: true, averageRating: true, cleanlinessRating: true, name: true, priceKhr: true, createdAt: true },
      take: MAX_DISTANCE_CANDIDATES,
    });
    const within = candidates
      .map((c) => ({ ...c, d: haversineMeters(lat, lng, c.latitude, c.longitude) }))
      .filter((c) => c.d <= radius);

    const sign = (o: 'asc' | 'desc') => (o === 'asc' ? 1 : -1);
    const nullsLast = (a: number | null, b: number | null, o: 'asc' | 'desc') =>
      a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : (a - b) * sign(o);
    within.sort((a, b) => {
      let r = 0;
      if (sort === 'rating') r = nullsLast(a.averageRating, b.averageRating, order ?? 'desc');
      else if (sort === 'cleanliness') r = nullsLast(a.cleanlinessRating, b.cleanlinessRating, order ?? 'desc');
      else if (sort === 'name') r = a.name.localeCompare(b.name) * sign(order ?? 'asc');
      else if (sort === 'price') r = nullsLast(a.priceKhr, b.priceKhr, order ?? 'asc');
      else if (sort === 'newest') r = (a.createdAt.getTime() - b.createdAt.getTime()) * sign(order ?? 'desc');
      return r || (a.d - b.d) * sign(sort === 'distance' ? (order ?? 'asc') : 'asc') || a.id.localeCompare(b.id);
    });

    const pageItems = within.slice((page - 1) * limit, page * limit);
    const rows = await this.prisma.toilet.findMany({
      where: { id: { in: pageItems.map((p) => p.id) } },
      include: TOILET_LIST_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = pageItems.map((p) => byId.get(p.id)).filter((r): r is ListRow => !!r);
    const distances = new Map(pageItems.map((p) => [p.id, p.d]));
    return PaginatedResult.of(await this.toSummaries(ordered, distances), within.length, page, limit);
  }

  async search(q: ToiletSearchQueryDto) {
    const where = buildPublicToiletWhere(q);
    const hasPoint = q.lat !== undefined && q.lng !== undefined;
    if (q.sort === 'distance' && !hasPoint) {
      throw new BadRequestException('sort=distance requires lat and lng.');
    }
    if (q.radius !== undefined && !hasPoint) throw new BadRequestException('radius requires lat and lng.');
    if (hasPoint) {
      return this.distancePage(where, q.lat!, q.lng!, q.radius ?? MAX_SEARCH_RADIUS_M, q.page, q.limit, q.sort ?? 'distance', q.order);
    }
    const [rows, total] = await Promise.all([
      this.prisma.toilet.findMany({ where, include: TOILET_LIST_INCLUDE, orderBy: this.orderBy(q.sort, q.order), ...skipTake(q) }),
      this.prisma.toilet.count({ where }),
    ]);
    return PaginatedResult.of(await this.toSummaries(rows), total, q.page, q.limit);
  }

  /** Nearby verified WCs sorted by approximate straight-line distance. Coordinates are not stored. */
  async nearby(q: NearbyQueryDto) {
    return this.distancePage(buildPublicToiletWhere(q), q.lat, q.lng, q.radius, q.page, q.limit, 'distance');
  }

  async findPublic(id: string, viewer: AuthUser | null, point?: { lat?: number; lng?: number }) {
    const row = await this.prisma.toilet.findFirst({ where: { id, ...PUBLIC_TOILET_WHERE }, include: TOILET_DETAIL_INCLUDE });
    if (!row) throw new NotFoundException('WC not found.');
    const d =
      point?.lat !== undefined && point?.lng !== undefined
        ? haversineMeters(point.lat, point.lng, row.latitude, row.longitude)
        : undefined;
    const detail = await this.toDetail(row, d);
    if (viewer) {
      const fav = await this.prisma.favorite.findUnique({
        where: { userId_toiletId: { userId: viewer.id, toiletId: id } },
        select: { id: true },
      });
      detail.isFavorite = !!fav;
    }
    return detail;
  }

  async publicImages(id: string) {
    const row = await this.prisma.toilet.findFirst({
      where: { id, ...PUBLIC_TOILET_WHERE },
      select: { coverImageId: true, images: { orderBy: IMAGE_ORDER } },
    });
    if (!row) throw new NotFoundException('WC not found.');
    const signed = await this.urls.sign(row.images);
    return row.images
      .map((i) => signed.get(i.id))
      .filter((x): x is ImageAccess => !!x)
      .map((img) => ({ ...img, isCover: img.id === (row.coverImageId ?? row.images[0]?.id) }));
  }

  async assertPublic(id: string) {
    const row = await this.prisma.toilet.findFirst({ where: { id, ...PUBLIC_TOILET_WHERE }, select: { id: true, name: true } });
    if (!row) throw new NotFoundException('WC not found.');
    return row;
  }

  /** Districts (Khan) with verified WCs, for filter dropdowns. */
  async districts() {
    const rows = await this.prisma.toilet.groupBy({
      by: ['province', 'district'],
      where: { ...PUBLIC_TOILET_WHERE, district: { not: null } },
      _count: { _all: true },
      orderBy: [{ province: 'asc' }, { district: 'asc' }],
    });
    return rows.map((r) => ({ province: r.province, district: r.district, count: r._count._all }));
  }

  // ─────────────────────────── Admin / manager ───────────────────────────

  async adminList(q: AdminToiletQueryDto) {
    const and: Prisma.ToiletWhereInput[] = [];
    if (q.archived === 'exclude') and.push({ archivedAt: null });
    if (q.archived === 'only') and.push({ archivedAt: { not: null } });
    if (q.q) and.push(textSearch(q.q));
    if (q.status) and.push({ status: q.status });
    if (q.accessType) and.push({ accessType: q.accessType });
    if (q.district) and.push({ district: { equals: q.district, mode: 'insensitive' } });
    if (q.isVerified !== undefined) and.push({ isVerified: q.isVerified });
    if (q.managerId) and.push({ managerAssignments: { some: { managerId: q.managerId } } });
    const where: Prisma.ToiletWhereInput = { AND: and };
    const orderBy: Prisma.ToiletOrderByWithRelationInput[] =
      q.sort === 'name'
        ? [{ name: 'asc' }]
        : q.sort === 'rating'
          ? [{ averageRating: { sort: 'desc', nulls: 'last' } }]
          : q.sort === 'updated'
            ? [{ updatedAt: 'desc' }]
            : [{ createdAt: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.toilet.findMany({
        where,
        include: { ...TOILET_LIST_INCLUDE, _count: { select: { managerAssignments: true, reports: { where: { status: { in: [ReportStatus.PENDING, ReportStatus.IN_PROGRESS] } } } } } },
        orderBy: [...orderBy, { id: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.toilet.count({ where }),
    ]);
    const summaries = await this.toSummaries(rows);
    const items = summaries.map((s, i) => ({
      ...s,
      archivedAt: rows[i].archivedAt,
      archiveReason: rows[i].archiveReason,
      managerCount: rows[i]._count.managerAssignments,
      openReports: rows[i]._count.reports,
      createdAt: rows[i].createdAt,
      updatedAt: rows[i].updatedAt,
    }));
    return PaginatedResult.of(items, total, q.page, q.limit);
  }

  /** Full record for admins (any state) and assigned managers. Authorisation is done by the caller. */
  async getForManagement(id: string): Promise<AdminToiletResponse> {
    const row = await this.prisma.toilet.findUnique({
      where: { id },
      include: {
        ...TOILET_DETAIL_INCLUDE,
        sourceSuggestion: { select: { id: true } },
        managerAssignments: { include: { manager: { select: { id: true, fullName: true, email: true } } } },
        _count: { select: { reports: { where: { status: { in: [ReportStatus.PENDING, ReportStatus.IN_PROGRESS] } } } } },
      },
    });
    if (!row) throw new NotFoundException('WC not found.');
    const detail = await this.toDetail(row);
    return {
      ...detail,
      archivedAt: row.archivedAt,
      archiveReason: row.archiveReason,
      verifiedById: row.verifiedById,
      createdById: row.createdById,
      sourceSuggestionId: row.sourceSuggestion?.id ?? null,
      managers: row.managerAssignments.map((a) => ({
        assignmentId: a.id,
        managerId: a.manager.id,
        fullName: a.manager.fullName,
        email: a.manager.email,
      })),
      openReports: row._count.reports,
    };
  }

  /** Only administrators reach this (route guarded by @Roles(ADMIN)). Created WCs are verified. */
  async adminCreate(admin: AuthUser, dto: AdminCreateToiletDto) {
    const access = normalizeAccess(dto.accessType ?? AccessType.UNKNOWN, dto.priceKhr);
    const hours = parseOpeningHours(dto.openingHours);
    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      const t = await tx.toilet.create({
        data: {
          name: dto.name,
          nameKm: dto.nameKm,
          description: dto.description ?? null,
          descriptionKm: dto.descriptionKm,
          address: dto.address,
          province: dto.province ?? 'Phnom Penh',
          district: dto.district ?? null,
          sangkat: dto.sangkat ?? null,
          latitude: dto.latitude,
          longitude: dto.longitude,
          ...access,
          status: dto.status ?? ToiletStatus.OPEN,
          notes: dto.notes ?? null,
          isVerified: true,
          verifiedAt: now,
          lastVerifiedAt: now,
          verifiedById: admin.id,
          createdById: admin.id,
          facility: { create: { ...emptyFacilities(), ...facilityPatch(dto.facilities) } },
          openingHours: { create: hours },
        },
        select: { id: true },
      });
      await this.audit.log({ actorId: admin.id, action: 'toilet.created', entityType: 'Toilet', entityId: t.id, metadata: { name: dto.name } }, tx);
      return t;
    });
    return this.getForManagement(created.id);
  }

  /**
   * Shared update for administrators (AdminUpdateToiletDto) and assigned managers
   * (ManagerUpdateToiletDto — a strict subset). Authorisation is enforced by the caller.
   */
  async update(actor: AuthUser, id: string, dto: AdminUpdateToiletDto | ManagerUpdateToiletDto) {
    const existing = await this.prisma.toilet.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('WC not found.');
    const d = dto as AdminUpdateToiletDto;
    for (const k of REQUIRED_FIELDS) {
      if ((d as Record<string, unknown>)[k] === null) throw new BadRequestException(`${k} cannot be null.`);
    }

    const accessChanged = d.accessType !== undefined && d.accessType !== existing.accessType;
    const priceInput = d.priceKhr !== undefined ? d.priceKhr : accessChanged ? undefined : existing.priceKhr;
    const access =
      d.accessType !== undefined || d.priceKhr !== undefined
        ? normalizeAccess(d.accessType ?? existing.accessType, priceInput)
        : undefined;
    const hours = d.openingHours !== undefined ? parseOpeningHours(d.openingHours) : undefined;

    const data: Prisma.ToiletUpdateInput = {};
    const simple = ['name', 'nameKm', 'description', 'descriptionKm', 'address', 'province', 'district', 'sangkat', 'latitude', 'longitude', 'status', 'notes'] as const;
    for (const k of simple) {
      const v = (d as Record<string, unknown>)[k];
      if (v !== undefined) (data as Record<string, unknown>)[k] = v;
    }
    if (access) Object.assign(data, access);
    const facility = facilityPatch(d.facilities);

    await this.prisma.$transaction(async (tx) => {
      await tx.toilet.update({ where: { id }, data });
      if (Object.keys(facility).length) {
        await tx.facility.upsert({
          where: { toiletId: id },
          create: { toiletId: id, ...emptyFacilities(), ...facility },
          update: facility,
        });
      }
      if (hours) {
        await tx.openingHour.deleteMany({ where: { toiletId: id } });
        if (hours.length) await tx.openingHour.createMany({ data: hours.map((h) => ({ ...h, toiletId: id })) });
      }
      await this.audit.log(
        { actorId: actor.id, action: 'toilet.updated', entityType: 'Toilet', entityId: id, metadata: { fields: Object.keys(dto), role: actor.role } },
        tx,
      );
    });
    return this.getForManagement(id);
  }

  async archive(admin: AuthUser, id: string, reason?: string) {
    const res = await this.prisma.toilet.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date(), archivedById: admin.id, archiveReason: reason ?? null },
    });
    if (res.count === 0) {
      const exists = await this.prisma.toilet.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundException('WC not found.');
      throw new ConflictException('This WC is already archived.');
    }
    await this.audit.log({ actorId: admin.id, action: 'toilet.archived', entityType: 'Toilet', entityId: id, metadata: { reason } });
    return this.getForManagement(id);
  }

  async restore(admin: AuthUser, id: string) {
    const res = await this.prisma.toilet.updateMany({
      where: { id, archivedAt: { not: null } },
      data: { archivedAt: null, archivedById: null, archiveReason: null },
    });
    if (res.count === 0) {
      const exists = await this.prisma.toilet.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundException('WC not found.');
      throw new ConflictException('This WC is not archived.');
    }
    await this.audit.log({ actorId: admin.id, action: 'toilet.restored', entityType: 'Toilet', entityId: id });
    return this.getForManagement(id);
  }

  /** Records an on-site re-verification (sets lastVerifiedAt). */
  async verify(admin: AuthUser, id: string) {
    const existing = await this.prisma.toilet.findUnique({ where: { id }, select: { verifiedAt: true } });
    if (!existing) throw new NotFoundException('WC not found.');
    const now = new Date();
    await this.prisma.toilet.update({
      where: { id },
      data: { isVerified: true, verifiedAt: existing.verifiedAt ?? now, lastVerifiedAt: now, verifiedById: admin.id },
    });
    await this.audit.log({ actorId: admin.id, action: 'toilet.verified', entityType: 'Toilet', entityId: id });
    return this.getForManagement(id);
  }

  /** Used by manager listing. */
  async listScoped(where: Prisma.ToiletWhereInput, q: { page: number; limit: number }, filters?: ToiletFilterDto) {
    const and: Prisma.ToiletWhereInput[] = [where];
    if (filters?.q) and.push(textSearch(filters.q));
    if (filters?.status) and.push({ status: filters.status });
    const w = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.toilet.findMany({ where: w, include: TOILET_LIST_INCLUDE, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...skipTake(q) }),
      this.prisma.toilet.count({ where: w }),
    ]);
    return PaginatedResult.of(await this.toSummaries(rows), total, q.page, q.limit);
  }
}
