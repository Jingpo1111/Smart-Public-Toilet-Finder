import { Injectable } from '@nestjs/common';
import { PaginatedResult, PaginationQueryDto, skipTake } from '../common/dto/pagination.dto';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_TOILET_WHERE } from '../toilets/toilet-query.builder';
import { TOILET_LIST_INCLUDE, ToiletsService } from '../toilets/toilets.service';

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly toilets: ToiletsService,
  ) {}

  /** Lists favourites whose WC is still public (archived WCs drop out of the list). */
  async list(user: AuthUser, q: PaginationQueryDto) {
    const where = { userId: user.id, toilet: PUBLIC_TOILET_WHERE };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.favorite.findMany({
        where,
        include: { toilet: { include: TOILET_LIST_INCLUDE } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.favorite.count({ where }),
    ]);
    const summaries = await this.toilets.toSummaries(rows.map((r) => r.toilet));
    return PaginatedResult.of(
      rows.map((r, i) => ({ favoriteId: r.id, favoritedAt: r.createdAt, toilet: summaries[i] })),
      total,
      q.page,
      q.limit,
    );
  }

  /** Idempotent: adding an existing favourite returns it. */
  async add(user: AuthUser, toiletId: string) {
    await this.toilets.assertPublic(toiletId);
    const fav = await this.prisma.favorite.upsert({
      where: { userId_toiletId: { userId: user.id, toiletId } },
      create: { userId: user.id, toiletId },
      update: {},
    });
    return { favoriteId: fav.id, toiletId, favoritedAt: fav.createdAt, isFavorite: true };
  }

  /** Idempotent removal. */
  async remove(user: AuthUser, toiletId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId: user.id, toiletId } });
    return { toiletId, isFavorite: false };
  }
}
