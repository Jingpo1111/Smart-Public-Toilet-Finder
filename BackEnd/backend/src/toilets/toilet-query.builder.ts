import { AccessType, Prisma, ToiletStatus } from '../generated/prisma/client';
import { openNowIntervalFilter, phnomPenhNow } from '../common/utils/opening-hours';
import type { ToiletFilterDto } from './dto/toilet-query.dto';

/** Only verified, non-archived WCs are ever visible on public endpoints. */
export const PUBLIC_TOILET_WHERE: Prisma.ToiletWhereInput = { isVerified: true, archivedAt: null };

const insensitive = (value: string) => ({ contains: value, mode: 'insensitive' as const });
const equalsInsensitive = (value: string) => ({ equals: value, mode: 'insensitive' as const });

export function textSearch(q: string): Prisma.ToiletWhereInput {
  return {
    OR: [
      { name: insensitive(q) },
      { nameKm: insensitive(q) },
      { address: insensitive(q) },
      { district: insensitive(q) },
      { sangkat: insensitive(q) },
    ],
  };
}

/** Builds the Prisma filter for public discovery. All values are passed as parameters (no SQL concatenation). */
export function buildPublicToiletWhere(f: ToiletFilterDto, now = phnomPenhNow()): Prisma.ToiletWhereInput {
  const and: Prisma.ToiletWhereInput[] = [PUBLIC_TOILET_WHERE];

  if (f.q) and.push(textSearch(f.q));
  if (f.province) and.push({ province: equalsInsensitive(f.province) });
  if (f.district) and.push({ district: equalsInsensitive(f.district) });
  if (f.sangkat) and.push({ sangkat: equalsInsensitive(f.sangkat) });

  if (f.free) and.push({ accessType: AccessType.FREE });
  else if (f.accessType) and.push({ accessType: f.accessType });

  if (f.maxPrice !== undefined) {
    and.push({
      OR: [{ accessType: AccessType.FREE }, { accessType: AccessType.PAID, priceKhr: { lte: f.maxPrice } }],
    });
  }

  const facility: Prisma.FacilityWhereInput = {};
  if (f.hasWater !== undefined) facility.hasWater = f.hasWater;
  if (f.hasSoap !== undefined) facility.hasSoap = f.hasSoap;
  if (f.wheelchairAccessible !== undefined) facility.wheelchairAccessible = f.wheelchairAccessible;
  if (f.babyChanging !== undefined) facility.babyChanging = f.babyChanging;
  if (Object.keys(facility).length) and.push({ facility: { is: facility } });

  if (f.minRating !== undefined) and.push({ averageRating: { gte: f.minRating } });
  if (f.minCleanliness !== undefined) and.push({ cleanlinessRating: { gte: f.minCleanliness } });
  if (f.status) and.push({ status: f.status });

  if (f.openNow === true) {
    and.push({ status: ToiletStatus.OPEN, openingHours: { some: openNowIntervalFilter(now) } });
  } else if (f.openNow === false) {
    // Known to be closed now: not operating, or has a schedule that does not cover the current time.
    and.push({
      OR: [
        { status: { not: ToiletStatus.OPEN } },
        { openingHours: { some: {} }, NOT: { openingHours: { some: openNowIntervalFilter(now) } } },
      ],
    });
  }
  return { AND: and };
}
