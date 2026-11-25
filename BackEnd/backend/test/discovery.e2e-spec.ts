import { AccessType, ToiletStatus } from '../src/generated/prisma/client';
import { phnomPenhNow } from '../src/common/utils/opening-hours';
import { ALL_DAYS_OPEN, createTestApp, createToilet, resetDatabase, TestContext } from './support/test-app';

describe('Public WC discovery (e2e)', () => {
  let ctx: TestContext;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    const now = phnomPenhNow();
    // An interval that is certainly closed now: 2 hours starting 6 hours from now (same weekday ring)
    const closedStart = (now.minute + 360) % 1440;
    const closedHours = [{ dayOfWeek: now.dayOfWeek, openMinute: closedStart, closeMinute: closedStart + 60 }].filter(
      (h) => !(h.openMinute <= now.minute && now.minute < h.closeMinute),
    );

    ids.near = (await createToilet(ctx, { name: 'Near Free WC', latitude: 11.5565, longitude: 104.9283, averageRating: 4.5, cleanlinessRating: 4, reviewCount: 2 }, ALL_DAYS_OPEN)).id;
    ids.mid = (await createToilet(ctx, { name: 'Mid Paid WC', latitude: 11.5600, longitude: 104.9300, accessType: AccessType.PAID, priceKhr: 500, averageRating: 3, cleanlinessRating: 2, reviewCount: 1 }, closedHours)).id;
    ids.far = (await createToilet(ctx, { name: 'Far Paid WC', latitude: 11.6200, longitude: 104.9100, accessType: AccessType.PAID, priceKhr: 2000 })).id;
    ids.maint = (await createToilet(ctx, { name: 'Maintenance WC', latitude: 11.5570, longitude: 104.9290, status: ToiletStatus.UNDER_MAINTENANCE }, ALL_DAYS_OPEN)).id;
    ids.unverified = (await createToilet(ctx, { name: 'Unverified WC', isVerified: false, verifiedAt: null, lastVerifiedAt: null })).id;
    ids.archived = (await createToilet(ctx, { name: 'Archived WC', archivedAt: new Date() })).id;
    for (let i = 0; i < 25; i++) {
      await createToilet(ctx, { name: `Bulk WC ${String(i).padStart(2, '0')}`, district: 'Sen Sok', latitude: 11.6 + i * 0.001, longitude: 104.88 });
    }
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('returns only verified, non-archived WCs with pagination meta', async () => {
    const res = await ctx.http().get('/api/toilets?limit=10&page=2').expect(200);
    expect(res.body).toMatchObject({ success: true, meta: { page: 2, limit: 10, total: 29, totalPages: 3 } });
    expect(res.body.data).toHaveLength(10);
    const all = await ctx.http().get('/api/toilets?limit=100').expect(200);
    const names = all.body.data.map((t: { name: string }) => t.name);
    expect(names).not.toContain('Unverified WC');
    expect(names).not.toContain('Archived WC');
    await ctx.http().get(`/api/toilets/${ids.unverified}`).expect(404);
    await ctx.http().get(`/api/toilets/${ids.archived}`).expect(404);
    await ctx.http().get('/api/toilets?limit=101').expect(400);
    await ctx.http().get('/api/toilets?page=0').expect(400);
  });

  it('filters by price, access, facilities, rating, district and text', async () => {
    const free = await ctx.http().get('/api/toilets?free=true&district=Daun%20Penh').expect(200);
    expect(free.body.data.map((t: { name: string }) => t.name).sort()).toEqual(['Maintenance WC', 'Near Free WC']);
    const cheap = await ctx.http().get('/api/toilets?maxPrice=1000&accessType=PAID').expect(200);
    expect(cheap.body.data.map((t: { name: string }) => t.name)).toEqual(['Mid Paid WC']);
    const rated = await ctx.http().get('/api/toilets?minRating=4').expect(200);
    expect(rated.body.data.map((t: { name: string }) => t.name)).toEqual(['Near Free WC']);
    const clean = await ctx.http().get('/api/toilets?minCleanliness=3&sort=cleanliness').expect(200);
    expect(clean.body.data).toHaveLength(1);
    const water = await ctx.http().get('/api/toilets?hasWater=true&limit=1').expect(200);
    expect(water.body.meta.total).toBe(29);
    const unknownAccessible = await ctx.http().get('/api/toilets?wheelchairAccessible=true').expect(200);
    expect(unknownAccessible.body.meta.total).toBe(0); // unknown is not "accessible"
    const q = await ctx.http().get('/api/toilets?q=mid%20paid').expect(200);
    expect(q.body.data[0].id).toBe(ids.mid);
    await ctx.http().get('/api/toilets?free=maybe').expect(400);
  });

  it('evaluates open-now in Asia/Phnom_Penh and treats unknown hours as unknown', async () => {
    const open = await ctx.http().get('/api/toilets?openNow=true').expect(200);
    expect(open.body.data.map((t: { id: string }) => t.id)).toEqual([ids.near]);
    const detail = await ctx.http().get(`/api/toilets/${ids.far}`).expect(200);
    expect(detail.body.data.openNow).toBeNull();
    expect(detail.body.data.openingHoursKnown).toBe(false);
    expect(detail.body.data.timezone).toBe('Asia/Phnom_Penh');
    const maint = await ctx.http().get(`/api/toilets/${ids.maint}`).expect(200);
    expect(maint.body.data.openNow).toBe(false);
    const closed = await ctx.http().get('/api/toilets?openNow=false').expect(200);
    const closedIds = closed.body.data.map((t: { id: string }) => t.id);
    expect(closedIds).toContain(ids.maint);
    expect(closedIds).not.toContain(ids.far); // unknown hours
  });

  it('nearby search sorts by approximate straight-line distance within the radius', async () => {
    const res = await ctx.http().get('/api/toilets/nearby?lat=11.5564&lng=104.9282&radius=1000').expect(200);
    const list = res.body.data as { id: string; distance: { meters: number; type: string } }[];
    expect(list.map((t) => t.id)).toEqual([ids.near, ids.maint, ids.mid]);
    expect(list[0].distance.type).toBe('STRAIGHT_LINE_APPROXIMATE');
    expect(list[0].distance.meters).toBeLessThan(30);
    for (let i = 1; i < list.length; i++) expect(list[i].distance.meters).toBeGreaterThanOrEqual(list[i - 1].distance.meters);
    expect(list.map((t) => t.id)).not.toContain(ids.far);
    const filtered = await ctx.http().get('/api/toilets/nearby?lat=11.5564&lng=104.9282&radius=1000&free=true&openNow=true').expect(200);
    expect(filtered.body.data.map((t: { id: string }) => t.id)).toEqual([ids.near]);
    await ctx.http().get('/api/toilets/nearby?lat=11.5564').expect(400);
    await ctx.http().get('/api/toilets/nearby?lat=95&lng=104.9').expect(400);
    await ctx.http().get('/api/toilets/nearby?lat=11.55&lng=104.92&radius=999999').expect(400);
  });

  it('search with lat/lng adds distance and supports sort=distance', async () => {
    const res = await ctx.http().get('/api/toilets?lat=11.6200&lng=104.9100&sort=distance&limit=1').expect(200);
    expect(res.body.data[0].id).toBe(ids.far);
    expect(res.body.data[0].distance.meters).toBeLessThan(5);
    await ctx.http().get('/api/toilets?sort=distance').expect(400);
  });

  it('exposes district counts and public stats without private data', async () => {
    const d = await ctx.http().get('/api/toilets/districts').expect(200);
    expect(d.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ district: 'Sen Sok', count: 25 })]),
    );
    const stats = await ctx.http().get('/api/stats').expect(200);
    expect(stats.body.data).toMatchObject({ verifiedToilets: 29, paidToilets: 2 });
    expect(JSON.stringify(stats.body.data)).not.toMatch(/@|email/);
  });

  it('health check reports database status', async () => {
    const res = await ctx.http().get('/api/health').expect(200);
    expect(res.body.data.services.database).toBe('up');
  });
});
