/**
 * Development seed for ToiletGo KH.
 *
 * - Creates/updates the administrator from ADMIN_EMAIL / ADMIN_PASSWORD (required).
 * - Creates FICTIONAL sample data in Phnom Penh: every sample WC has isSampleData = true and a name
 *   starting with "[Sample]". These are NOT real, verified facilities. Coordinates are generic points
 *   inside each Khan and do not mark real toilets.
 * - Sample users (manager + two citizens) use SEED_DEMO_PASSWORD, or a random password printed once.
 * - Optional (SEED_UPLOAD_IMAGES=true): generates ORIGINAL placeholder images labelled
 *   "Sample placeholder — not a real photo" and uploads them to Supabase Storage.
 *
 * Refuses to run when NODE_ENV=production. Re-running replaces the previous sample data.
 *
 *   npx prisma db seed
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  AccessType,
  Language,
  PrismaClient,
  ReportCategory,
  ReportStatus,
  SuggestionStatus,
  ToiletStatus,
  UserRole,
} from '../src/generated/prisma/client';

const SAMPLE_EMAIL_DOMAIN = 'sample.toiletgo.invalid';
const ARGON = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required for seeding (see .env.example).`);
  return v;
}

const hhmm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};
/** Builds stored intervals; close <= open means overnight. */
const daily = (open: string, close: string, days = [0, 1, 2, 3, 4, 5, 6]) =>
  days.map((d) => {
    const o = hhmm(open);
    let c = close === '24:00' ? 1440 : hhmm(close);
    if (c <= o) c += 1440;
    return { dayOfWeek: d, openMinute: o, closeMinute: c };
  });

interface SampleToilet {
  key: string;
  name: string;
  nameKm: string;
  district: string;
  sangkat: string;
  lat: number;
  lng: number;
  access: AccessType;
  price: number | null;
  status?: ToiletStatus;
  facilities: { hasWater: boolean | null; hasSoap: boolean | null; wheelchairAccessible: boolean | null; babyChanging: boolean | null; hasToiletPaper?: boolean | null };
  hours: { dayOfWeek: number; openMinute: number; closeMinute: number }[];
}

