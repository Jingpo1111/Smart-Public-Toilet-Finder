import { Injectable, NotFoundException } from '@nestjs/common';
import { SuggestionStatus, ReportStatus } from '../generated/prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImageAccess, ImageUrlService } from '../storage/image-url.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

export const PROFILE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  preferredLanguage: true,
  avatarPath: true,
  isActive: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

type ProfileRow = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  preferredLanguage: string;
  avatarPath: string | null;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
};

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  preferredLanguage: string;
  avatar: ImageAccess | null;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageUrlService,
    private readonly config: AppConfigService,
  ) {}

  avatarRef(userId: string, avatarPath: string | null) {
    return avatarPath
      ? { id: `avatar:${userId}`, bucket: this.config.supabase.buckets.avatar, objectPath: avatarPath, mimeType: 'image/webp' }
      : null;
  }

  /** Never includes passwordHash or tokenVersion. */
  async toProfile(row: ProfileRow): Promise<UserProfile> {
    const { avatarPath, ...rest } = row;
    return { ...rest, avatar: await this.images.signOne(this.avatarRef(row.id, avatarPath)) };
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
    if (!row) throw new NotFoundException('User not found.');
    return this.toProfile(row);
  }

  /** Only fullName, phone and preferredLanguage can change here (role/email/etc. are rejected by the DTO whitelist). */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.preferredLanguage !== undefined ? { preferredLanguage: dto.preferredLanguage } : {}),
      },
      select: PROFILE_SELECT,
    });
    return this.toProfile(row);
  }

  /** Counters for the user dashboard. */
  async summary(userId: string) {
    const [suggestions, reviews, reports, favorites, unread] = await this.prisma.$transaction([
      this.prisma.toiletSuggestion.groupBy({
        by: ['status'],
        where: { contributorId: userId },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.review.count({ where: { userId } }),
      this.prisma.report.groupBy({
        by: ['status'],
        where: { reporterId: userId },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.favorite.count({ where: { userId, toilet: { isVerified: true, archivedAt: null } } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    const countBy = <T extends string>(rows: { status: T; _count: unknown }[], keys: T[]) =>
      Object.fromEntries(
        keys.map((k) => [k, (rows.find((r) => r.status === k)?._count as { _all: number } | undefined)?._all ?? 0]),
      ) as Record<T, number>;
    return {
      suggestions: countBy(suggestions, Object.values(SuggestionStatus)),
      reports: countBy(reports, Object.values(ReportStatus)),
      reviews,
      favorites,
      unreadNotifications: unread,
    };
  }
}
