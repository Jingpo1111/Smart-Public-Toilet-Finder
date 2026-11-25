import { UserRole } from '../src/generated/prisma/client';
import { createTestApp, createToilet, createUser, resetDatabase, TestContext, testImage } from './support/test-app';

describe('Facility managers & cross-resource access (e2e)', () => {
  let ctx: TestContext;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let manager: Awaited<ReturnType<typeof createUser>>;
  let user: Awaited<ReturnType<typeof createUser>>;
  let toiletA: string;
  let toiletB: string;
  let reportA: string;
  let reportB: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    admin = await createUser(ctx, 'admin@mgr.test', UserRole.ADMIN);
    manager = await createUser(ctx, 'manager@mgr.test', UserRole.MANAGER, 'Dara Manager');
    user = await createUser(ctx, 'user@mgr.test', UserRole.USER, 'Reporter Person');
    toiletA = (await createToilet(ctx, { name: 'Managed WC A' })).id;
    toiletB = (await createToilet(ctx, { name: 'Unmanaged WC B', latitude: 11.57 })).id;

    await ctx.http().post('/api/admin/manager-assignments').set(admin.auth).send({ managerId: manager.id, toiletId: toiletA }).expect(201);
    await ctx.http().post('/api/admin/manager-assignments').set(admin.auth).send({ managerId: manager.id, toiletId: toiletA }).expect(409);
    await ctx.http().post('/api/admin/manager-assignments').set(admin.auth).send({ managerId: user.id, toiletId: toiletB }).expect(400);

    reportA = (await ctx.http().post(`/api/toilets/${toiletA}/reports`).set(user.auth).send({ category: 'NO_WATER', description: 'No water today.' }).expect(201)).body.data.id;
    reportB = (await ctx.http().post(`/api/toilets/${toiletB}/reports`).set(user.auth).send({ category: 'DIRTY', description: 'Very dirty floor.' }).expect(201)).body.data.id;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('USER cannot use manager or admin APIs', async () => {
    await ctx.http().get('/api/manager/dashboard').set(user.auth).expect(403);
    await ctx.http().get('/api/manager/toilets').set(user.auth).expect(403);
    await ctx.http().get('/api/admin/users').set(user.auth).expect(403);
    await ctx.http().get('/api/admin/users').set(manager.auth).expect(403);
    await ctx.http().post('/api/admin/toilets').set(manager.auth).send({ name: 'X', address: 'Some address', latitude: 11.5, longitude: 104.9 }).expect(403);
  });

  it('lists and shows only assigned WCs', async () => {
    const list = await ctx.http().get('/api/manager/toilets').set(manager.auth).expect(200);
    expect(list.body.data.map((t: { id: string }) => t.id)).toEqual([toiletA]);
    await ctx.http().get(`/api/manager/toilets/${toiletA}`).set(manager.auth).expect(200);
    await ctx.http().get(`/api/manager/toilets/${toiletB}`).set(manager.auth).expect(403);
    const dash = await ctx.http().get('/api/manager/dashboard').set(manager.auth).expect(200);
    expect(dash.body.data).toMatchObject({ assignedToilets: 1, unresolvedReports: 1 });
  });

  it('updates permitted fields on assigned WCs only', async () => {
    const res = await ctx
      .http()
      .patch(`/api/manager/toilets/${toiletA}`)
      .set(manager.auth)
      .send({ status: 'UNDER_MAINTENANCE', facilities: { hasSoap: true }, openingHours: [{ dayOfWeek: 1, is24Hours: true }] })
      .expect(200);
    expect(res.body.data.status).toBe('UNDER_MAINTENANCE');
    expect(res.body.data.facilities.hasSoap).toBe(true);
    expect(res.body.data.facilities.hasWater).toBe(true); // unchanged
    expect(res.body.data.openingHours[0]).toMatchObject({ dayOfWeek: 1, is24Hours: true, closesAt: '24:00' });
    await ctx.http().patch(`/api/manager/toilets/${toiletA}`).set(manager.auth).send({ name: 'Renamed' }).expect(400);
    await ctx.http().patch(`/api/manager/toilets/${toiletA}`).set(manager.auth).send({ latitude: 11.6 }).expect(400);
    await ctx.http().patch(`/api/manager/toilets/${toiletA}`).set(manager.auth).send({ isVerified: false }).expect(400);
    await ctx.http().patch(`/api/manager/toilets/${toiletB}`).set(manager.auth).send({ status: 'CLOSED' }).expect(403);
    const b = await ctx.prisma.toilet.findUniqueOrThrow({ where: { id: toiletB } });
    expect(b.status).toBe('OPEN');
  });

  it('enforces the assignment for photo uploads and deletion', async () => {
    const png = await testImage('png', '#3B82F6');
    await ctx.http().post('/api/uploads/toilets').set(manager.auth).field('toiletId', toiletB).attach('files', png, 'b.png').expect(403);
    await ctx.http().post('/api/uploads/toilets').set(user.auth).field('toiletId', toiletA).attach('files', png, 'a.png').expect(403);
    const up = await ctx.http().post('/api/uploads/toilets').set(manager.auth).field('toiletId', toiletA).field('setAsCover', 'true').attach('files', png, 'a.png').expect(201);
    const imageId = up.body.data[0].id;
    await ctx.http().post('/api/uploads/toilets').set(manager.auth).field('toiletId', toiletA).attach('files', png, 'a.png').expect(409);
    const pub = await ctx.http().get(`/api/toilets/${toiletA}`).expect(200);
    expect(pub.body.data.coverImage.id).toBe(imageId);
    await ctx.http().delete(`/api/manager/toilets/${toiletB}/images/${imageId}`).set(manager.auth).expect(403);
    await ctx.http().delete(`/api/manager/toilets/${toiletA}/images/${imageId}`).set(manager.auth).expect(200);
    expect((await ctx.http().get(`/api/toilets/${toiletA}`).expect(200)).body.data.coverImage).toBeNull();
  });

  it('sees and resolves reports of assigned WCs only, without reporter e-mail', async () => {
    const list = await ctx.http().get('/api/manager/reports').set(manager.auth).expect(200);
    expect(list.body.data.map((r: { id: string }) => r.id)).toEqual([reportA]);
    expect(list.body.data[0].reporter).toEqual({ displayName: 'Reporter P.' });
    await ctx.http().get(`/api/manager/reports/${reportB}`).set(manager.auth).expect(403);
    await ctx.http().patch(`/api/manager/reports/${reportB}/status`).set(manager.auth).send({ status: 'RESOLVED', resolutionNote: 'x' }).expect(403);
    await ctx.http().patch(`/api/manager/reports/${reportA}/status`).set(manager.auth).send({ status: 'RESOLVED' }).expect(400);
    const res = await ctx.http().patch(`/api/manager/reports/${reportA}/status`).set(manager.auth).send({ status: 'RESOLVED', resolutionNote: 'Pump repaired' }).expect(200);
    expect(res.body.data.status).toBe('RESOLVED');
    expect(res.body.data.statusHistory.map((h: { toStatus: string }) => h.toStatus)).toEqual(['PENDING', 'RESOLVED']);
    await ctx.http().patch(`/api/manager/reports/${reportA}/status`).set(manager.auth).send({ status: 'REJECTED', resolutionNote: 'no' }).expect(400);
    const mine = await ctx.http().get(`/api/me/reports/${reportA}`).set(user.auth).expect(200);
    expect(mine.body.data).toMatchObject({ status: 'RESOLVED', resolutionNote: 'Pump repaired' });
    const notifs = await ctx.http().get('/api/me/notifications').set(user.auth).expect(200);
    expect(notifs.body.data[0].type).toBe('REPORT_STATUS_CHANGED');
    // admin sees reporter contact
    const adminView = await ctx.http().get(`/api/admin/reports/${reportB}`).set(admin.auth).expect(200);
    expect(adminView.body.data.reporter.email).toBe('user@mgr.test');
  });

  it('cleaning schedules/logs and QR links are scoped to assignments', async () => {
    const sched = await ctx.http().post(`/api/manager/toilets/${toiletA}/cleaning-schedules`).set(manager.auth).send({ dayOfWeek: 2, startTime: '07:30', assignedTo: 'Team A' }).expect(201);
    expect(sched.body.data.startTime).toBe('07:30');
    await ctx.http().post(`/api/manager/toilets/${toiletB}/cleaning-schedules`).set(manager.auth).send({ dayOfWeek: 2, startTime: '07:30' }).expect(403);
    await ctx.http().patch(`/api/manager/cleaning-schedules/${sched.body.data.id}`).set(manager.auth).send({ startTime: '08:00' }).expect(200);
    await ctx.http().post(`/api/manager/toilets/${toiletA}/cleaning-logs`).set(manager.auth).send({ notes: 'Done', soapRefilled: true }).expect(201);
    await ctx.http().post(`/api/manager/toilets/${toiletB}/cleaning-logs`).set(manager.auth).send({ notes: 'Nope' }).expect(403);
    await ctx.http().post(`/api/manager/toilets/${toiletA}/cleaning-logs`).set(manager.auth).send({ cleanedAt: new Date(Date.now() + 86_400_000).toISOString() }).expect(400);
    const logs = await ctx.http().get('/api/manager/cleaning-logs').set(manager.auth).expect(200);
    expect(logs.body.meta.total).toBe(1);
    const qr = await ctx.http().get(`/api/manager/toilets/${toiletA}/qr`).set(manager.auth).expect(200);
    expect(qr.body.data.url).toBe(`http://localhost:5173/toilets/${toiletA}?feedback=1`);
    expect(qr.body.data.svg).toContain('<svg');
    expect(qr.body.data.pngDataUrl).toMatch(/^data:image\/png;base64,/);
    await ctx.http().get(`/api/manager/toilets/${toiletB}/qr`).set(manager.auth).expect(403);
  });

  it('loses access when unassigned or demoted', async () => {
    const assignments = await ctx.http().get(`/api/admin/manager-assignments?managerId=${manager.id}`).set(admin.auth).expect(200);
    await ctx.http().delete(`/api/admin/manager-assignments/${assignments.body.data[0].id}`).set(admin.auth).expect(200);
    await ctx.http().get(`/api/manager/toilets/${toiletA}`).set(manager.auth).expect(403);
    await ctx.http().patch(`/api/admin/users/${manager.id}/role`).set(admin.auth).send({ role: 'USER' }).expect(200);
    await ctx.http().get('/api/manager/toilets').set(manager.auth).expect(403);
  });
});
