import { BadRequestException } from '@nestjs/common';
import { AccessType } from '../generated/prisma/client';
import { facilityPatch, normalizeAccess, parseOpeningHours } from './toilet-rules';

describe('toilet business rules', () => {
  it('normalises access type and KHR price', () => {
    expect(normalizeAccess(AccessType.FREE, undefined)).toEqual({ accessType: 'FREE', priceKhr: 0 });
    expect(normalizeAccess(AccessType.FREE, 0)).toEqual({ accessType: 'FREE', priceKhr: 0 });
    expect(normalizeAccess(AccessType.PAID, 500)).toEqual({ accessType: 'PAID', priceKhr: 500 });
    expect(normalizeAccess(AccessType.PAID, null)).toEqual({ accessType: 'PAID', priceKhr: null }); // amount unknown
    expect(normalizeAccess(AccessType.UNKNOWN, undefined)).toEqual({ accessType: 'UNKNOWN', priceKhr: null });
    expect(() => normalizeAccess(AccessType.FREE, 500)).toThrow(BadRequestException);
    expect(() => normalizeAccess(AccessType.PAID, 0)).toThrow(BadRequestException);
    expect(() => normalizeAccess(AccessType.UNKNOWN, 500)).toThrow(BadRequestException);
  });

  it('keeps unknown facilities distinct from false', () => {
    expect(facilityPatch({ hasWater: false, hasSoap: null })).toEqual({ hasWater: false, hasSoap: null });
    expect(facilityPatch({})).toEqual({});
    expect(facilityPatch(undefined)).toEqual({});
  });

  it('maps invalid opening hours to 400', () => {
    expect(parseOpeningHours(null)).toEqual([]);
    expect(() => parseOpeningHours([{ dayOfWeek: 1, opensAt: '24:00', closesAt: '01:00' }])).toThrow(BadRequestException);
  });
});