const TOILETS: SampleToilet[] = [
  { key: 'riverside', name: '[Sample] Riverside Promenade WC', nameKm: '[គំរូ] បង្គន់មាត់ទន្លេ', district: 'Daun Penh', sangkat: 'Chey Chumneah', lat: 11.5712, lng: 104.9268, access: AccessType.FREE, price: 0, facilities: { hasWater: true, hasSoap: true, wheelchairAccessible: true, babyChanging: false, hasToiletPaper: true }, hours: daily('06:00', '22:00') },
  { key: 'central-market', name: '[Sample] Central Market Area WC', nameKm: '[គំរូ] បង្គន់តំបន់ផ្សារធំថ្មី', district: 'Daun Penh', sangkat: 'Phsar Thmei I', lat: 11.5695, lng: 104.9205, access: AccessType.PAID, price: 500, facilities: { hasWater: true, hasSoap: false, wheelchairAccessible: false, babyChanging: false }, hours: daily('05:30', '19:00') },
  { key: 'independence', name: '[Sample] Independence Park WC', nameKm: '[គំរូ] បង្គន់សួនឯករាជ្យ', district: 'Chamkar Mon', sangkat: 'Tonle Basak', lat: 11.5552, lng: 104.9295, access: AccessType.FREE, price: 0, facilities: { hasWater: true, hasSoap: true, wheelchairAccessible: true, babyChanging: true, hasToiletPaper: true }, hours: daily('00:00', '24:00') },
  { key: 'bkk', name: '[Sample] BKK Shopping Street WC', nameKm: '[គំរូ] បង្គន់ផ្លូវបឹងកេងកង', district: 'Boeng Keng Kang', sangkat: 'Boeng Keng Kang I', lat: 11.5498, lng: 104.9212, access: AccessType.PAID, price: 1000, facilities: { hasWater: true, hasSoap: true, wheelchairAccessible: null, babyChanging: null }, hours: daily('18:00', '02:00') },
  { key: 'olympic', name: '[Sample] Stadium Gate WC', nameKm: '[គំរូ] បង្គន់ច្រកកីឡដ្ឋាន', district: '7 Makara', sangkat: 'Veal Vong', lat: 11.5589, lng: 104.9115, access: AccessType.PAID, price: 500, status: ToiletStatus.UNDER_MAINTENANCE, facilities: { hasWater: false, hasSoap: false, wheelchairAccessible: true, babyChanging: false }, hours: daily('06:00', '20:00') },
  { key: 'tuol-kouk', name: '[Sample] Tuol Kouk Community WC', nameKm: '[គំរូ] បង្គន់សហគមន៍ទួលគោក', district: 'Tuol Kouk', sangkat: 'Boeng Kak II', lat: 11.5822, lng: 104.8991, access: AccessType.UNKNOWN, price: null, facilities: { hasWater: null, hasSoap: null, wheelchairAccessible: null, babyChanging: null }, hours: [] },
  { key: 'sen-sok', name: '[Sample] Sen Sok Bus Stop WC', nameKm: '[គំរូ] បង្គន់ចំណតឡានក្រុងសែនសុខ', district: 'Sen Sok', sangkat: 'Phnom Penh Thmei', lat: 11.6011, lng: 104.8822, access: AccessType.FREE, price: 0, facilities: { hasWater: true, hasSoap: false, wheelchairAccessible: false, babyChanging: false }, hours: daily('05:00', '21:00', [1, 2, 3, 4, 5, 6]) },
  { key: 'chbar-ampov', name: '[Sample] Chbar Ampov Riverside WC', nameKm: '[គំរូ] បង្គន់មាត់ទន្លេច្បារអំពៅ', district: 'Chbar Ampov', sangkat: 'Nirouth', lat: 11.5333, lng: 104.9481, access: AccessType.PAID, price: 500, status: ToiletStatus.CLOSED, facilities: { hasWater: true, hasSoap: true, wheelchairAccessible: false, babyChanging: false }, hours: daily('07:00', '18:00') },
  { key: 'chroy-changvar', name: '[Sample] Chroy Changvar Park WC', nameKm: '[គំរូ] បង្គន់សួនច្បារជ្រោយចង្វារ', district: 'Chroy Changvar', sangkat: 'Chroy Changvar', lat: 11.5911, lng: 104.9383, access: AccessType.FREE, price: 0, facilities: { hasWater: true, hasSoap: true, wheelchairAccessible: true, babyChanging: true, hasToiletPaper: false }, hours: daily('06:00', '21:00') },
  { key: 'mean-chey', name: '[Sample] Mean Chey Market WC', nameKm: '[គំរូ] បង្គន់ផ្សារមានជ័យ', district: 'Mean Chey', sangkat: 'Stueng Mean Chey', lat: 11.5215, lng: 104.9288, access: AccessType.PAID, price: 300, facilities: { hasWater: true, hasSoap: null, wheelchairAccessible: false, babyChanging: null }, hours: daily('05:00', '18:30') },
];

