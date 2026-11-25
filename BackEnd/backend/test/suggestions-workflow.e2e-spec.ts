import sharp from 'sharp';
import { SuggestionStatus, UserRole } from '../src/generated/prisma/client';
import { createTestApp, createToilet, createUser, resetDatabase, TestContext, testImage } from './support/test-app';

type U = Awaited<ReturnType<typeof createUser>>;

describe('WC submission → admin approval/rejection workflow (integration)', () => {
  let ctx: TestContext;
  let admin: U;
  let admin2: U;
  let contributor: U;
  let other: U;

  const baseSuggestion = {
    name: 'Wat Langka Side Gate Toilet',
    address: 'Street 51, near the side gate',
    district: 'Boeng Keng Kang',
    sangkat: 'Boeng Keng Kang I',
    latitude: 11.5541,
    longitude: 104.9256,
    accessType: 'PAID',
    priceKhr: 500,
    facilities: { hasWater: true, hasSoap: false, wheelchairAccessible: null },
    openingHours: [{ dayOfWeek: 1, opensAt: '06:00', closesAt: '20:00' }, { dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' }],
    notes: 'Ask the guard',
  };

  async function upload(user: U, n = 2, color = '#10B981') {
    let req = ctx.http().post('/api/uploads/suggestions').set(user.auth);
    for (let i = 0; i < n; i++) {
      req = req.attach('files', await testImage(i % 2 ? 'jpeg' : 'png', color.replace(/.$/, String(i)), true), `photo-${i}.${i % 2 ? 'jpg' : 'png'}`);
    }
    const res = await req.expect(201);
    return res.body.data as { id: string; url: string; expiresAt: string; attachBefore: string }[];
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    admin = await createUser(ctx, 'admin@wf.test', UserRole.ADMIN, 'Admin One');
    admin2 = await createUser(ctx, 'admin2@wf.test', UserRole.ADMIN, 'Admin Two');
    contributor = await createUser(ctx, 'contrib@wf.test', UserRole.USER, 'Sokha Chan');
    other = await createUser(ctx, 'other@wf.test', UserRole.USER, 'Other Person');
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('private uploads', () => {
    it('accepts JPG/PNG, re-encodes to WebP and strips EXIF metadata', async () => {
      const imgs = await upload(contributor, 2);
      expect(imgs).toHaveLength(2);
      expect(imgs[0].url).toMatch(/^https:\/\/storage\.test\.invalid\//);
      expect(new Date(imgs[0].expiresAt).getTime()).toBeGreaterThan(Date.now());
      const row = await ctx.prisma.suggestionImage.findUniqueOrThrow({ where: { id: imgs[0].id } });
      expect(row.suggestionId).toBeNull();
      expect(row.bucket).toBe('suggestion-images');
      expect(row.objectPath.startsWith(`${contributor.id}/`)).toBe(true);
      const stored = ctx.storage.objects.get(`${row.bucket}/${row.objectPath}`)!;
      expect(stored.contentType).toBe('image/webp');
      const meta = await sharp(stored.data).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
    });

    it('verifies real content, size and count', async () => {
      await ctx
        .http()
        .post('/api/uploads/suggestions')
        .set(contributor.auth)
        .attach('files', Buffer.from('not an image at all'), { filename: 'fake.jpg', contentType: 'image/jpeg' })
        .expect(415);
      const png = await testImage('png');
      await ctx
        .http()
        .post('/api/uploads/suggestions')
        .set(contributor.auth)
        .attach('files', png, { filename: 'a.gif', contentType: 'image/gif' })
        .expect(415);
      const corrupted = Buffer.concat([png.subarray(0, 40), Buffer.alloc(200)]);
      await ctx
        .http()
        .post('/api/uploads/suggestions')
        .set(contributor.auth)
        .attach('files', corrupted, { filename: 'c.png', contentType: 'image/png' })
        .expect(400);
      const big = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
      await ctx
        .http()
        .post('/api/uploads/suggestions')
        .set(contributor.auth)
        .attach('files', big, { filename: 'big.png', contentType: 'image/png' })
        .expect(413);
      let six = ctx.http().post('/api/uploads/suggestions').set(contributor.auth);
      for (let i = 0; i < 6; i++) six = six.attach('files', png, `p${i}.png`);
      await six.expect(400);
      await ctx.http().post('/api/uploads/suggestions').attach('files', png, 'anon.png').expect(401);
    });

    it('removes already-stored objects when a multi-file upload fails half way', async () => {
      const before = new Set(ctx.storage.objects.keys());
      ctx.storage.armFailure(1); // first object stored, second upload fails
      try {
        await ctx
          .http()
          .post('/api/uploads/suggestions')
          .set(other.auth)
          .attach('files', await testImage('png', '#111111'), 'x.png')
          .attach('files', await testImage('png', '#222222'), 'y.png')
          .expect(500);
      } finally {
        ctx.storage.disarmFailure();
      }
      const leaked = [...ctx.storage.objects.keys()].filter((k) => !before.has(k));
      expect(leaked).toEqual([]);
      expect(await ctx.prisma.suggestionImage.count({ where: { uploaderId: other.id } })).toBe(0);
    });

    it('returns the existing record for a duplicate upload', async () => {
      const img = await testImage('png', '#ABCDEF');
      const a = await ctx.http().post('/api/uploads/suggestions').set(other.auth).attach('files', img, 'd.png').expect(201);
      const b = await ctx.http().post('/api/uploads/suggestions').set(other.auth).attach('files', img, 'd.png').expect(201);
      expect(b.body.data[0].id).toBe(a.body.data[0].id);
      expect(b.body.data[0].duplicate).toBe(true);
    });
  });

  describe('submission', () => {
    let pendingId: string;
    let imageIds: string[];

    it('creates a PENDING suggestion, notifies admins and keeps it private', async () => {
      const imgs = await upload(contributor, 2, '#22C55E');
      imageIds = imgs.map((i) => i.id);
      const res = await ctx
        .http()
        .post('/api/toilet-suggestions')
        .set(contributor.auth)
        .send({ ...baseSuggestion, imageIds, coverImageId: imageIds[1] })
        .expect(201);
      expect(res.body.message).toBe('Your WC location has been submitted successfully and is waiting for administrator approval.');
      const s = res.body.data;
      pendingId = s.id;
      expect(s.status).toBe('PENDING');
      expect(s.images).toHaveLength(2);
      expect(s.coverImage.id).toBe(imageIds[1]);
      expect(s.openingHours[1]).toMatchObject({ dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00', closesNextDay: true });
      expect(s.publishedToiletId).toBeNull();

      const adminNotifs = await ctx.http().get('/api/me/notifications').set(admin.auth).expect(200);
      expect(adminNotifs.body.data.some((n: { type: string }) => n.type === 'SUGGESTION_SUBMITTED')).toBe(true);

      const pub = await ctx.http().get('/api/toilets?q=Langka').expect(200);
      expect(pub.body.meta.total).toBe(0);
      const near = await ctx.http().get('/api/toilets/nearby?lat=11.5541&lng=104.9256&radius=500').expect(200);
      expect(near.body.data).toHaveLength(0);
      await ctx.http().get(`/api/toilets/${pendingId}`).expect(404);
    });

    it('prevents others from reading the submission or re-using its photos', async () => {
      await ctx.http().get(`/api/me/toilet-suggestions/${pendingId}`).set(other.auth).expect(404);
      const mine = await ctx.http().get('/api/me/toilet-suggestions').set(other.auth).expect(200);
      expect(mine.body.data).toHaveLength(0);
      // Another user's (or already attached) image IDs are refused
      await ctx
        .http()
        .post('/api/toilet-suggestions')
        .set(other.auth)
        .send({ ...baseSuggestion, name: 'Copycat', imageIds: [imageIds[0]] })
        .expect(400);
      // Already attached images cannot be attached again even by the owner
      await ctx
        .http()
        .post('/api/toilet-suggestions')
        .set(contributor.auth)
        .send({ ...baseSuggestion, name: 'Again', imageIds: [imageIds[0]] })
        .expect(400);
    });

    it('rejects protected fields, invalid coordinates and price rules', async () => {
      await ctx.http().post('/api/toilet-suggestions').set(contributor.auth).send({ ...baseSuggestion, status: 'APPROVED' }).expect(400);
      await ctx.http().post('/api/toilet-suggestions').set(contributor.auth).send({ ...baseSuggestion, isVerified: true }).expect(400);
      await ctx.http().post('/api/toilet-suggestions').set(contributor.auth).send({ ...baseSuggestion, latitude: 48.85, longitude: 2.35 }).expect(400);
      await ctx.http().post('/api/toilet-suggestions').set(contributor.auth).send({ ...baseSuggestion, accessType: 'FREE', priceKhr: 500 }).expect(400);
      await ctx.http().post('/api/toilet-suggestions').set(contributor.auth).send({ ...baseSuggestion, priceKhr: 12.5 }).expect(400);
      await ctx.http().post('/api/toilet-suggestions').set(contributor.auth).send({ ...baseSuggestion, priceKhr: -1 }).expect(400);
      await ctx.http().post('/api/toilet-suggestions').send(baseSuggestion).expect(401);
    });

    it('only admins can list or review submissions; contributors see their own photos via signed URLs', async () => {
      await ctx.http().get('/api/admin/suggestions').set(contributor.auth).expect(403);
      await ctx.http().patch(`/api/admin/suggestions/${pendingId}/status`).set(contributor.auth).send({ status: 'APPROVED' }).expect(403);
      const own = await ctx.http().get(`/api/me/toilet-suggestions/${pendingId}`).set(contributor.auth).expect(200);
      expect(own.body.data.images[0].url).toMatch(/token=/);
      const list = await ctx.http().get('/api/admin/suggestions?status=PENDING').set(admin.auth).expect(200);
      expect(list.body.meta).toMatchObject({ page: 1, total: 1 });
      expect(list.body.data[0].contributor.email).toBe('contrib@wf.test');
    });

    it('approves atomically with corrections and publishes the WC and its photos', async () => {
      const res = await ctx
        .http()
        .patch(`/api/admin/suggestions/${pendingId}/status`)
        .set(admin.auth)
        .send({ status: 'APPROVED', reviewNote: 'Checked on site', corrections: { name: 'Wat Langka Public Toilet', priceKhr: 1000 } })
        .expect(200);
      const { suggestion, toilet } = res.body.data;
      expect(suggestion.status).toBe('APPROVED');
      expect(suggestion.publishedToiletId).toBe(toilet.id);
      expect(toilet).toMatchObject({ name: 'Wat Langka Public Toilet', priceKhr: 1000, isVerified: true, accessType: 'PAID' });
      expect(toilet.images).toHaveLength(2);
      expect(toilet.facilities.hasWater).toBe(true);
      expect(toilet.facilities.wheelchairAccessible).toBeNull();
      expect(toilet.openingHours).toHaveLength(2);

      // original submission data is preserved
      const raw = await ctx.prisma.toiletSuggestion.findUniqueOrThrow({ where: { id: pendingId } });
      expect(raw.name).toBe(baseSuggestion.name);
      expect(raw.reviewedById).toBe(admin.id);
      expect(raw.reviewedAt).not.toBeNull();

      const pub = await ctx.http().get(`/api/toilets/${toilet.id}`).expect(200);
      expect(pub.body.data.images).toHaveLength(2);
      expect(pub.body.data.coverImage.url).toMatch(/token=/);
      const near = await ctx.http().get('/api/toilets/nearby?lat=11.5541&lng=104.9256&radius=500').expect(200);
      expect(near.body.data.map((t: { id: string }) => t.id)).toContain(toilet.id);

      const notifs = await ctx.http().get('/api/me/notifications').set(contributor.auth).expect(200);
      expect(notifs.body.data[0]).toMatchObject({ type: 'SUGGESTION_APPROVED', isRead: false });
      expect(notifs.body.data[0].titleKm).toBeTruthy();
      const audit = await ctx.prisma.auditLog.count({ where: { action: 'suggestion.approved', entityId: pendingId, actorId: admin.id } });
      expect(audit).toBe(1);
    });

    it('answers a repeated approval with 409 and the published WC id', async () => {
      const again = await ctx.http().patch(`/api/admin/suggestions/${pendingId}/status`).set(admin2.auth).send({ status: 'APPROVED' }).expect(409);
      expect(again.body.details.status).toBe('APPROVED');
      expect(again.body.details.publishedToiletId).toBeTruthy();
      await ctx.http().patch(`/api/admin/suggestions/${pendingId}/status`).set(admin2.auth).send({ status: 'REJECTED', rejectionReason: 'Too late now' }).expect(409);
      expect(await ctx.prisma.toilet.count({ where: { sourceSuggestion: { id: pendingId } } })).toBe(1);
    });
  });

  it('concurrent approvals create exactly one toilet', async () => {
    const s = await ctx
      .http()
      .post('/api/toilet-suggestions')
      .set(contributor.auth)
      .send({ ...baseSuggestion, name: 'Concurrent Test WC', latitude: 11.5801, longitude: 104.9010 })
      .expect(201);
    const results = await Promise.all(
      [admin, admin2, admin, admin2, admin].map((a) =>
        ctx.http().patch(`/api/admin/suggestions/${s.body.data.id}/status`).set(a.auth).send({ status: 'APPROVED' }),
      ),
    );
    const codes = results.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(4);
    expect(await ctx.prisma.toilet.count({ where: { name: 'Concurrent Test WC' } })).toBe(1);
  });

  describe('rejection and correction', () => {
    let rejectedId: string;
    let photoIds: string[];

    it('requires a reason, notifies the contributor and keeps the location private', async () => {
      photoIds = (await upload(contributor, 2, '#F59E0B')).map((i) => i.id);
      const s = await ctx
        .http()
        .post('/api/toilet-suggestions')
        .set(contributor.auth)
        .send({ ...baseSuggestion, name: 'Rejected Riverside WC', latitude: 11.5702, longitude: 104.9301, imageIds: photoIds })
        .expect(201);
      rejectedId = s.body.data.id;
      await ctx.http().patch(`/api/admin/suggestions/${rejectedId}/status`).set(admin.auth).send({ status: 'REJECTED' }).expect(400);
      const res = await ctx
        .http()
        .patch(`/api/admin/suggestions/${rejectedId}/status`)
        .set(admin.auth)
        .send({ status: 'REJECTED', rejectionReason: 'The map pin is in the river.' })
        .expect(200);
      expect(res.body.data.suggestion.status).toBe('REJECTED');
      expect(res.body.data.toilet).toBeNull();
      const mine = await ctx.http().get(`/api/me/toilet-suggestions/${rejectedId}`).set(contributor.auth).expect(200);
      expect(mine.body.data.feedback.rejectionReason).toBe('The map pin is in the river.');
      const notifs = await ctx.http().get('/api/me/notifications?unreadOnly=true').set(contributor.auth).expect(200);
      expect(notifs.body.data[0]).toMatchObject({ type: 'SUGGESTION_REJECTED' });
      expect((await ctx.http().get('/api/toilets?q=Rejected').expect(200)).body.meta.total).toBe(0);
      await ctx.http().patch(`/api/admin/suggestions/${rejectedId}/status`).set(admin2.auth).send({ status: 'REJECTED', rejectionReason: 'Duplicate review' }).expect(409);
    });

    it('lets the contributor correct and resubmit while preserving history', async () => {
      const res = await ctx
        .http()
        .post('/api/toilet-suggestions')
        .set(contributor.auth)
        .send({
          ...baseSuggestion,
          name: 'Rejected Riverside WC (moved pin)',
          latitude: 11.5708,
          longitude: 104.9285,
          resubmittedFromId: rejectedId,
          retainedImageIds: [photoIds[0]],
        })
        .expect(201);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.resubmittedFromId).toBe(rejectedId);
      expect(res.body.data.images).toHaveLength(1);
      expect(res.body.data.history).toHaveLength(1);
      expect(res.body.data.history[0]).toMatchObject({ id: rejectedId, status: 'REJECTED', rejectionReason: 'The map pin is in the river.' });
      const original = await ctx.prisma.toiletSuggestion.findUniqueOrThrow({ where: { id: rejectedId } });
      expect(original.status).toBe(SuggestionStatus.REJECTED);
      // a rejected suggestion can only be resubmitted once; others cannot resubmit it
      await ctx.http().post('/api/toilet-suggestions').set(contributor.auth).send({ ...baseSuggestion, resubmittedFromId: rejectedId }).expect(409);
      await ctx.http().post('/api/toilet-suggestions').set(other.auth).send({ ...baseSuggestion, resubmittedFromId: rejectedId }).expect(404);
    });
  });

  it('flags possible duplicates for administrators', async () => {
    const existing = await createToilet(ctx, { name: 'Central Market North WC', latitude: 11.5699, longitude: 104.9208 });
    const s = await ctx
      .http()
      .post('/api/toilet-suggestions')
      .set(other.auth)
      .send({ ...baseSuggestion, name: 'Central Market North Toilet', latitude: 11.5701, longitude: 104.9209 })
      .expect(201);
    expect(s.body.data).not.toHaveProperty('duplicateCandidates');
    const detail = await ctx.http().get(`/api/admin/suggestions/${s.body.data.id}`).set(admin.auth).expect(200);
    expect(detail.body.data.hasPotentialDuplicate).toBe(true);
    expect(detail.body.data.duplicateCandidates[0]).toMatchObject({ kind: 'TOILET', id: existing.id });
    expect(detail.body.data.contributor.email).toBe('other@wf.test');
  });

  it('administrators cannot review their own submissions', async () => {
    const s = await ctx.http().post('/api/toilet-suggestions').set(admin.auth).send({ ...baseSuggestion, name: 'Admin Own WC', latitude: 11.60, longitude: 104.88 }).expect(201);
    await ctx.http().patch(`/api/admin/suggestions/${s.body.data.id}/status`).set(admin.auth).send({ status: 'APPROVED' }).expect(403);
    await ctx.http().patch(`/api/admin/suggestions/${s.body.data.id}/status`).set(admin2.auth).send({ status: 'APPROVED' }).expect(200);
  });

  it('moderation removes an inappropriate submission photo from storage', async () => {
    const [img] = await upload(other, 1, '#EF4444');
    const s = await ctx
      .http()
      .post('/api/toilet-suggestions')
      .set(other.auth)
      .send({ ...baseSuggestion, name: 'Moderated Photo WC', latitude: 11.53, longitude: 104.95, imageIds: [img.id] })
      .expect(201);
    const row = await ctx.prisma.suggestionImage.findUniqueOrThrow({ where: { id: img.id } });
    expect(ctx.storage.objects.has(`${row.bucket}/${row.objectPath}`)).toBe(true);
    const res = await ctx.http().delete(`/api/admin/suggestions/${s.body.data.id}/images/${img.id}?reason=Person%20visible`).set(admin.auth).expect(200);
    expect(res.body.data.images).toHaveLength(0);
    expect(res.body.data.removedImages[0].removedReason).toBe('Person visible');
    expect(ctx.storage.objects.has(`${row.bucket}/${row.objectPath}`)).toBe(false);
  });
});
