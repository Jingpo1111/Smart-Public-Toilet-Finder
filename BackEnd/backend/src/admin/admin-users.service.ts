import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/token.service';
import { PaginatedResult, skipTake } from '../common/dto/pagination.dto';
import type { AuthUser } from '../common/types/auth-user';
import { NotificationTemplates } from '../notifications/notification-templates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImageUrlService } from '../storage/image-url.service';
import { UsersService } from '../users/users.service';
import { AdminUserQueryDto, AssignmentQueryDto, AuditLogQueryDto, CreateAssignmentDto } from './dto/admin.dto';

const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  isActive: true,
  preferredLanguage: true,
  avatarPath: true,
  createdAt: true,
  lastLoginAt: true,
  _count: { select: { suggestions: true, reviews: true, reports: true, managerAssignments: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly urls: ImageUrlService,
  ) {}

  private async shape(rows: Prisma.UserGetPayload<{ select: typeof USER_SELECT }>[]) {
    const refs = rows.map((r) => this.users.avatarRef(r.id, r.avatarPath)).filter((x): x is NonNullable<typeof x> => !!x);
    const signed = await this.urls.sign(refs);
    return rows.map(({ avatarPath: _a, _count, ...r }) => ({ ...r, avatar: signed.get(`avatar:${r.id}`) ?? null, counts: _count }));
  }

  async list(q: AdminUserQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
      ...(q.q
        ? {
            OR: [
              { fullName: { contains: q.q, mode: 'insensitive' } },
              { email: { contains: q.q, mode: 'insensitive' } },
              { phone: { contains: q.q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: USER_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...skipTake(q) }),
      this.prisma.user.count({ where }),
    ]);
    return PaginatedResult.of(await this.shape(rows), total, q.page, q.limit);
  }

  async get(id: string) {
    const row = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!row) throw new NotFoundException('User not found.');
    const [shaped] = await this.shape([row]);
    const assignments = await this.prisma.managerAssignment.findMany({
      where: { managerId: id },
      include: { toilet: { select: { id: true, name: true, archivedAt: true } } },
    });
    return { ...shaped, managerAssignments: assignments.map((a) => ({ id: a.id, toilet: a.toilet, createdAt: a.createdAt })) };
  }

  private async assertNotLastAdmin(tx: Prisma.TransactionClient, userId: string) {
    const admins = await tx.user.count({ where: { role: UserRole.ADMIN, isActive: true, id: { not: userId } } });
    if (admins === 0) throw new ConflictException('At least one active administrator must remain.');
  }

  /**
   * Role change. The new role applies immediately to every request because the JWT strategy reads
   * the role from the database. Leaving MANAGER removes the user's assignments.
   */
  async changeRole(admin: AuthUser, id: string, role: UserRole) {
    if (admin.id === id) throw new ForbiddenException('You cannot change your own role.');
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.role === role) throw new BadRequestException(`The user already has role ${role}.`);
    await this.prisma.$transaction(async (tx) => {
      if (user.role === UserRole.ADMIN) await this.assertNotLastAdmin(tx, id);
      await tx.user.update({ where: { id }, data: { role } });
      if (user.role === UserRole.MANAGER) await tx.managerAssignment.deleteMany({ where: { managerId: id } });
      await this.notifications.notify(id, NotificationTemplates.roleChanged(role), tx);
      await this.audit.log({ actorId: admin.id, action: 'user.role_changed', entityType: 'User', entityId: id, metadata: { from: user.role, to: role } }, tx);
    });
    return this.get(id);
  }

  /** Deactivation revokes all sessions and invalidates access tokens immediately. */
  async changeStatus(admin: AuthUser, id: string, isActive: boolean) {
    if (admin.id === id) throw new ForbiddenException('You cannot change the status of your own account.');
    const user = await this.prisma.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.isActive === isActive) throw new BadRequestException(`The account is already ${isActive ? 'active' : 'inactive'}.`);
    await this.prisma.$transaction(async (tx) => {
      if (!isActive && user.role === UserRole.ADMIN) await this.assertNotLastAdmin(tx, id);
      await tx.user.update({ where: { id }, data: { isActive, ...(isActive ? {} : { tokenVersion: { increment: 1 } }) } });
      if (!isActive) await this.tokens.revokeAllForUser(id, tx);
      await this.audit.log({ actorId: admin.id, action: isActive ? 'user.activated' : 'user.deactivated', entityType: 'User', entityId: id }, tx);
    });
    return this.get(id);
  }

  // ───────────── Manager assignments ─────────────

  async listAssignments(q: AssignmentQueryDto) {
    const where: Prisma.ManagerAssignmentWhereInput = {
      ...(q.managerId ? { managerId: q.managerId } : {}),
      ...(q.toiletId ? { toiletId: q.toiletId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.managerAssignment.findMany({
        where,
        include: {
          manager: { select: { id: true, fullName: true, email: true, role: true, isActive: true } },
          toilet: { select: { id: true, name: true, district: true, archivedAt: true } },
          assignedBy: { select: { id: true, fullName: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.managerAssignment.count({ where }),
    ]);
    return PaginatedResult.of(rows, total, q.page, q.limit);
  }

  async createAssignment(admin: AuthUser, dto: CreateAssignmentDto) {
    const [manager, toilet] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.managerId }, select: { id: true, role: true, isActive: true } }),
      this.prisma.toilet.findUnique({ where: { id: dto.toiletId }, select: { id: true, name: true, archivedAt: true } }),
    ]);
    if (!manager) throw new NotFoundException('Manager not found.');
    if (manager.role !== UserRole.MANAGER) throw new BadRequestException('The user must have role MANAGER. Change the role first.');
    if (!manager.isActive) throw new BadRequestException('The manager account is deactivated.');
    if (!toilet) throw new NotFoundException('WC not found.');
    if (toilet.archivedAt) throw new BadRequestException('Archived WCs cannot be assigned.');
    try {
      const assignment = await this.prisma.$transaction(async (tx) => {
        const a = await tx.managerAssignment.create({
          data: { managerId: dto.managerId, toiletId: dto.toiletId, assignedById: admin.id },
          include: {
            manager: { select: { id: true, fullName: true, email: true } },
            toilet: { select: { id: true, name: true } },
          },
        });
        await this.notifications.notify(dto.managerId, NotificationTemplates.managerAssigned(toilet.id, toilet.name), tx);
        await this.audit.log(
          { actorId: admin.id, action: 'manager.assigned', entityType: 'ManagerAssignment', entityId: a.id, metadata: { ...dto } },
          tx,
        );
        return a;
      });
      return assignment;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('This manager is already assigned to this WC.');
      }
      throw e;
    }
  }

  async deleteAssignment(admin: AuthUser, id: string) {
    const a = await this.prisma.managerAssignment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Assignment not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.managerAssignment.delete({ where: { id } });
      await this.audit.log(
        { actorId: admin.id, action: 'manager.unassigned', entityType: 'ManagerAssignment', entityId: id, metadata: { managerId: a.managerId, toiletId: a.toiletId } },
        tx,
      );
    });
  }

  async auditLogs(q: AuditLogQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, fullName: true, role: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return PaginatedResult.of(rows, total, q.page, q.limit);
  }
}
