import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '../generated/prisma/client';
import type { DbClient } from '../audit/audit.service';
import { PaginatedResult, skipTake } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import type { NotificationContent } from './notification-templates';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private toData(userId: string, c: NotificationContent): Prisma.NotificationCreateManyInput {
    return {
      userId,
      type: c.type,
      title: c.title,
      message: c.message,
      titleKm: c.titleKm,
      messageKm: c.messageKm,
      data: (c.data ?? undefined) as Prisma.InputJsonValue | undefined,
    };
  }

  async notify(userId: string, content: NotificationContent, db: DbClient = this.prisma): Promise<void> {
    await db.notification.create({ data: this.toData(userId, content) });
  }

  async notifyMany(userIds: string[], content: NotificationContent, db: DbClient = this.prisma): Promise<void> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;
    await db.notification.createMany({ data: unique.map((id) => this.toData(id, content)) });
  }

  async notifyAdmins(content: NotificationContent, db: DbClient = this.prisma, excludeUserId?: string): Promise<void> {
    const admins = await db.user.findMany({
      where: { role: UserRole.ADMIN, isActive: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
      select: { id: true },
    });
    await this.notifyMany(
      admins.map((a) => a.id),
      content,
      db,
    );
  }

  async listMine(userId: string, q: NotificationQueryDto) {
    const where: Prisma.NotificationWhereInput = { userId, ...(q.unreadOnly ? { readAt: null } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q) }),
      this.prisma.notification.count({ where }),
    ]);
    return PaginatedResult.of(items.map((n) => this.toResponse(n)), total, q.page, q.limit);
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { unreadCount: count };
  }

  async markRead(userId: string, id: string) {
    const existing = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Notification not found.');
    const updated = existing.readAt
      ? existing
      : await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    return this.toResponse(updated);
  }

  async markAllRead(userId: string) {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }

  private toResponse(n: {
    id: string;
    type: string;
    title: string;
    message: string;
    titleKm: string | null;
    messageKm: string | null;
    data: unknown;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      titleKm: n.titleKm,
      messageKm: n.messageKm,
      data: n.data ?? null,
      isRead: n.readAt !== null,
      readAt: n.readAt,
      createdAt: n.createdAt,
    };
  }
}
