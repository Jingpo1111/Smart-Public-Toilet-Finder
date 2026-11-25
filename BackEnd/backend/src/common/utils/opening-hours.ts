/**
 * Opening-hours model (all times are local Asia/Phnom_Penh, UTC+7, no DST).
 *
 * Each interval is stored as { dayOfWeek, openMinute, closeMinute } where minutes are counted from
 * local midnight of `dayOfWeek`. closeMinute may exceed 1440: 18:00–02:00 on Friday is stored as
 * Friday 1080–1560, i.e. it continues into Saturday morning.
 *
 * - No intervals at all → schedule UNKNOWN (openNow = null).
 * - Intervals exist → times not covered are closed.
 */
export const PHNOM_PENH_TZ = 'Asia/Phnom_Penh';
export const MINUTES_PER_DAY = 1440;

export interface StoredInterval {
  dayOfWeek: number;
  openMinute: number;
  closeMinute: number;
}

export interface OpeningHourInput {
  dayOfWeek: number;
  opensAt?: string;
  closesAt?: string;
  is24Hours?: boolean;
}

export interface OpeningHourOutput {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  closesNextDay: boolean;
  is24Hours: boolean;
}

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export function timeToMinutes(value: string): number {
  if (!TIME_PATTERN.test(value)) throw new Error(`Invalid time "${value}", expected HH:mm`);
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (minutes > 0 && m === 0 && minutes % MINUTES_PER_DAY === 0) return '24:00';
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Converts API input to stored intervals.
 * - is24Hours → 00:00–24:00.
 * - closesAt <= opensAt → overnight (closes next day). opensAt == closesAt means a full 24 h from opensAt.
 * Throws Error with a readable message on invalid or overlapping input.
 */
export function toStoredIntervals(input: OpeningHourInput[]): StoredInterval[] {
  const intervals = input.map((h, i) => {
    if (!Number.isInteger(h.dayOfWeek) || h.dayOfWeek < 0 || h.dayOfWeek > 6) {
      throw new Error(`openingHours[${i}].dayOfWeek must be an integer 0 (Sunday) … 6 (Saturday)`);
    }
    if (h.is24Hours) return { dayOfWeek: h.dayOfWeek, openMinute: 0, closeMinute: MINUTES_PER_DAY };
    if (!h.opensAt || !h.closesAt) {
      throw new Error(`openingHours[${i}] requires opensAt and closesAt, or is24Hours: true`);
    }
    const open = timeToMinutes(h.opensAt);
    let close = timeToMinutes(h.closesAt);
    if (open === MINUTES_PER_DAY) throw new Error(`openingHours[${i}].opensAt cannot be 24:00`);
    if (close <= open) close += MINUTES_PER_DAY; // overnight
    return { dayOfWeek: h.dayOfWeek, openMinute: open, closeMinute: close };
  });

  // Reject overlaps on a continuous weekly timeline (handles overnight wrap-around).
  const WEEK = 7 * MINUTES_PER_DAY;
  const spans = intervals
    .flatMap((iv) => {
      const start = iv.dayOfWeek * MINUTES_PER_DAY + iv.openMinute;
      const end = iv.dayOfWeek * MINUTES_PER_DAY + iv.closeMinute;
      return end > WEEK ? [[start, WEEK] as const, [0, end - WEEK] as const] : [[start, end] as const];
    })
    .sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i][0] < spans[i - 1][1]) throw new Error('openingHours contains overlapping intervals');
  }
  return intervals;
}

export function toOutput(iv: StoredInterval): OpeningHourOutput {
  return {
    dayOfWeek: iv.dayOfWeek,
    opensAt: minutesToTime(iv.openMinute),
    closesAt: minutesToTime(iv.closeMinute),
    closesNextDay: iv.closeMinute > MINUTES_PER_DAY,
    is24Hours: iv.openMinute === 0 && iv.closeMinute === MINUTES_PER_DAY,
  };
}

/** Current day of week (0 = Sunday) and minute of day in Asia/Phnom_Penh. */
export function phnomPenhNow(date: Date = new Date()): { dayOfWeek: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PHNOM_PENH_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { dayOfWeek: days.indexOf(get('weekday')), minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

/**
 * Whether the schedule is open at the given local time.
 * Returns null when the schedule is unknown (no intervals).
 */
export function isOpenAt(intervals: StoredInterval[], at: { dayOfWeek: number; minute: number }): boolean | null {
  if (intervals.length === 0) return null;
  const yesterday = (at.dayOfWeek + 6) % 7;
  return intervals.some(
    (iv) =>
      (iv.dayOfWeek === at.dayOfWeek && iv.openMinute <= at.minute && at.minute < iv.closeMinute) ||
      (iv.dayOfWeek === yesterday && at.minute + MINUTES_PER_DAY < iv.closeMinute),
  );
}

/** Prisma `where` fragment matching OpeningHour rows that are open at the given local time. */
export function openNowIntervalFilter(at: { dayOfWeek: number; minute: number }) {
  const yesterday = (at.dayOfWeek + 6) % 7;
  return {
    OR: [
      { dayOfWeek: at.dayOfWeek, openMinute: { lte: at.minute }, closeMinute: { gt: at.minute } },
      { dayOfWeek: yesterday, closeMinute: { gt: at.minute + MINUTES_PER_DAY } },
    ],
  };
}