async function placeholderImage(label: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <rect width="1200" height="800" fill="#ECFDF5"/>
  <rect x="40" y="40" width="1120" height="720" rx="32" fill="#FFFFFF" stroke="#059669" stroke-width="6"/>
  <circle cx="600" cy="300" r="90" fill="#059669"/>
  <text x="600" y="322" font-family="sans-serif" font-size="72" font-weight="700" fill="#FFFFFF" text-anchor="middle">WC</text>
  <text x="600" y="470" font-family="sans-serif" font-size="44" font-weight="700" fill="#064E3B" text-anchor="middle">${label.replace(/[<>&]/g, '')}</text>
  <text x="600" y="560" font-family="sans-serif" font-size="36" fill="#64748B" text-anchor="middle">Sample placeholder — not a real photo</text>
  <text x="600" y="620" font-family="sans-serif" font-size="30" fill="#64748B" text-anchor="middle">Fictional development data · ToiletGo KH</text>
</svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed sample data with NODE_ENV=production.');
  }
  const databaseUrl = process.env.DIRECT_URL || requireEnv('DATABASE_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    // ── Administrator ──────────────────────────────────────────────
    const adminEmail = requireEnv('ADMIN_EMAIL').trim().toLowerCase();
    const adminPassword = requireEnv('ADMIN_PASSWORD');
    if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      create: {
        email: adminEmail,
        passwordHash: await argon2.hash(adminPassword, ARGON),
        fullName: process.env.ADMIN_NAME || 'ToiletGo Administrator',
        role: UserRole.ADMIN,
      },
      update: { role: UserRole.ADMIN, isActive: true, passwordHash: await argon2.hash(adminPassword, ARGON) },
    });
    console.log(`✔ Administrator ready: ${admin.email}`);

    // ── Reset previous sample data ─────────────────────────────────
    // Users first: their suggestions (which may reference sample WCs) are deleted with them.
    const removedUsers = await prisma.user.deleteMany({ where: { email: { endsWith: `@${SAMPLE_EMAIL_DOMAIN}` } } });
    const removedToilets = await prisma.toilet.deleteMany({ where: { isSampleData: true } });
    if (removedToilets.count || removedUsers.count) {
      console.log(`↺ Removed previous sample data (${removedToilets.count} WCs, ${removedUsers.count} users).`);
    }

    // ── Sample users ───────────────────────────────────────────────
    const demoPassword = process.env.SEED_DEMO_PASSWORD || `Demo-${randomBytes(6).toString('base64url')}1`;
    const demoHash = await argon2.hash(demoPassword, ARGON);
    const mkUser = (local: string, fullName: string, role: UserRole, lang: Language = Language.EN) =>
      prisma.user.create({
        data: { email: `${local}@${SAMPLE_EMAIL_DOMAIN}`, passwordHash: demoHash, fullName, role, preferredLanguage: lang },
      });
    const manager = await mkUser('manager', 'Sample Manager Dara', UserRole.MANAGER);
    const sokha = await mkUser('sokha', 'Sample User Sokha', UserRole.USER, Language.KM);
    const alex = await mkUser('alex', 'Sample Tourist Alex', UserRole.USER);

    // ── Sample verified WCs (fictional) ────────────────────────────
    const now = new Date();
    const toilets: Record<string, string> = {};
    for (const t of TOILETS) {
      const created = await prisma.toilet.create({
        data: {
          name: t.name,
          nameKm: t.nameKm,
          description: 'Fictional sample record for development and testing. This is not a real, verified facility.',
          address: `Fictional address, Sangkat ${t.sangkat}, Khan ${t.district}, Phnom Penh`,
          province: 'Phnom Penh',
          district: t.district,
          sangkat: t.sangkat,
          latitude: t.lat,
          longitude: t.lng,
          accessType: t.access,
          priceKhr: t.access === AccessType.FREE ? 0 : t.price,
          status: t.status ?? ToiletStatus.OPEN,
          isVerified: true,
          verifiedAt: now,
          lastVerifiedAt: now,
          verifiedById: admin.id,
          createdById: admin.id,
          isSampleData: true,
          notes: 'Sample data',
          facility: { create: { hasToiletPaper: null, ...t.facilities } },
          openingHours: { create: t.hours },
        },
      });
      toilets[t.key] = created.id;
    }
    console.log(`✔ ${TOILETS.length} fictional sample WCs created (isSampleData = true).`);

    // Manager assignments
    for (const key of ['riverside', 'central-market', 'olympic']) {
      await prisma.managerAssignment.create({ data: { managerId: manager.id, toiletId: toilets[key], assignedById: admin.id } });
    }
    await prisma.cleaningSchedule.createMany({
      data: [
        { toiletId: toilets.riverside, dayOfWeek: 1, startMinute: hhmm('07:00'), assignedTo: 'Sample cleaning team A', createdById: manager.id },
        { toiletId: toilets.riverside, dayOfWeek: 4, startMinute: hhmm('15:30'), assignedTo: 'Sample cleaning team A', createdById: manager.id },
        { toiletId: toilets['central-market'], dayOfWeek: 0, startMinute: hhmm('06:00'), assignedTo: 'Sample cleaning team B', createdById: manager.id },
      ],
    });
    await prisma.cleaningLog.createMany({
      data: [
        { toiletId: toilets.riverside, loggedById: manager.id, cleanedAt: new Date(Date.now() - 86_400_000), notes: 'Sample log: floors and basins cleaned', waterRefilled: true, soapRefilled: true },
        { toiletId: toilets['central-market'], loggedById: manager.id, cleanedAt: new Date(Date.now() - 3 * 86_400_000), notes: 'Sample log', soapRefilled: false },
      ],
    });

    // ── Reviews (aggregates recalculated below) ────────────────────
    const reviews = [
      { t: 'riverside', u: sokha.id, rating: 5, clean: 4, comment: 'Sample review: clean and easy to find.' },
      { t: 'riverside', u: alex.id, rating: 4, clean: 4, comment: 'Sample review: good for tourists.' },
      { t: 'central-market', u: alex.id, rating: 3, clean: 2, comment: 'Sample review: busy at noon.' },
      { t: 'independence', u: sokha.id, rating: 5, clean: 5, comment: 'Sample review: open all day.' },
      { t: 'bkk', u: sokha.id, rating: 2, clean: 2, comment: 'Sample review (hidden by moderation example).', hidden: true },
    ];
    for (const r of reviews) {
      await prisma.review.create({
        data: {
          toiletId: toilets[r.t],
          userId: r.u,
          rating: r.rating,
          cleanlinessRating: r.clean,
          comment: r.comment,
          isHidden: !!r.hidden,
          hiddenReason: r.hidden ? 'Sample moderation' : null,
          moderatedById: r.hidden ? admin.id : null,
          moderatedAt: r.hidden ? now : null,
        },
      });
    }
    for (const id of Object.values(toilets)) {
      const agg = await prisma.review.aggregate({ where: { toiletId: id, isHidden: false }, _avg: { rating: true, cleanlinessRating: true }, _count: { _all: true } });
      await prisma.toilet.update({
        where: { id },
        data: {
          averageRating: agg._avg.rating === null ? null : Math.round(agg._avg.rating * 100) / 100,
          cleanlinessRating: agg._avg.cleanlinessRating === null ? null : Math.round(agg._avg.cleanlinessRating * 100) / 100,
          reviewCount: agg._count._all,
        },
      });
    }

    // ── Reports in every status ────────────────────────────────────
    const reportSpecs = [
      { t: 'riverside', u: sokha.id, cat: ReportCategory.NO_SOAP, status: ReportStatus.PENDING, desc: 'Sample report: soap dispenser empty.' },
      { t: 'central-market', u: alex.id, cat: ReportCategory.DIRTY, status: ReportStatus.IN_PROGRESS, desc: 'Sample report: floor needs cleaning.' },
      { t: 'olympic', u: sokha.id, cat: ReportCategory.NO_WATER, status: ReportStatus.RESOLVED, desc: 'Sample report: no running water.', note: 'Sample resolution: water pump repaired.' },
      { t: 'independence', u: alex.id, cat: ReportCategory.INCORRECT_PRICE, status: ReportStatus.REJECTED, desc: 'Sample report: asked to pay 500 riel.', note: 'Sample resolution: confirmed free of charge.' },
    ];
    for (const r of reportSpecs) {
      const closed = r.status === ReportStatus.RESOLVED || r.status === ReportStatus.REJECTED;
      const report = await prisma.report.create({
        data: {
          toiletId: toilets[r.t],
          reporterId: r.u,
          category: r.cat,
          description: r.desc,
          status: r.status,
          resolutionNote: r.note ?? null,
          resolvedAt: closed ? now : null,
          resolvedById: closed ? manager.id : null,
        },
      });
      await prisma.reportStatusHistory.create({ data: { reportId: report.id, fromStatus: null, toStatus: ReportStatus.PENDING, changedById: r.u } });
      if (r.status !== ReportStatus.PENDING) {
        await prisma.reportStatusHistory.create({ data: { reportId: report.id, fromStatus: ReportStatus.PENDING, toStatus: r.status, note: r.note ?? null, changedById: manager.id } });
      }
    }

    // ── Suggestions in every status ────────────────────────────────
    const suggestionBase = {
      province: 'Phnom Penh',
      description: 'Fictional sample submission for development.',
      notes: 'Sample data',
    };
    await prisma.toiletSuggestion.create({
      data: {
        ...suggestionBase,
        contributorId: sokha.id,
        status: SuggestionStatus.PENDING,
        name: '[Sample] Russey Keo Pagoda Area WC',
        address: 'Fictional address, Khan Russey Keo, Phnom Penh',
        district: 'Russey Keo',
        sangkat: 'Russey Keo',
        latitude: 11.6188,
        longitude: 104.9112,
        accessType: AccessType.FREE,
        priceKhr: 0,
        hasWater: true,
        openingHours: daily('06:00', '18:00'),
      },
    });
    await prisma.toiletSuggestion.create({
      data: {
        ...suggestionBase,
        contributorId: alex.id,
        status: SuggestionStatus.PENDING,
        name: '[Sample] Riverside Promenade Toilet',
        address: 'Fictional address next to the sample riverside WC (duplicate example)',
        district: 'Daun Penh',
        latitude: 11.5714,
        longitude: 104.9270,
        accessType: AccessType.UNKNOWN,
        hasPotentialDuplicate: true,
        duplicateCandidates: [{ kind: 'TOILET', id: toilets.riverside, name: '[Sample] Riverside Promenade WC', distanceMeters: 30, nameSimilarity: 0.8, reason: 'VERY_CLOSE', isVerified: true, archived: false }],
      },
    });
    await prisma.toiletSuggestion.create({
      data: {
        ...suggestionBase,
        contributorId: sokha.id,
        status: SuggestionStatus.APPROVED,
        name: '[Sample] Chroy Changvar Park WC',
        address: 'Fictional address, Khan Chroy Changvar, Phnom Penh',
        district: 'Chroy Changvar',
        latitude: 11.5911,
        longitude: 104.9383,
        accessType: AccessType.FREE,
        priceKhr: 0,
        publishedToiletId: toilets['chroy-changvar'],
        reviewedById: admin.id,
        reviewedAt: now,
        reviewNote: 'Sample approval.',
      },
    });
    const rejected = await prisma.toiletSuggestion.create({
      data: {
        ...suggestionBase,
        contributorId: alex.id,
        status: SuggestionStatus.REJECTED,
        name: '[Sample] Dangkao Roadside WC',
        address: 'Fictional address, Khan Dangkao, Phnom Penh',
        district: 'Dangkao',
        latitude: 11.4952,
        longitude: 104.8811,
        accessType: AccessType.PAID,
        priceKhr: 500,
        reviewedById: admin.id,
        reviewedAt: now,
        rejectionReason: 'Sample rejection: the pin is in the middle of the road; please move it to the building.',
      },
    });
    await prisma.toiletSuggestion.create({
      data: {
        ...suggestionBase,
        contributorId: alex.id,
        status: SuggestionStatus.PENDING,
        name: '[Sample] Dangkao Roadside WC (corrected)',
        address: 'Fictional address, Khan Dangkao, Phnom Penh',
        district: 'Dangkao',
        latitude: 11.4958,
        longitude: 104.8806,
        accessType: AccessType.PAID,
        priceKhr: 500,
        resubmittedFromId: rejected.id,
      },
    });
    console.log('✔ Sample reviews, reports (all statuses) and suggestions (PENDING / APPROVED / REJECTED / resubmitted).');

    // ── Optional placeholder images ────────────────────────────────
    if (process.env.SEED_UPLOAD_IMAGES === 'true') {
      const url = requireEnv('SUPABASE_URL');
      const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
      const bucket = process.env.SUPABASE_TOILET_BUCKET || 'toilet-images';
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      let uploaded = 0;
      for (const t of TOILETS) {
        const buf = await placeholderImage(t.name.replace('[Sample] ', ''));
        const path = `toilets/${toilets[t.key]}/${randomUUID()}.webp`;
        const { error } = await supabase.storage.from(bucket).upload(path, buf, { contentType: 'image/webp', upsert: false });
        if (error) {
          console.warn(`⚠ Placeholder upload failed (${error.message}); continuing without images.`);
          break;
        }
        const meta = await sharp(buf).metadata();
        const img = await prisma.toiletImage.create({
          data: {
            toiletId: toilets[t.key],
            bucket,
            objectPath: path,
            mimeType: 'image/webp',
            sizeBytes: buf.length,
            width: meta.width,
            height: meta.height,
            sha256: createHash('sha256').update(buf).digest('hex'),
            caption: 'Sample placeholder — not a real photo',
            uploadedById: admin.id,
          },
        });
        await prisma.toilet.update({ where: { id: toilets[t.key] }, data: { coverImageId: img.id } });
        uploaded++;
      }
      console.log(`✔ Uploaded ${uploaded} labelled placeholder images to ${bucket}.`);
    } else {
      console.log('ℹ No images seeded (set SEED_UPLOAD_IMAGES=true to upload labelled placeholders to Supabase Storage).');
    }

    console.log('\nSample accounts (development only):');
    for (const u of [manager, sokha, alex]) console.log(`  ${u.role.padEnd(7)} ${u.email}`);
    console.log(
      process.env.SEED_DEMO_PASSWORD
        ? '  Password: value of SEED_DEMO_PASSWORD'
        : `  Password (generated for this run): ${demoPassword}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error('✖ Seed failed:', (e as Error).message || e);
  process.exit(1);
});
