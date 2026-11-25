import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { Prisma, UserRole } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { PaginatedResult, skipTake } from '../common/dto/pagination.dto';
import type { AuthUser } from '../common/types/auth-user';
import { minutesToTime, timeToMinutes } from '../common/utils/opening-hours';
import { PrismaService } from '../prisma/prisma.service';
import { ManagerUpdateToiletDto } from '../toilets/dto/admin-toilet.dto';
import { ToiletsService } from '../toilets/toilets.service';
import {
  CleaningLogQueryDto,
  CleaningScheduleQueryDto,
  CreateCleaningLogDto,
  CreateCleaningScheduleDto,
  ManagerToiletQueryDto,
  UpdateCleaningScheduleDto,
} from './dto/manager.dto';
import { ManagerAccessService } from './manager-access.service';

type ScheduleRow = Prisma.CleaningScheduleGetPayload<{ include: { toilet: { select: { id: true; name: true } } } }>;

/** Every method checks the assignment (ManagerAccessService) before reading or writing. */
@Injectable()
export class ManagerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ManagerAccessService,
    private readonly toilets: ToiletsService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  listToilets(user: AuthUser, q: ManagerToiletQueryDto) {
    return this.toilets.listScoped(this.access.toiletScope(user), q, q);
  }

  async getToilet(user: AuthUser, id: string) {
    await this.access.assertCanManageToilet(user, id);
    const t = await this.toilets.getForManagement(id);
    if (user.role === UserRole.ADMIN) return t;
    // Managers do not see co-managers' e-mail addresses.
    return { ...t, managers: t.managers.map((m) => ({ ...m, email: m.managerId === user.id ? m.email : undefined })) };
  }

  async updateToilet(user: AuthUser, id: string, dto: ManagerUpdateToiletDto) {
    await this.access.assertCanManageToilet(user, id);
    await this.toilets.update(user, id, dto);
    return this.getToilet(user, id);
  }

  // ───────────── Cleaning schedules ─────────────

  private scheduleShape(s: ScheduleRow) {
    return {
      id: s.id,
      toilet: s.toilet,
      dayOfWeek: s.dayOfWeek,
      startTime: minutesToTime(s.startMinute),
      assignedTo: s.assignedTo,
      notes: s.notes,
      isActive: s.isActive,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  async listSchedules(user: AuthUser, q: CleaningScheduleQueryDto) {
    if (q.toiletId) await this.access.assertCanManageToilet(user, q.toiletId);
    const rows = await this.prisma.cleaningSchedule.findMany({
      where: {
        toilet: this.access.toiletScope(user),
        ...(q.toiletId ? { toiletId: q.toiletId } : {}),
        ...(q.dayOfWeek !== undefined ? { dayOfWeek: q.dayOfWeek } : {}),
      },
      include: { toilet: { select: { id: true, name: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      take: 500,
    });
    return rows.map((r) => this.scheduleShape(r));
  }

  async createSchedule(user: AuthUser, toiletId: string, dto: CreateCleaningScheduleDto) {
    await this.access.assertCanManageToilet(user, toiletId);
    const row = await this.prisma.cleaningSchedule.create({
      data: {
        toiletId,
        dayOfWeek: dto.dayOfWeek,
        startMinute: timeToMinutes(dto.startTime),
        assignedTo: dto.assignedTo,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
        createdById: user.id,
      },
      include: { toilet: { select: { id: true, name: true } } },
    });
    await this.audit.log({ actorId: user.id, action: 'cleaning_schedule.created', entityType: 'CleaningSchedule', entityId: row.id, metadata: { toiletId } });
    return this.scheduleShape(row);
  }

  private async ownedSchedule(user: AuthUser, scheduleId: string) {
    const s = await this.prisma.cleaningSchedule.findUnique({ where: { id: scheduleId }, select: { toiletId: true } });
    if (!s) throw new NotFoundException('Cleaning schedule not found.');
    await this.access.assertCanManageToilet(user, s.toiletId);
    return s;
  }

  async updateSchedule(user: AuthUser, scheduleId: string, dto: UpdateCleaningScheduleDto) {
    await this.ownedSchedule(user, scheduleId);
    const row = await this.prisma.cleaningSchedule.update({
      where: { id: scheduleId },
      data: {
        ...(dto.dayOfWeek !== undefined ? { dayOfWeek: dto.dayOfWeek } : {}),
        ...(dto.startTime !== undefined ? { startMinute: timeToMinutes(dto.startTime) } : {}),
        ...(dto.assignedTo !== undefined ? { assignedTo: dto.assignedTo } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { toilet: { select: { id: true, name: true } } },
    });
    await this.audit.log({ actorId: user.id, action: 'cleaning_schedule.updated', entityType: 'CleaningSchedule', entityId: scheduleId });
    return this.scheduleShape(row);
  }

  async deleteSchedule(user: AuthUser, scheduleId: string) {
    await this.ownedSchedule(user, scheduleId);
    await this.prisma.cleaningSchedule.delete({ where: { id: scheduleId } });
    await this.audit.log({ actorId: user.id, action: 'cleaning_schedule.deleted', entityType: 'CleaningSchedule', entityId: scheduleId });
  }

  // ───────────── Cleaning logs ─────────────

  async listLogs(user: AuthUser, q: CleaningLogQueryDto) {
    if (q.toiletId) await this.access.assertCanManageToilet(user, q.toiletId);
    const where: Prisma.CleaningLogWhereInput = {
      toilet: this.access.toiletScope(user),
      ...(q.toiletId ? { toiletId: q.toiletId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cleaningLog.findMany({
        where,
        include: { toilet: { select: { id: true, name: true } }, loggedBy: { select: { id: true, fullName: true } } },
        orderBy: [{ cleanedAt: 'desc' }, { id: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.cleaningLog.count({ where }),
    ]);
    return PaginatedResult.of(rows, total, q.page, q.limit);
  }

  async createLog(user: AuthUser, toiletId: string, dto: CreateCleaningLogDto) {
    await this.access.assertCanManageToilet(user, toiletId);
    if (dto.cleanedAt && dto.cleanedAt.getTime() < Date.now() - 30 * 24 * 3600_000) {
      throw new BadRequestException('cleanedAt cannot be more than 30 days in the past.');
    }
    const log = await this.prisma.cleaningLog.create({
      data: {
        toiletId,
        loggedById: user.id,
        cleanedAt: dto.cleanedAt ?? new Date(),
        notes: dto.notes,
        waterRefilled: dto.waterRefilled,
        soapRefilled: dto.soapRefilled,
        paperRefilled: dto.paperRefilled,
      },
      include: { toilet: { select: { id: true, name: true } }, loggedBy: { select: { id: true, fullName: true } } },
    });
    await this.audit.log({ actorId: user.id, action: 'cleaning.logged', entityType: 'Toilet', entityId: toiletId, metadata: { logId: log.id } });
    return log;
  }

  // ───────────── Feedback QR ─────────────

  /** QR code linking to the public WC page with the feedback form. It grants no permissions. */
  async feedbackQr(user: AuthUser, toiletId: string) {
    const toilet = await this.access.assertCanManageToilet(user, toiletId);
    const url = `${this.config.frontendUrl}/toilets/${toiletId}?feedback=1`;
    const [svg, pngDataUrl] = await Promise.all([
      QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 }),
      QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 512 }),
    ]);
    return { toiletId, toiletName: toilet.name, url, svg, pngDataUrl, publicPageOnly: true };
  }
}
