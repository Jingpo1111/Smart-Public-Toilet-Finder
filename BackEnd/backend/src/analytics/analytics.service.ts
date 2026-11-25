import { Injectable } from '@nestjs/common';
import { AccessType, Prisma, ReportCategory, ReportStatus, SuggestionStatus, ToiletStatus, UserRole } from '../generated/prisma/client';
import type { AuthUser } from '../common/types/auth-user';
import { phnomPenhNow, PHNOM_PENH_TZ } from '../common/utils/opening-hours';
import { ManagerAccessService } from '../manager/manager-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImageUrlService } from '../storage/image-url.service';
import { PUBLIC_TOILET_WHERE } from '../toilets/toilet-query.builder';

const UNRESOLVED = [ReportStatus.PENDING, ReportStatus.IN_PROGRESS];
const round2 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100) / 100);

function countMap<K extends string>(keys: readonly K[], rows: { key: string | null; count: number }[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, rows.find((r) => r.key === k)?.count ?? 0])) as Record<K, number>;
}

/** All statistics are computed from the database at request time. No private user data is exposed publicly. */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ManagerAccessService,
    private readonly urls: ImageUrlService,
  ) {}

  /** Public, aggregate-only platform statistics (safe for the homepage). */
  async publicStats() {
    const [verified, free, paid, accessible, districts, reviews] = await this.prisma.$transaction([
      this.prisma.toilet.count({ where: PUBLIC_TOILET_WHERE }),
      this.prisma.toilet.count({ where: { ...PUBLIC_TOILET_WHERE, accessType: AccessType.FREE } }),
      this.prisma.toilet.count({ where: { ...PUBLIC_TOILET_WHERE, accessType: AccessType.PAID } }),
      this.prisma.toilet.count({ where: { ...PUBLIC_TOILET_WHERE, facility: { is: { wheelchairAccessible: true } } } }),
      this.prisma.toilet.groupBy({ by: ['district'], where: { ...PUBLIC_TOILET_WHERE, district: { not: null } }, orderBy: { district: 'asc' } }),
      this.prisma.review.count({ where: { isHidden: false, toilet: PUBLIC_TOILET_WHERE } }),
    ]);
    return {
      verifiedToilets: verified,
      freeToilets: free,
      paidToilets: paid,
      wheelchairAccessibleToilets: accessible,
      districtsCovered: districts.length,
      publicReviews: reviews,
    };
  }

  private async core() {
    const live = { archivedAt: null };
    const [
      verified,
      unverified,
      archived,
      usersByRole,
      suggestionsByStatus,
      accessByType,
      accessible,
      reviewAgg,
      unresolvedReports,
      reportsByStatus,
    ] = await this.prisma.$transaction([
      this.prisma.toilet.count({ where: PUBLIC_TOILET_WHERE }),
      this.prisma.toilet.count({ where: { ...live, isVerified: false } }),
      this.prisma.toilet.count({ where: { archivedAt: { not: null } } }),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true }, orderBy: { role: 'asc' } }),
      this.prisma.toiletSuggestion.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
      this.prisma.toilet.groupBy({ by: ['accessType'], where: PUBLIC_TOILET_WHERE, _count: { _all: true }, orderBy: { accessType: 'asc' } }),
      this.prisma.toilet.count({ where: { ...PUBLIC_TOILET_WHERE, facility: { is: { wheelchairAccessible: true } } } }),
      this.prisma.review.aggregate({ where: { isHidden: false }, _avg: { cleanlinessRating: true, rating: true }, _count: { _all: true } }),
      this.prisma.report.count({ where: { status: { in: UNRESOLVED } } }),
      this.prisma.report.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    ]);
    const c = (rows: { _count: unknown }[], key: string) =>
      rows.map((r) => ({ key: (r as Record<string, unknown>)[key] as string, count: (r._count as { _all: number })._all }));
    const users = countMap(Object.values(UserRole), c(usersByRole, 'role'));
    return {
      toilets: { verified, unverified, archived },
      users: { total: users.USER + users.MANAGER + users.ADMIN, byRole: users },
      suggestions: countMap(Object.values(SuggestionStatus), c(suggestionsByStatus, 'status')),
      accessTypes: countMap(Object.values(AccessType), c(accessByType, 'accessType')),
      wheelchairAccessibleToilets: accessible,
      reviews: {
        total: reviewAgg._count._all,
        averageRating: round2(reviewAgg._avg.rating),
        averageCleanliness: round2(reviewAgg._avg.cleanlinessRating),
      },
      reports: { unresolved: unresolvedReports, byStatus: countMap(Object.values(ReportStatus), c(reportsByStatus, 'status')) },
    };
  }

  async adminDashboard() {
    const [core, pending, recentReports] = await Promise.all([
      this.core(),
      this.prisma.toiletSuggestion.findMany({
        where: { status: SuggestionStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: {
          contributor: { select: { id: true, fullName: true } },
          images: { where: { removedAt: null }, orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }], take: 1 },
        },
      }),
      this.prisma.report.findMany({
        where: { status: { in: UNRESOLVED } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { toilet: { select: { id: true, name: true } } },
      }),
    ]);
    // Admins are authorised to see pending (private) photos.
    const signed = await this.urls.sign(pending.flatMap((p) => p.images));
    return {
      ...core,
      recentPendingSuggestions: pending.map((p) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        district: p.district,
        createdAt: p.createdAt,
        hasPotentialDuplicate: p.hasPotentialDuplicate,
        contributor: p.contributor,
        coverImage: p.images[0] ? (signed.get(p.images[0].id) ?? null) : null,
      })),
      recentUnresolvedReports: recentReports.map((r) => ({
        id: r.id,
        category: r.category,
        status: r.status,
        createdAt: r.createdAt,
        toilet: r.toilet,
      })),
    };
  }

  /** Monthly series in Asia/Phnom_Penh local months, including months with zero. */
  private async monthly(table: 'User' | 'ToiletSuggestion', months: number) {
    const n = months - 1;
    if (table === 'User') {
      return this.prisma.$queryRaw<{ month: string; count: number }[]>`
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', now() AT TIME ZONE ${PHNOM_PENH_TZ}) - make_interval(months => ${n}::int),
            date_trunc('month', now() AT TIME ZONE ${PHNOM_PENH_TZ}),
            interval '1 month') AS month
        )
        SELECT to_char(m.month, 'YYYY-MM') AS month, COUNT(u."id")::int AS count
        FROM months m
        LEFT JOIN "User" u
          ON date_trunc('month', (u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${PHNOM_PENH_TZ}) = m.month
        GROUP BY m.month ORDER BY m.month`;
    }
    return this.prisma.$queryRaw<{ month: string; total: number; pending: number; approved: number; rejected: number }[]>`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', now() AT TIME ZONE ${PHNOM_PENH_TZ}) - make_interval(months => ${n}::int),
          date_trunc('month', now() AT TIME ZONE ${PHNOM_PENH_TZ}),
          interval '1 month') AS month
      )
      SELECT to_char(m.month, 'YYYY-MM') AS month,
        COUNT(s."id")::int AS total,
        COUNT(s."id") FILTER (WHERE s."status" = 'PENDING')::int AS pending,
        COUNT(s."id") FILTER (WHERE s."status" = 'APPROVED')::int AS approved,
        COUNT(s."id") FILTER (WHERE s."status" = 'REJECTED')::int AS rejected
      FROM months m
      LEFT JOIN "ToiletSuggestion" s
        ON date_trunc('month', (s."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${PHNOM_PENH_TZ}) = m.month
      GROUP BY m.month ORDER BY m.month`;
  }

  async analytics(months = 12) {
    const [core, registrations, submissions, districts, categories, ratings] = await Promise.all([
      this.core(),
      this.monthly('User', months),
      this.monthly('ToiletSuggestion', months),
      this.prisma.toilet.groupBy({
        by: ['district'],
        where: { ...PUBLIC_TOILET_WHERE, province: { equals: 'Phnom Penh', mode: 'insensitive' } },
        _count: { _all: true },
        _avg: { cleanlinessRating: true },
        orderBy: { district: 'asc' },
      }),
      this.prisma.report.groupBy({ by: ['category'], _count: { _all: true }, orderBy: { category: 'asc' } }),
      this.prisma.review.groupBy({ by: ['rating'], where: { isHidden: false }, _count: { _all: true }, orderBy: { rating: 'asc' } }),
    ]);
    return {
      ...core,
      timezone: PHNOM_PENH_TZ,
      monthlyRegistrations: registrations,
      monthlySubmissions: submissions,
      phnomPenhDistricts: districts.map((d) => ({
        district: d.district ?? 'Unknown',
        verifiedToilets: d._count._all,
        averageCleanliness: round2(d._avg.cleanlinessRating),
      })),
      reportCategories: countMap(
        Object.values(ReportCategory),
        categories.map((r) => ({ key: r.category, count: r._count._all })),
      ),
      ratingDistribution: [1, 2, 3, 4, 5].map((star) => ({
        rating: star,
        count: ratings.find((r) => r.rating === star)?._count._all ?? 0,
      })),
    };
  }

  async managerDashboard(user: AuthUser) {
    const scope = this.access.toiletScope(user);
    const reportScope: Prisma.ReportWhereInput = user.role === UserRole.ADMIN ? {} : { toilet: scope };
    const now = phnomPenhNow();
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600_000);
    const [toilets, byStatus, ratingAgg, unresolved, reports30d, cleanings7d, schedulesToday, recent] = await this.prisma.$transaction([
      this.prisma.toilet.count({ where: scope }),
      this.prisma.toilet.groupBy({ by: ['status'], where: scope, _count: { _all: true }, orderBy: { status: 'asc' } }),
      this.prisma.toilet.aggregate({ where: scope, _avg: { averageRating: true, cleanlinessRating: true }, _sum: { reviewCount: true } }),
      this.prisma.report.count({ where: { ...reportScope, status: { in: UNRESOLVED } } }),
      this.prisma.report.count({ where: { ...reportScope, createdAt: { gte: monthAgo } } }),
      this.prisma.cleaningLog.count({ where: { toilet: scope, cleanedAt: { gte: weekAgo } } }),
      this.prisma.cleaningSchedule.count({ where: { toilet: scope, isActive: true, dayOfWeek: now.dayOfWeek } }),
      this.prisma.report.findMany({
        where: { ...reportScope, status: { in: UNRESOLVED } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { toilet: { select: { id: true, name: true } } },
      }),
    ]);
    return {
      assignedToilets: toilets,
      toiletsByStatus: countMap(
        Object.values(ToiletStatus),
        byStatus.map((r) => ({ key: r.status, count: (r._count as { _all: number })._all })),
      ),
      averageRating: round2(ratingAgg._avg.averageRating),
      averageCleanliness: round2(ratingAgg._avg.cleanlinessRating),
      totalReviews: ratingAgg._sum.reviewCount ?? 0,
      unresolvedReports: unresolved,
      reportsLast30Days: reports30d,
      cleaningLogsLast7Days: cleanings7d,
      cleaningSchedulesToday: schedulesToday,
      recentUnresolvedReports: recent.map((r) => ({ id: r.id, category: r.category, status: r.status, createdAt: r.createdAt, toilet: r.toilet })),
    };
  }
}
