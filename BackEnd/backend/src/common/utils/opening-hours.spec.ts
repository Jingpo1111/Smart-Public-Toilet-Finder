import { isOpenAt, minutesToTime, phnomPenhNow, toOutput, toStoredIntervals } from './opening-hours';

describe('opening hours', () => {
  it('converts normal, overnight and 24 h intervals', () => {
    const [day, night, all] = toStoredIntervals([
      { dayOfWeek: 1, opensAt: '06:00', closesAt: '20:00' },
      { dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' },
      { dayOfWeek: 0, is24Hours: true },
    ]);
    expect(day).toEqual({ dayOfWeek: 1, openMinute: 360, closeMinute: 1200 });
    expect(night).toEqual({ dayOfWeek: 5, openMinute: 1080, closeMinute: 1560 });
    expect(all).toEqual({ dayOfWeek: 0, openMinute: 0, closeMinute: 1440 });
    expect(toOutput(night)).toEqual({ dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00', closesNextDay: true, is24Hours: false });
    expect(toOutput(all)).toMatchObject({ opensAt: '00:00', closesAt: '24:00', is24Hours: true });
    expect(minutesToTime(1440)).toBe('24:00');
  });

  it('rejects invalid days, missing times and overlaps (including overnight wrap into the next day)', () => {
    expect(() => toStoredIntervals([{ dayOfWeek: 7, opensAt: '06:00', closesAt: '07:00' }])).toThrow(/dayOfWeek/);
    expect(() => toStoredIntervals([{ dayOfWeek: 1, opensAt: '06:00' }])).toThrow(/closesAt/);
    expect(() =>
      toStoredIntervals([
        { dayOfWeek: 1, opensAt: '06:00', closesAt: '12:00' },
        { dayOfWeek: 1, opensAt: '11:00', closesAt: '14:00' },
      ]),
    ).toThrow(/overlapping/);
    expect(() =>
      toStoredIntervals([
        { dayOfWeek: 5, opensAt: '22:00', closesAt: '04:00' },
        { dayOfWeek: 6, opensAt: '03:00', closesAt: '10:00' },
      ]),
    ).toThrow(/overlapping/);
    expect(() =>
      toStoredIntervals([
        { dayOfWeek: 6, opensAt: '22:00', closesAt: '04:00' }, // Saturday night → Sunday morning
        { dayOfWeek: 0, opensAt: '03:00', closesAt: '10:00' },
      ]),
    ).toThrow(/overlapping/);
  });

  it('evaluates open/closed including the part of an overnight interval after midnight', () => {
    const iv = toStoredIntervals([{ dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' }]);
    expect(isOpenAt(iv, { dayOfWeek: 5, minute: 17 * 60 + 59 })).toBe(false);
    expect(isOpenAt(iv, { dayOfWeek: 5, minute: 23 * 60 })).toBe(true);
    expect(isOpenAt(iv, { dayOfWeek: 6, minute: 60 })).toBe(true); // Saturday 01:00
    expect(isOpenAt(iv, { dayOfWeek: 6, minute: 120 })).toBe(false); // closes at 02:00
    expect(isOpenAt([], { dayOfWeek: 1, minute: 600 })).toBeNull(); // unknown
  });

  it('computes local time in Asia/Phnom_Penh (UTC+7, no DST)', () => {
    // 2026-11-25T17:30:00Z is Thursday 00:30 in Phnom Penh
    expect(phnomPenhNow(new Date('2026-11-25T17:30:00Z'))).toEqual({ dayOfWeek: 4, minute: 30 });
    // 2026-07-05T00:00:00Z is Sunday 07:00 in Phnom Penh
    expect(phnomPenhNow(new Date('2026-07-05T00:00:00Z'))).toEqual({ dayOfWeek: 0, minute: 420 });
  });
});
