import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReportStatus, UserRole } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PaginatedResult, skipTake } from '../common/dto/pagination.dto';
import type { AuthUser } from '../common/types/auth-user';
import { publicDisplayName } from '../common/utils/display-name';
import { ManagerAccessService } from '../manager/manager-access.service';
import { NotificationTemplates } from '../notifications/notification-templates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImageUrlService } from '../storage/image-url.service';
import { PUBLIC_TOILET_WHERE } from '../toilets/toilet-query.builder';
import { uploadCutoff } from '../uploads/uploads.service';
import { CreateReportDto, MyReportQueryDto, ReportQueryDto, UpdateReportStatusDto } from './dto/report.dto';

/** Allowed status transitions. RESOLVED/REJECTED can be reopened (→ IN_PROGRESS). */
export const REPORT_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  PENDING: [ReportStatus.IN_PROGRESS, ReportStatus.RESOLVED, ReportStatus.REJECTED],
  IN_PROGRESS: [ReportStatus.PENDING, ReportStatus.RESOLVED, ReportStatus.REJECTED],
  RESOLVED: [ReportStatus.IN_PROGRESS],
  REJECTED: [ReportStatus.IN_PROGRESS],
};

const DETAIL_INCLUDE = {
  toilet: { select: { id: true, name: true, nameKm: true, address: true, district: true } },
  images: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
  statusHistory: {
    orderBy: { createdAt: 'asc' as const },
    include: { changedBy: { select: { id: true, fullName: true, role: true } } },
  },
  reporter: { select: { id: true, fullName: true, email: true } },
  resolvedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ReportInclude;

type ReportRow = Prisma.ReportGetPayload<{ include: typeof DETAIL_INCLUDE }>;
type Audience = 'reporter' | 'manager' | 'admin';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ManagerAccessService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly urls: ImageUrlService,
  ) {}

  /**
   * Shapes a report for its audience. Reporter e-mail is only visible to administrators;
   * managers see a display name; staff identities in history are reduced for reporters.
   */
  private async shape(rows: ReportRow[], audience: Audience) {
    const signed = await this.urls.sign(rows.flatMap((r) => r.images));
    return rows.map((r) => ({
      id: r.id,
      toilet: r.toilet,
      category: r.category,
      description: r.description,
      status: r.status,
      resolutionNote: r.resolutionNote,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      images: r.images.map((i) => signed.get(i.id)).filter((x) => !!x),
      statusHistory: r.statusHistory.map((h) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        note: h.note,
        createdAt: h.createdAt,
        changedBy:
          audience === 'reporter'
            ? h.changedBy
              ? { role: h.changedBy.role === UserRole.USER ? 'REPORTER' : 'STAFF' }
              : null
            : h.changedBy,
      })),
      ...(audience === 'admin'
        ? { reporter: r.reporter, resolvedBy: r.resolvedBy }
        : audience === 'manager'
          ? { reporter: { displayName: publicDisplayName(r.reporter.fullName) }, resolvedBy: r.resolvedBy }
          : {}),
    }));
  }

  async create(user: AuthUser, toiletId: string, dto: CreateReportDto) {
    const toilet = await this.prisma.toilet.findFirst({ where: { id: toiletId, ...PUBLIC_TOILET_WHERE }, select: { id: true, name: true } });
    if (!toilet) throw new NotFoundException('WC not found.');
    const imageIds = dto.imageIds ?? [];
    if (imageIds.length) {
      const found = await this.prisma.reportImage.findMany({
        where: { id: { in: imageIds }, uploaderId: user.id, reportId: null, createdAt: { gte: uploadCutoff() } },
        select: { sha256: true },
      });
      if (found.length !== imageIds.length) {
        throw new BadRequestException(
          'One or more imageIds are invalid, expired, already used or were not uploaded by you. Upload them again with POST /uploads/reports.',
        );
      }
      if (new Set(found.map((f) => f.sha256)).size !== found.length) {
        throw new BadRequestException('The same photo was included more than once.');
      }
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: { toiletId, reporterId: user.id, category: dto.category, description: dto.description, status: ReportStatus.PENDING },
      });
      if (imageIds.length) {
        const res = await tx.reportImage.updateMany({
          where: { id: { in: imageIds }, uploaderId: user.id, reportId: null, createdAt: { gte: uploadCutoff() } },
          data: { reportId: report.id, attachedAt: new Date() },
        });
        if (res.count !== imageIds.length) throw new ConflictException('One or more photos were attached elsewhere. Please retry.');
        for (let i = 0; i < imageIds.length; i++) {
          await tx.reportImage.update({ where: { id: imageIds[i] }, data: { sortOrder: i } });
        }
      }
      await tx.reportStatusHistory.create({
        data: { reportId: report.id, fromStatus: null, toStatus: ReportStatus.PENDING, changedById: user.id },
      });
      // Notify the WC's managers; if nobody manages it, notify administrators.
      const managers = await tx.managerAssignment.findMany({
        where: { toiletId, manager: { isActive: true, role: UserRole.MANAGER } },
        select: { managerId: true },
      });
      const content = NotificationTemplates.reportCreated(report.id, toiletId, toilet.name);
      if (managers.length) await this.notifications.notifyMany(managers.map((m) => m.managerId), content, tx);
      else await this.notifications.notifyAdmins(content, tx, user.id);
      await this.audit.log(
        { actorId: user.id, action: 'report.created', entityType: 'Report', entityId: report.id, metadata: { toiletId, category: dto.category } },
        tx,
      );
      return report.id;
    });
    return this.getMine(user, id);
  }

  async listMine(user: AuthUser, q: MyReportQueryDto) {
    const where: Prisma.ReportWhereInput = { reporterId: user.id, ...(q.status ? { status: q.status } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({ where, include: DETAIL_INCLUDE, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...skipTake(q) }),
      this.prisma.report.count({ where }),
    ]);
    return PaginatedResult.of(await this.shape(rows, 'reporter'), total, q.page, q.limit);
  }

  async getMine(user: AuthUser, id: string) {
    const row = await this.prisma.report.findFirst({ where: { id, reporterId: user.id }, include: DETAIL_INCLUDE });
    if (!row) throw new NotFoundException('Report not found.');
    return (await this.shape([row], 'reporter'))[0];
  }

  /** Admin: all reports. Manager: only reports of assigned WCs (enforced in the query). */
  async list(user: AuthUser, q: ReportQueryDto) {
    const and: Prisma.ReportWhereInput[] = [];
    if (user.role !== UserRole.ADMIN) and.push({ toilet: this.access.toiletScope(user) });
    if (q.status) and.push({ status: q.status });
    if (q.unresolved) and.push({ status: { in: [ReportStatus.PENDING, ReportStatus.IN_PROGRESS] } });
    if (q.category) and.push({ category: q.category });
    if (q.toiletId) and.push({ toiletId: q.toiletId });
    if (q.q) {
      and.push({
        OR: [
          { description: { contains: q.q, mode: 'insensitive' } },
          { toilet: { name: { contains: q.q, mode: 'insensitive' } } },
        ],
      });
    }
    const where = { AND: and };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({ where, include: DETAIL_INCLUDE, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...skipTake(q) }),
      this.prisma.report.count({ where }),
    ]);
    const audience: Audience = user.role === UserRole.ADMIN ? 'admin' : 'manager';
    return PaginatedResult.of(await this.shape(rows, audience), total, q.page, q.limit);
  }

  async get(user: AuthUser, id: string) {
    const row = await this.prisma.report.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!row) throw new NotFoundException('Report not found.');
    await this.access.assertCanManageToilet(user, row.toiletId);
    return (await this.shape([row], user.role === UserRole.ADMIN ? 'admin' : 'manager'))[0];
  }

  /** Status change by an admin or a manager assigned to the report's WC. Optimistic: 409 if changed concurrently. */
  async updateStatus(user: AuthUser, id: string, dto: UpdateReportStatusDto) {
    const report = await this.prisma.report.findUnique({ where: { id }, include: { toilet: { select: { name: true } } } });
    if (!report) throw new NotFoundException('Report not found.');
    await this.access.assertCanManageToilet(user, report.toiletId);
    if (report.status === dto.status) throw new BadRequestException(`The report is already ${dto.status}.`);
    if (!REPORT_TRANSITIONS[report.status].includes(dto.status)) {
      throw new BadRequestException(`Cannot change a ${report.status} report to ${dto.status}.`);
    }
    const closing = dto.status === ReportStatus.RESOLVED || dto.status === ReportStatus.REJECTED;
    if (closing && !dto.resolutionNote) {
      throw new BadRequestException('resolutionNote is required when resolving or rejecting a report.');
    }

    await this.prisma.$transaction(async (tx) => {
      const res = await tx.report.updateMany({
        where: { id, status: report.status },
        data: {
          status: dto.status,
          resolutionNote: closing ? dto.resolutionNote : (dto.resolutionNote ?? report.resolutionNote),
          resolvedAt: closing ? new Date() : null,
          resolvedById: closing ? user.id : null,
        },
      });
      if (res.count !== 1) throw new ConflictException('The report was updated by someone else. Reload and try again.');
      await tx.reportStatusHistory.create({
        data: { reportId: id, fromStatus: report.status, toStatus: dto.status, note: dto.resolutionNote ?? null, changedById: user.id },
      });
      await this.notifications.notify(report.reporterId, NotificationTemplates.reportStatusChanged(id, report.toilet.name, dto.status), tx);
      await this.audit.log(
        { actorId: user.id, action: 'report.status_changed', entityType: 'Report', entityId: id, metadata: { from: report.status, to: dto.status, role: user.role } },
        tx,
      );
    });
    return this.get(user, id);
  }
}
