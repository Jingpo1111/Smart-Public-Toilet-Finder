import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '../generated/prisma/client';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Central place for facility-manager authorisation. Every manager query and mutation
 * (including uploads, image deletion, cleaning logs and report resolution) goes through here.
 * ADMIN may manage every WC; MANAGER only WCs with a ManagerAssignment row.
 */
@Injectable()
export class ManagerAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Prisma filter restricting toilets to those the user may manage. */
  toiletScope(user: AuthUser): Prisma.ToiletWhereInput {
    if (user.role === UserRole.ADMIN) return {};
    if (user.role === UserRole.MANAGER) return { managerAssignments: { some: { managerId: user.id } }, archivedAt: null };
    return { id: { in: [] } };
  }

  async assertCanManageToilet(user: AuthUser, toiletId: string) {
    const toilet = await this.prisma.toilet.findUnique({
      where: { id: toiletId },
      select: { id: true, name: true, archivedAt: true, isVerified: true, coverImageId: true },
    });
    if (!toilet) throw new NotFoundException('WC not found.');
    if (user.role === UserRole.ADMIN) return toilet;
    if (user.role !== UserRole.MANAGER) throw new ForbiddenException('You do not have permission to manage this WC.');
    const assignment = await this.prisma.managerAssignment.findUnique({
      where: { managerId_toiletId: { managerId: user.id, toiletId } },
      select: { id: true },
    });
    if (!assignment) throw new ForbiddenException('You are not assigned to manage this WC.');
    if (toilet.archivedAt) throw new ForbiddenException('This WC has been archived and can no longer be managed.');
    return toilet;
  }

  async managedToiletIds(user: AuthUser): Promise<string[] | 'ALL'> {
    if (user.role === UserRole.ADMIN) return 'ALL';
    const rows = await this.prisma.toilet.findMany({ where: this.toiletScope(user), select: { id: true } });
    return rows.map((r) => r.id);
  }
}
