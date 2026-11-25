import { UserRole } from '../src/generated/prisma/client';
import { createTestApp, createToilet, createUser, resetDatabase, TestContext, testImage } from './support/test-app';

describe('Reviews, reports, favorites, notifications & admin WC management (e2e)', () => {
  let ctx: TestContext;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let alice: Awaited<ReturnType<typeof createUser>>;
  let bob: Awaited<ReturnType<typeof createUser>>;
  let toiletId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    admin = await createUser(ctx, 'admin@community.test', UserRole.ADMIN);
    alice = await createUser(ctx, 'alice@community.test', UserRole.USER, 'Alice Sok');
    bob = await createUser(ctx, 'bob@community.test', UserRole.USER, 'Bob Chea');
    toiletId = (await createToilet(ctx, { name: 'Community WC' })).id;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('reviews', () => {
    let aliceReview: string;

    it('enforces integer ratings 1–5 and one review per user/WC; recalculates averages', async () => {
      await ctx.http().post(`/api/toilets/${toiletId}/reviews`).set(alice.auth).send({ rating: 6, cleanlinessRating: 3 }).expect(400);
      await ctx.http().post(`/api/toilets/${toiletId}/reviews`).set(alice.auth).send({ rating: 3.5, cleanlinessRating: 3 }).expect(400);
      await ctx.http().post(`/api/toilets/${toiletId}/reviews`).send({ rating: 4, cleanlinessRating: 3 }).expect(401);
      const a = await ctx.http().post(`/api/toilets/${toiletId}/reviews`).set(alice.auth).send({ rating: 5, cleanlinessRating: 4, comment: 'Great' }).expect(201);
      aliceReview = a.body.data.id;
      const dup = await ctx.http().post(`/api/toilets/${toiletId}/reviews`).set(alice.auth).send({ rating: 1, cleanlinessRating: 1 }).expect(409);
      expect(dup.body.details.reviewId).toBe(aliceReview);
      await ctx.http().post(`/api/toilets/${toiletId}/reviews`).set(bob.auth).send({ rating: 2, cleanlinessRating: 1 }).expect(201);
      const t = await ctx.http().get(`/api/toilets/${toiletId}`).expect(200);
      expect(t.body.data).toMatchObject({ averageRating: 3.5, cleanlinessRating: 2.5, reviewCount: 2 });
    });

    it('lets only the author edit/delete; public list hides identity details', async () => {
      await ctx.http().patch(`/api/reviews/${aliceReview}`).set(bob.auth).send({ rating: 1 }).expect(403);
      await ctx.http().delete(`/api/reviews/${aliceReview}`).set(bob.auth).expect(403);
      await ctx.http().patch(`/api/reviews/${aliceReview}`).set(alice.auth).send({ rating: 4 }).expect(200);
      expect((await ctx.http().get(`/api/toilets/${toiletId}`)).body.data.averageRating).toBe(3);
      const pub = await ctx.http().get(`/api/toilets/${toiletId}/reviews`).expect(200);
      expect(pub.body.meta.total).toBe(2);
      expect(pub.body.data.map((r: { author: { displayName: string } }) => r.author.displayName).sort()).toEqual(['Alice S.', 'Bob C.']);
      expect(JSON.stringify(pub.body.data)).not.toMatch(/community\.test|userId/);
      const mine = await ctx.http().get('/api/me/reviews').set(alice.auth).expect(200);
      expect(mine.body.data[0].toilet.name).toBe('Community WC');
    });

    it('moderation hides reviews from the list and the averages', async () => {
      const bobReview = (await ctx.prisma.review.findFirstOrThrow({ where: { userId: bob.id } })).id;
      await ctx.http().patch(`/api/admin/reviews/${bobReview}/moderation`).set(alice.auth).send({ isHidden: true, reason: 'x' }).expect(403);
      await ctx.http().patch(`/api/admin/reviews/${bobReview}/moderation`).set(admin.auth).send({ isHidden: true, reason: 'Offensive language' }).expect(200);
      const t = await ctx.http().get(`/api/toilets/${toiletId}`).expect(200);
      expect(t.body.data).toMatchObject({ averageRating: 4, reviewCount: 1 });
      expect((await ctx.http().get(`/api/toilets/${toiletId}/reviews`)).body.meta.total).toBe(1);
      const n = await ctx.http().get('/api/me/notifications').set(bob.auth).expect(200);
      expect(n.body.data[0].type).toBe('REVIEW_MODERATED');
      await ctx.http().delete(`/api/reviews/${aliceReview}`).set(alice.auth).expect(200);
      const after = await ctx.http().get(`/api/toilets/${toiletId}`).expect(200);
      expect(after.body.data).toMatchObject({ averageRating: null, reviewCount: 0 });
    });
  });

  describe('maintenance reports and private photos', () => {
    let reportId: string;
    let imageId: string;

    it('attaches private photos and tracks status for the reporter only', async () => {
      const up = await ctx.http().post('/api/uploads/reports').set(alice.auth).attach('files', await testImage('jpeg', '#0EA5E9'), 'r.jpg').expect(201);
      imageId = up.body.data[0].id;
      await ctx.http().post(`/api/toilets/${toiletId}/reports`).set(bob.auth).send({ category: 'NO_SOAP', description: 'No soap at all', imageIds: [imageId] }).expect(400);
      await ctx.http().post(`/api/toilets/${toiletId}/reports`).set(alice.auth).send({ category: 'SMELLY', description: 'Bad smell' }).expect(400);
      const res = await ctx.http().post(`/api/toilets/${toiletId}/reports`).set(alice.auth).send({ category: 'NO_SOAP', description: 'No soap at all', imageIds: [imageId] }).expect(201);
      reportId = res.body.data.id;
      expect(res.body.data).toMatchObject({ status: 'PENDING', category: 'NO_SOAP' });
      expect(res.body.data.images[0].url).toMatch(/token=/);
      expect(res.body.data).not.toHaveProperty('reporter');
      await ctx.http().get(`/api/me/reports/${reportId}`).set(bob.auth).expect(404);
      expect((await ctx.http().get('/api/me/reports').set(bob.auth)).body.meta.total).toBe(0);
      await ctx.http().get(`/api/admin/reports/${reportId}`).set(bob.auth).expect(403);
      // Admins were notified because no manager is assigned
      const n = await ctx.http().get('/api/me/notifications').set(admin.auth).expect(200);
      expect(n.body.data.some((x: { type: string }) => x.type === 'REPORT_CREATED')).toBe(true);
    });

    it('never exposes report or pending photos through public endpoints', async () => {
      const row = await ctx.prisma.reportImage.findUniqueOrThrow({ where: { id: imageId } });
      ctx.storage.signedPaths.length = 0;
      await ctx.http().get(`/api/toilets/${toiletId}`).expect(200);
      await ctx.http().get(`/api/toilets/${toiletId}/images`).expect(200);
      await ctx.http().get('/api/toilets').expect(200);
      expect(ctx.storage.signedPaths).not.toContain(`${row.bucket}/${row.objectPath}`);
      expect(ctx.storage.signedPaths.every((p) => p.startsWith('toilet-images/'))).toBe(true);
    });

    it('admin status transitions are validated', async () => {
      await ctx.http().patch(`/api/admin/reports/${reportId}/status`).set(admin.auth).send({ status: 'PENDING' }).expect(400);
      await ctx.http().patch(`/api/admin/reports/${reportId}/status`).set(admin.auth).send({ status: 'IN_PROGRESS' }).expect(200);
      await ctx.http().patch(`/api/admin/reports/${reportId}/status`).set(admin.auth).send({ status: 'REJECTED', resolutionNote: 'Soap is available' }).expect(200);
      await ctx.http().patch(`/api/admin/reports/${reportId}/status`).set(admin.auth).send({ status: 'IN_PROGRESS' }).expect(200);
      const list = await ctx.http().get('/api/admin/reports?unresolved=true').set(admin.auth).expect(200);
      expect(list.body.data[0].statusHistory).toHaveLength(4);
    });
  });

  describe('favorites and notifications', () => {
    it('favorites are idempotent and per user', async () => {
      await ctx.http().post(`/api/me/favorites/${toiletId}`).set(alice.auth).expect(201);
      await ctx.http().post(`/api/me/favorites/${toiletId}`).set(alice.auth).expect(201);
      const list = await ctx.http().get('/api/me/favorites').set(alice.auth).expect(200);
      expect(list.body.meta.total).toBe(1);
      expect(list.body.data[0].toilet.id).toBe(toiletId);
      expect((await ctx.http().get(`/api/toilets/${toiletId}`).set(alice.auth)).body.data.isFavorite).toBe(true);
      expect((await ctx.http().get(`/api/toilets/${toiletId}`).set(bob.auth)).body.data.isFavorite).toBe(false);
      expect((await ctx.http().get('/api/me/favorites').set(bob.auth)).body.meta.total).toBe(0);
      await ctx.http().delete(`/api/me/favorites/${toiletId}`).set(alice.auth).expect(200);
      await ctx.http().delete(`/api/me/favorites/${toiletId}`).set(alice.auth).expect(200);
      expect((await ctx.http().get('/api/me/favorites').set(alice.auth)).body.meta.total).toBe(0);
    });

    it('users can only mark their own notifications read', async () => {
      const bobNotif = (await ctx.http().get('/api/me/notifications').set(bob.auth)).body.data[0];
      await ctx.http().patch(`/api/me/notifications/${bobNotif.id}/read`).set(alice.auth).expect(404);
      const r = await ctx.http().patch(`/api/me/notifications/${bobNotif.id}/read`).set(bob.auth).expect(200);
      expect(r.body.data.isRead).toBe(true);
      await ctx.http().patch('/api/me/notifications/read-all').set(admin.auth).expect(200);
      expect((await ctx.http().get('/api/me/notifications/unread-count').set(admin.auth)).body.data.unreadCount).toBe(0);
      const summary = await ctx.http().get('/api/me/summary').set(alice.auth).expect(200);
      expect(summary.body.data.reports).toMatchObject({ IN_PROGRESS: 1 });
    });
  });

  describe('admin WC management', () => {
    it('creates verified WCs, validates data, archives and restores', async () => {
      const body = {
        name: 'Admin Created WC',
        address: 'Street 19',
        district: 'Daun Penh',
        latitude: 11.571,
        longitude: 104.925,
        accessType: 'PAID',
        priceKhr: 500,
        facilities: { hasWater: true, wheelchairAccessible: false },
        openingHours: [{ dayOfWeek: 0, opensAt: '08:00', closesAt: '12:00' }, { dayOfWeek: 0, opensAt: '11:00', closesAt: '13:00' }],
      };
      await ctx.http().post('/api/admin/toilets').set(admin.auth).send(body).expect(400); // overlapping hours
      const res = await ctx.http().post('/api/admin/toilets').set(admin.auth).send({ ...body, openingHours: [{ dayOfWeek: 0, opensAt: '08:00', closesAt: '12:00' }] }).expect(201);
      const id = res.body.data.id;
      expect(res.body.data).toMatchObject({ isVerified: true, priceKhr: 500, archivedAt: null });
      await ctx.http().patch(`/api/admin/toilets/${id}`).set(admin.auth).send({ name: null }).expect(400);
      await ctx.http().patch(`/api/admin/toilets/${id}`).set(admin.auth).send({ accessType: 'FREE' }).expect(200).expect((r) => {
        expect(r.body.data.priceKhr).toBe(0);
      });
      await ctx.http().patch(`/api/admin/toilets/${id}`).set(admin.auth).send({ description: 'Updated', district: null }).expect(200).expect((r) => {
        expect(r.body.data.district).toBeNull();
      });
      await ctx.http().delete(`/api/admin/toilets/${id}?reason=Demolished`).set(admin.auth).expect(200);
      await ctx.http().delete(`/api/admin/toilets/${id}`).set(admin.auth).expect(409);
      await ctx.http().get(`/api/toilets/${id}`).expect(404);
      const archived = await ctx.http().get('/api/admin/toilets?archived=only').set(admin.auth).expect(200);
      expect(archived.body.data.map((t: { id: string }) => t.id)).toContain(id);
      await ctx.http().post(`/api/admin/toilets/${id}/restore`).set(admin.auth).expect(200);
      await ctx.http().get(`/api/toilets/${id}`).expect(200);
      const logs = await ctx.http().get(`/api/admin/audit-logs?entityId=${id}`).set(admin.auth).expect(200);
      expect(logs.body.data.map((l: { action: string }) => l.action)).toEqual(
        expect.arrayContaining(['toilet.created', 'toilet.updated', 'toilet.archived', 'toilet.restored']),
      );
    });

    it('dashboard and analytics return real counts', async () => {
      const dash = await ctx.http().get('/api/admin/dashboard').set(admin.auth).expect(200);
      expect(dash.body.data.users.total).toBe(3);
      expect(dash.body.data.toilets.verified).toBe(2);
      const an = await ctx.http().get('/api/admin/analytics?months=3').set(admin.auth).expect(200);
      expect(an.body.data.monthlyRegistrations).toHaveLength(3);
      expect(an.body.data.monthlyRegistrations[2].count).toBe(3);
      expect(an.body.data.ratingDistribution).toHaveLength(5);
    });
  });
});
