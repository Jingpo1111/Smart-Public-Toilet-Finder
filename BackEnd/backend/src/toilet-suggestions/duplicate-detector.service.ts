import { Injectable } from '@nestjs/common';
import { SuggestionStatus } from '../generated/prisma/client';
import { boundingBox, haversineMeters } from '../common/utils/geo';
import { nameSimilarity } from '../common/utils/similarity';
import { PrismaService } from '../prisma/prisma.service';

export interface DuplicateCandidate {
  kind: 'TOILET' | 'SUGGESTION';
  id: string;
  name: string;
  distanceMeters: number;
  nameSimilarity: number;
  reason: 'VERY_CLOSE' | 'SIMILAR_NAME_NEARBY';
  isVerified?: boolean;
  archived?: boolean;
}

/** Within this distance any existing WC/suggestion is flagged. */
export const DUPLICATE_RADIUS_STRICT_M = 50;
/** Within this distance a WC/suggestion with a similar name is flagged. */
export const DUPLICATE_RADIUS_NAME_M = 250;
export const DUPLICATE_NAME_SIMILARITY = 0.6;

/** Flags possible duplicates by proximity and name similarity. Results are shown to administrators only. */
@Injectable()
export class DuplicateDetectorService {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    lat: number,
    lng: number,
    name: string,
    opts: { excludeSuggestionIds?: string[]; excludeToiletIds?: string[] } = {},
  ): Promise<DuplicateCandidate[]> {
    const box = boundingBox(lat, lng, DUPLICATE_RADIUS_NAME_M);
    const inBox = {
      latitude: { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLng, lte: box.maxLng },
    };
    const [toilets, suggestions] = await Promise.all([
      this.prisma.toilet.findMany({
        where: { ...inBox, ...(opts.excludeToiletIds?.length ? { id: { notIn: opts.excludeToiletIds } } : {}) },
        select: { id: true, name: true, latitude: true, longitude: true, isVerified: true, archivedAt: true },
        take: 200,
      }),
      this.prisma.toiletSuggestion.findMany({
        where: {
          ...inBox,
          status: SuggestionStatus.PENDING,
          ...(opts.excludeSuggestionIds?.length ? { id: { notIn: opts.excludeSuggestionIds } } : {}),
        },
        select: { id: true, name: true, latitude: true, longitude: true },
        take: 200,
      }),
    ]);

    const evaluate = (c: { id: string; name: string; latitude: number; longitude: number }) => {
      const distance = haversineMeters(lat, lng, c.latitude, c.longitude);
      const similarity = nameSimilarity(name, c.name);
      if (distance <= DUPLICATE_RADIUS_STRICT_M) return { distance, similarity, reason: 'VERY_CLOSE' as const };
      if (distance <= DUPLICATE_RADIUS_NAME_M && similarity >= DUPLICATE_NAME_SIMILARITY) {
        return { distance, similarity, reason: 'SIMILAR_NAME_NEARBY' as const };
      }
      return null;
    };

    const out: DuplicateCandidate[] = [];
    for (const t of toilets) {
      const r = evaluate(t);
      if (r) {
        out.push({
          kind: 'TOILET',
          id: t.id,
          name: t.name,
          distanceMeters: Math.round(r.distance),
          nameSimilarity: Math.round(r.similarity * 100) / 100,
          reason: r.reason,
          isVerified: t.isVerified,
          archived: t.archivedAt !== null,
        });
      }
    }
    for (const s of suggestions) {
      const r = evaluate(s);
      if (r) {
        out.push({
          kind: 'SUGGESTION',
          id: s.id,
          name: s.name,
          distanceMeters: Math.round(r.distance),
          nameSimilarity: Math.round(r.similarity * 100) / 100,
          reason: r.reason,
        });
      }
    }
    return out.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 10);
  }
}
