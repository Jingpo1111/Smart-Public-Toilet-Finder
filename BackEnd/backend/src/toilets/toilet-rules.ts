import { BadRequestException } from '@nestjs/common';
import { AccessType } from '../generated/prisma/client';
import { OpeningHourInput, StoredInterval, toStoredIntervals } from '../common/utils/opening-hours';
import type { FacilitiesDto } from './dto/toilet-fields.dto';

/**
 * Business rules for access type and KHR price:
 * - FREE → price 0 (a non-zero price is rejected)
 * - PAID → price > 0, or null when the amount is unknown
 * - UNKNOWN → no price
 */
export function normalizeAccess(
  accessType: AccessType,
  priceKhr: number | null | undefined,
): { accessType: AccessType; priceKhr: number | null } {
  switch (accessType) {
    case AccessType.FREE:
      if (priceKhr != null && priceKhr !== 0) throw new BadRequestException('A FREE WC cannot have a price.');
      return { accessType, priceKhr: 0 };
    case AccessType.PAID:
      if (priceKhr === 0) {
        throw new BadRequestException('A PAID WC must have a price above 0 KHR (or null if the price is unknown).');
      }
      return { accessType, priceKhr: priceKhr ?? null };
    default:
      if (priceKhr != null) {
        throw new BadRequestException('Set accessType to FREE or PAID when providing a price.');
      }
      return { accessType: AccessType.UNKNOWN, priceKhr: null };
  }
}

/** Validates opening hours and converts them to stored intervals. null/[] → [] (unknown). */
export function parseOpeningHours(input: OpeningHourInput[] | null | undefined): StoredInterval[] {
  if (!input || input.length === 0) return [];
  try {
    return toStoredIntervals(input);
  } catch (e) {
    throw new BadRequestException((e as Error).message);
  }
}

export const FACILITY_KEYS = [
  'hasWater',
  'hasSoap',
  'wheelchairAccessible',
  'babyChanging',
  'hasToiletPaper',
  'hasHandDryer',
  'isGenderNeutral',
] as const;
export type FacilityKey = (typeof FACILITY_KEYS)[number];
export type FacilityValues = Record<FacilityKey, boolean | null>;

/** Picks only the provided facility keys (undefined = leave unchanged, null = unknown). */
export function facilityPatch(dto: FacilitiesDto | undefined): Partial<FacilityValues> {
  const out: Partial<FacilityValues> = {};
  if (!dto) return out;
  for (const k of FACILITY_KEYS) if (dto[k] !== undefined) out[k] = dto[k] ?? null;
  return out;
}

export function emptyFacilities(): FacilityValues {
  return Object.fromEntries(FACILITY_KEYS.map((k) => [k, null])) as FacilityValues;
}
