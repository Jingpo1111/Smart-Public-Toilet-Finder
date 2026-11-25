# ToiletGo KH — Backend API

REST API for **ToiletGo KH — Smart Public Toilet Finder in Cambodia** (pilot: Phnom Penh).
Residents and tourists find verified public WCs, contribute missing locations with photos, review them and report
maintenance problems; administrators verify submissions; facility managers maintain their assigned WCs.

- Currency **KHR** (non-negative integer riel) · Timezone **Asia/Phnom_Penh** · Languages **English / Khmer**
- Base URL `http://localhost:3000/api` · Swagger UI `http://localhost:3000/api/docs` · OpenAPI JSON `/api/docs-json`
  and the exported [`openapi.json`](./openapi.json)
- Runs directly with Node.js and npm. **No Docker.**

## Contents

1. [Stack](#stack) · 2. [Project structure](#project-structure) · 3. [Supabase setup](#supabase-setup) ·
4. [Local installation](#local-installation) · 5. [Environment variables](#environment-variables) ·
6. [Frontend contract](#frontend-integration-contract) · 7. [Endpoints](#endpoints) ·
8. [Differences from FrontEnd.md / BackEnd.md](#differences-from-frontendmd--backendmd) · 9. [Security](#security-and-privacy) ·
10. [Testing](#testing) · 11. [Production](#production-deployment-ubuntu-no-docker) · 12. [Status & limitations](#verification-status-and-known-limitations)

## Stack

| Concern | Choice (installed version) |
|---|---|
| Runtime | Node.js ≥ 22.12 (developed on Node 26), npm |
| Framework | NestJS **11.2** (CommonJS). NestJS 12 is ESM-only; 11 was chosen for a stable Jest/ts-jest setup |
| Language | TypeScript 5.9 (strict) |
| Database | PostgreSQL on Supabase, **Prisma ORM 7.10** with the `@prisma/adapter-pg` driver adapter and `prisma.config.ts` |
| Storage | Supabase Storage (private buckets, signed URLs) via `@supabase/supabase-js` 2 |
| Auth | `@nestjs/jwt` + Passport JWT (HS256 only), Argon2id password hashing |
| Validation / docs | class-validator, class-transformer, `@nestjs/swagger` (CLI plugin) |
| Security | Helmet, restricted CORS, `@nestjs/throttler`, CSRF header + Origin checks, HttpOnly cookies |
| Images | `sharp` (content verification, EXIF stripping, WebP re-encoding, resizing) |
| Mail | Nodemailer (SMTP) |
| Tests | Jest 30, ts-jest, Supertest |

## Project structure

```text
backend/
├── prisma/
│   ├── schema.prisma          # 19 models, 8 enums, indexes, unique constraints
│   ├── migrations/            # init (incl. CHECK constraints, partial unique index) + Supabase RLS lock-down
│   └── seed.ts                # admin from env + fictional sample data
├── prisma.config.ts           # Prisma 7 config (datasource for CLI, seed command)
├── scripts/
│   ├── export-openapi.ts      # npm run openapi:export → openapi.json
│   ├── setup-storage.ts       # npm run storage:setup → creates private buckets
│   └── create-admin.ts        # npm run admin:create → admin from env, no sample data (production-safe)
├── src/
│   ├── auth/                  # register/login/refresh/logout, JWT strategy, tokens, passwords
│   ├── users/                 # /me/profile, /me/summary
│   ├── toilets/               # public discovery, admin/manager WC management, images
│   ├── toilet-suggestions/    # user submissions, duplicate detection, approval/rejection
│   ├── reviews/  reports/  favorites/  notifications/
│   ├── admin/                 # /admin/* (users, roles, suggestions, WCs, assignments, moderation)
│   ├── manager/               # /manager/* + ManagerAccessService (assignment enforcement)
│   ├── storage/               # StorageService (Supabase), signed URLs, orphan-safe deletion
│   ├── uploads/               # multipart uploads, image processing, quotas, cleanup job
│   ├── analytics/             # dashboards, analytics, public stats
│   ├── mail/  audit/  health/  prisma/  config/
│   ├── common/                # guards, decorators, filters, interceptors, utils, pagination
│   ├── generated/prisma/      # generated Prisma client (git-ignored; created by npm install)
│   ├── app.module.ts  app.setup.ts  swagger.ts  main.ts
├── test/                      # e2e/integration suites + test doubles
├── ecosystem.config.cjs       # optional PM2 config
├── openapi.json               # exported specification for the frontend
└── .env.example
```

## Supabase setup

1. **Create a Supabase project** (one for development, a separate one for production — never share databases).
2. **Database URLs** (Project Settings → Database → Connection string):
   - `DATABASE_URL` — *Transaction pooler* (port **6543**), used by the running API.
   - `DIRECT_URL` — *Session pooler* (port **5432**) or the direct connection, used by `prisma migrate` and the seed.
     Migrations must not run through the transaction pooler.
3. **API keys** (Project Settings → API): copy the project URL to `SUPABASE_URL` and the **service_role** key to
   `SUPABASE_SERVICE_ROLE_KEY`. This key stays on the server; the frontend never needs it.
4. **Buckets** — run `npm run storage:setup`, or create them manually in Storage with *Public bucket = off*:
   `toilet-images`, `suggestion-images`, `report-images`, `avatars` (5 MB limit, `image/webp, image/jpeg, image/png`).
5. **Policies** — do **not** add public-read or anon/authenticated policies. The API uses the service-role key and
   decides access in PostgreSQL; clients only receive short-lived signed URLs (default 1 h). Without policies,
   Supabase's anon key cannot read these buckets, which is the intended state.
6. **Row Level Security**: Supabase grants `anon`/`authenticated` access to `public` tables by default, which would expose
   them through its auto-generated REST API. The migration `…_supabase_rls_lockdown` enables RLS on every table with
   **no policies** and revokes those grants. The API is unaffected because it connects as the table owner (the role in
   `DATABASE_URL`/`DIRECT_URL`), which bypasses RLS. Enable RLS on any table added by future migrations as well.

## Local installation

```bash
cd backend
cp .env.example .env            # fill in DATABASE_URL, DIRECT_URL, JWT secrets, Supabase, ADMIN_*
npm install                     # also runs `prisma generate`
npx prisma generate
npx prisma migrate dev --name init   # applies prisma/migrations (creates nothing new if already in sync)
npx prisma db seed              # admin from ADMIN_EMAIL/ADMIN_PASSWORD + fictional sample data
npm run storage:setup           # once per Supabase project
npm run start:dev
```

- API `http://localhost:3000/api`, Swagger `http://localhost:3000/api/docs`, health `http://localhost:3000/api/health`.
- `npm install` on npm ≥ 11 may print *"install scripts blocked"* for `argon2`, `@prisma/engines`, `esbuild`. All of
  them ship prebuilt binaries and work without the scripts (verified here); approve them with
  `npm install-scripts approve <pkg>` if your platform needs a source build.
- Generate secrets with `openssl rand -base64 48` (use two different values for `JWT_SECRET` / `JWT_REFRESH_SECRET`).

### Seed data

`npx prisma db seed` (configured in `prisma.config.ts` as `tsx prisma/seed.ts`):

- creates or updates the administrator from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (≥ 12 characters);
- creates **fictional** sample data: 10 WCs in different Khans of Phnom Penh, all with `isSampleData: true` and names
  starting with `[Sample]` — they are **not real facilities**; facilities with known/unknown values; opening hours
  including overnight (18:00–02:00), 24 h and unknown; reviews (one hidden); reports in every status; suggestions in
  every status including a rejected one with a corrected resubmission; a sample manager with assignments, cleaning
  schedules and logs;
- sample accounts use `SEED_DEMO_PASSWORD`, or a random password printed once;
- `SEED_UPLOAD_IMAGES=true` uploads **original generated placeholder images** labelled “Sample placeholder — not a real
  photo”. No internet images are used;
- refuses to run when `NODE_ENV=production`; re-running replaces previous sample data.

The frontend should display a “sample data” label when `isSampleData` is `true`.

## Environment variables

See [`.env.example`](./.env.example). Values are validated at startup (`src/config/env.validation.ts`); the process
exits with a list of problems if something is missing or unsafe (e.g. secrets shorter than 32 characters, identical
access/refresh secrets, `COOKIE_SAMESITE=none` without `COOKIE_SECURE=true`).

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Runtime connection (transaction pooler) |
| `DIRECT_URL` | for CLI | Migrations/seed (session pooler or direct) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | yes | ≥ 32 chars, different |
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | no | `15m` / `7d` |
| `JWT_ISSUER` / `JWT_AUDIENCE` | no | `toiletgo-kh` / `toiletgo-kh-web`; verified on every token |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side only |
| `SUPABASE_*_BUCKET` | no | Bucket names (defaults as in BackEnd.md) |
| `SIGNED_URL_EXPIRES_IN` | no | Signed image URL lifetime in seconds (default 3600) |
| `FRONTEND_URL` | yes | Comma-separated allowed origins; the first is used in e-mail/QR links |
| `COOKIE_SAMESITE`, `COOKIE_SECURE`, `COOKIE_DOMAIN` | no | Refresh-cookie attributes |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `SMTP_FROM` | for password reset | Without SMTP, `/auth/forgot-password` returns **503** |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | seed only | |
| `TRUST_PROXY` | no | Number of reverse proxies (for correct client IPs in rate limiting) |
| `THROTTLE_LIMIT` | no | Default requests/minute per IP (120); auth/upload routes have stricter limits |
| `SWAGGER_ENABLED` | no | Defaults to on outside production |

## Frontend integration contract

### Response envelope

```json
{ "success": true, "data": {}, "message": "Request completed successfully" }
```

Paginated endpoints (query `page` ≥ 1, `limit` 1–100, default 20):

```json
{ "success": true, "data": [], "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }, "message": "…" }
```

Errors (never contain stack traces or SQL):

```json
{ "success": false, "statusCode": 400, "error": "Bad Request", "message": "Validation failed",
  "details": [{ "field": "latitude", "errors": ["latitude must be within Cambodia"] }],
  "path": "/api/toilet-suggestions", "timestamp": "2026-11-25T11:00:00.000Z" }
```

Status codes used: 400 validation/business rule, 401 missing/invalid/expired token, 403 role/ownership/assignment or
CSRF failure, 404 not found **or not visible to you**, 409 conflict (duplicate review, already-processed suggestion,
duplicate assignment), 413 file too large, 415 unsupported image, 429 rate limit/upload quota, 503 SMTP or database
unavailable. Unknown request properties are rejected with 400 (mass-assignment protection).

### Authentication (chosen contract)

1. `POST /auth/register` or `POST /auth/login` → `data = { accessToken, tokenType: "Bearer", expiresIn, user }` **and**
   `Set-Cookie: tg_refresh=…; HttpOnly; Path=/api/auth; SameSite=Lax` (`Secure` in production).
2. Keep `accessToken` **in memory** and send `Authorization: Bearer <token>`. Never store it in localStorage.
3. On 401, call **`POST /auth/refresh` with `withCredentials: true` and header `X-CSRF-Protection: 1`** — one shared
   in-flight request — then retry the original request once. On page load, call refresh to restore the session.
   Each refresh **rotates** the cookie. A rotated token presented again (outside a 10 s multi-tab grace window) revokes
   the whole session family. If refresh fails, clear the session and redirect to login.
4. `POST /auth/logout` (credentials + `X-CSRF-Protection: 1`) revokes the session; `POST /auth/logout-all` (Bearer)
   revokes every session.
5. `user.role` comes from the database. Role changes and deactivation take effect on the next request.
6. Axios: `withCredentials: true` is required for `/auth/refresh` and `/auth/logout` (it is harmless elsewhere).
   CORS allows only `FRONTEND_URL` origins, with credentials.
7. Password reset e-mails link to `FRONTEND_URL/reset-password?token=…`; post `{ token, newPassword }` to
   `/auth/reset-password`. Tokens are single-use and expire after `PASSWORD_RESET_EXPIRES_MINUTES` (30).

### Image uploads (two-step, unambiguous)

1. Upload files with `multipart/form-data`, field name **`files`** (1–5 files; avatar uses a single field **`file`**).
   JPG/JPEG, PNG or WebP, ≤ 5 MB each. Do not set the multipart boundary manually — let the browser/Axios set it.
2. The response lists `{ id, url, expiresAt, width, height, sizeBytes, attachBefore, duplicate }`.
3. Reference the IDs in the JSON body within 24 h: `POST /toilet-suggestions { …, imageIds, coverImageId }` or
   `POST /toilets/:id/reports { …, imageIds }`. Unattached uploads are deleted automatically after 24 h.
4. Admins/assigned managers upload straight to a WC: `POST /uploads/toilets` (fields `toiletId`, optional
   `setAsCover`, `caption`, `files`).

All images are stored privately and re-encoded to WebP (EXIF/GPS removed). API responses contain **signed URLs with
`expiresAt`**; refetch the resource (or `GET /toilets/:id/images`) when they expire. Suggestion photos are visible only
to the contributor and administrators until approval; report photos only to the reporter, administrators and the
assigned managers.

Show the contributor warning: *do not photograph people using toilets, private areas or personally identifying
material.*

### Locations, distance and opening hours

- Query parameters are **`lat`**, **`lng`** and **`radius`** (metres). `GET /toilets/nearby?lat=11.5564&lng=104.9282&radius=2000`.
- `distance = { meters, type: "STRAIGHT_LINE_APPROXIMATE", note }` — Haversine straight-line distance, **not** walking
  distance. Use external directions for routes. User coordinates are never stored.
- Opening hours: `[{ dayOfWeek (0 = Sunday), opensAt "HH:mm", closesAt "HH:mm", closesNextDay, is24Hours }]` in
  Asia/Phnom_Penh. Input `closesAt <= opensAt` means overnight; `is24Hours: true` means all day.
  An empty list means **unknown**: then `openingHoursKnown = false` and `openNow = null` (do not show “open now”).
- Facilities (`hasWater`, `hasSoap`, `wheelchairAccessible`, `babyChanging`, …) are `true`, `false` or `null` (unknown).
- Prices: `priceKhr` integer riel; `FREE` → 0, `PAID` → > 0 or `null` (unknown amount), `UNKNOWN` → `null`.

## Endpoints

All paths are relative to `/api`. **G** = guest, **U** = any authenticated user, **M** = MANAGER (assigned WCs only),
**A** = ADMIN. Admins may also call `/manager/*` for any WC. Full request/response schemas: Swagger.

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | /auth/register · /auth/login | G | Create USER account / log in (sets refresh cookie) |
| POST | /auth/refresh · /auth/logout | cookie + CSRF header | Rotate session / revoke session |
| POST | /auth/logout-all | U | Revoke all sessions |
| GET | /auth/me | U | Current account |
| POST | /auth/forgot-password · /auth/reset-password | G | Password reset by e-mail |
| GET/PATCH | /me/profile | U | Profile (fullName, phone, preferredLanguage) |
| POST | /me/change-password | U | Change password (returns new session) |
| GET | /me/summary | U | Dashboard counters |
| GET | /toilets | G | Search/filter verified WCs (`q, district, sangkat, province, accessType, free, maxPrice, openNow, wheelchairAccessible, hasWater, hasSoap, babyChanging, minRating, minCleanliness, status, lat, lng, radius, sort, order, page, limit`) |
| GET | /toilets/nearby | G | Nearby verified WCs (`lat, lng, radius` + filters) |
| GET | /toilets/districts | G | Districts with WC counts |
| GET | /toilets/:id | G | WC details (`isFavorite` when authenticated; optional `lat,lng`) |
| GET | /toilets/:id/images | G | Fresh signed photo URLs |
| GET/POST | /toilets/:id/reviews | G / U | Public reviews / create review |
| PATCH/DELETE | /reviews/:id | U (author) | Edit/delete own review |
| GET | /me/reviews | U | Own reviews |
| POST | /toilets/:id/reports | U | Report a problem |
| GET | /me/reports · /me/reports/:id | U | Own reports with history |
| POST | /toilet-suggestions | U | Submit a WC location (always PENDING) |
| GET | /me/toilet-suggestions · /:id | U | Own submissions, feedback, history |
| GET | /me/favorites · POST/DELETE /me/favorites/:toiletId | U | Favorites (idempotent) |
| GET | /me/notifications · /unread-count | U | Notifications |
| PATCH | /me/notifications/:id/read · /read-all | U | Mark read |
| POST/DELETE | /uploads/suggestions · /uploads/suggestions/:id | U | Private suggestion photos |
| POST/DELETE | /uploads/reports · /uploads/reports/:id | U | Private report photos |
| POST | /uploads/toilets | M/A | WC photos |
| POST/DELETE | /uploads/avatar | U | Avatar |
| GET | /admin/dashboard · /admin/analytics | A | Statistics (`months` for analytics) |
| GET | /admin/users · /admin/users/:id | A | Users |
| PATCH | /admin/users/:id/role · /admin/users/:id/status | A | Change role / (de)activate |
| GET | /admin/suggestions · /admin/suggestions/:id | A | Review queue / details with duplicates |
| PATCH | /admin/suggestions/:id/status | A | `{ status: APPROVED, corrections?, publishImageIds?, coverImageId?, reviewNote? }` or `{ status: REJECTED, rejectionReason }` |
| DELETE | /admin/suggestions/:id/images/:imageId | A | Moderate a submission photo |
| GET/POST | /admin/toilets | A | Inventory (`archived=exclude\|include\|only`) / create verified WC |
| GET/PATCH/DELETE | /admin/toilets/:id | A | Details / update / archive (`?reason=`) |
| POST | /admin/toilets/:id/restore · /verify | A | Restore archived WC / record re-verification |
| GET · PATCH · DELETE | /admin/toilets/:id/images · /cover · /images/:imageId | A | Photo management |
| GET/POST | /admin/manager-assignments · DELETE /:id | A | Manager assignments |
| GET | /admin/reports · /admin/reports/:id · PATCH /:id/status | A | Reports |
| GET | /admin/reviews · PATCH /admin/reviews/:id/moderation · DELETE /admin/reviews/:id | A | Review moderation |
| GET | /admin/audit-logs | A | Audit trail |
| GET | /manager/dashboard · /manager/toilets · /manager/toilets/:id | M | Assigned WCs |
| PATCH | /manager/toilets/:id | M | Description, status, access/price, facilities, opening hours |
| GET · PATCH · DELETE | /manager/toilets/:id/images · /cover · /images/:imageId | M | Photos |
| GET | /manager/toilets/:id/qr | M | Feedback QR (SVG + PNG data URL) |
| GET/POST | /manager/toilets/:id/cleaning-schedules · GET /manager/cleaning-schedules | M | Cleaning schedule |
| PATCH/DELETE | /manager/cleaning-schedules/:scheduleId | M | Edit/delete slot |
| GET/POST | /manager/toilets/:id/cleaning-logs · GET /manager/cleaning-logs | M | Cleaning history |
| GET | /manager/reports · /manager/reports/:id · PATCH /:id/status | M | Reports of assigned WCs |
| GET | /stats | G | Aggregate public statistics |
| GET | /health | G | Health (503 if the database is down) |

Approval returns `{ suggestion, toilet }`. A second or concurrent approval/rejection returns **409** with
`details: { status, publishedToiletId, reviewedAt }`, so the UI can refresh and show who won.

## Differences from FrontEnd.md / BackEnd.md

The repository had no root `README.md` and no existing frontend code, so `BackEnd.md` and `FrontEnd.md` are the
contract. Every path listed in both documents exists with the same name. Additions and clarifications:

| Topic | Decision |
|---|---|
| Location of code | Built in `BackEnd/backend/` (BackEnd.md: “build inside `backend/`”) |
| Refresh token | HttpOnly cookie `tg_refresh` only (not in the JSON body); refresh/logout require `X-CSRF-Protection: 1` + credentials |
| Upload format | Separate upload step returning IDs, then JSON with `imageIds` (no multipart on `/toilet-suggestions`) |
| Profile | Added `GET /me/profile` (same data as `/auth/me`) and `GET /me/summary` |
| Supporting endpoints | `/auth/logout-all`, `/toilets/districts`, `/toilets/:id/images`, `/me/reports/:id`, `/me/notifications/unread-count`, `/me/notifications/read-all`, upload deletion, admin users detail/status, suggestion photo moderation, admin WC restore/verify/images/cover, assignment list/delete, admin report detail, review moderation/delete, audit logs, manager WC detail/images/cover/QR, cleaning schedules/logs CRUD, manager report detail, `/stats` |
| Review moderation | `PATCH /admin/reviews/:id/moderation { isHidden, reason }` (hidden reviews excluded from averages) |
| Archive | `DELETE /admin/toilets/:id` archives (soft delete) with optional `?reason=` |
| Status names | `PATCH /admin/suggestions/:id/status` handles both approve and reject; `PATCH …/reports/:id/status` for reports |
| Report categories | `DIRTY, NO_WATER, NO_SOAP, BROKEN_DOOR, BROKEN_EQUIPMENT, INCORRECT_LOCATION, INCORRECT_PRICE, CLOSED, OTHER` |
| Public review authors | Shown as “First L.” with avatar — no user id or e-mail |
| Notifications | Bilingual `title/message` + `titleKm/messageKm`, plus `type` and `data` for client-side i18n |
| Extra model | `ReportStatusHistory` (status history required by §10 of BackEnd.md) |
| Sample data flag | `isSampleData` on WCs so the UI can label fictional seed records |

## Security and privacy

- **Tokens**: HS256 only (`alg: none` and other algorithms rejected), issuer/audience/expiry verified; role and
  `tokenVersion` read from the database on every request, so tampered role claims, role changes, password changes and
  deactivation take effect immediately. Refresh tokens are stored as SHA-256 hashes, rotated on use, with reuse
  detection that revokes the session family. Password-reset tokens are hashed, single-use and short-lived.
- **Passwords**: Argon2id (19 MiB, t=2, p=1). Hashes are never selected into API responses.
- **CSRF**: only JSON bodies are parsed (no URL-encoded forms), the refresh cookie is SameSite and path-scoped, and
  cookie-authenticated routes require `X-CSRF-Protection: 1` plus an allow-listed Origin/Referer.
- **Authorization**: global JWT guard (opt-out with `@Public()`), role guard, ownership checks (own reviews, reports,
  submissions, notifications return 404/403 for others) and `ManagerAccessService` on every manager query, mutation
  and upload.
- **Mass assignment**: global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`; status, role, verification
  and contributor fields are always set by the server.
- **Queries**: Prisma parameterised queries; the few raw queries use tagged templates (bound parameters).
- **Rate limiting**: 120 req/min/IP by default; stricter limits on login (10), register (5), forgot-password (3),
  uploads (20), submissions/reviews/reports (10). The store is in-memory per process.
- **Uploads**: MIME allow-list + magic bytes + full decode with sharp, 5 MB/5 files, 40 MP decompression limit,
  metadata stripped, generated object names, quotas (20 unattached, 60/day), duplicate detection, cleanup of orphans.
- **Privacy**: GPS coordinates sent to `/nearby` are not stored; public statistics are aggregates only; reporter e-mails
  only visible to admins; public reviews show reduced names.
- **Headers**: Helmet (CSP, frameguard, no `x-powered-by`; HSTS in production); CORS restricted to `FRONTEND_URL`.
- **Audit log**: auth events, submissions, approvals/rejections, WC changes, assignments, role changes, moderation.

## Testing

```bash
npm run lint            # ESLint (type-aware)
npm run typecheck       # tsc --noEmit
npx prisma validate
npm test                # unit tests (no DB/network)
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/toiletgo_test npm run test:e2e
npm run build
npm run openapi:export  # regenerates openapi.json
```

The e2e suites boot the real Nest application against a real PostgreSQL database. They refuse to run unless the
database name contains `test` and the host is not Supabase. `prisma migrate deploy` is applied automatically and all
tables are truncated per suite. Supabase Storage and SMTP are replaced by in-memory doubles
(`test/support/in-memory-storage.ts`); nothing external is contacted.

Covered: registration/login, refresh rotation and reuse detection, CSRF, logout, tampered/unsigned/foreign/expired/
wrong-audience JWTs, role checks and live role changes, deactivation, profile mass-assignment, change/reset password and
SMTP-unavailable behaviour, search/filters/sorting/pagination, open-now in Asia/Phnom_Penh (incl. overnight),
nearby/radius, visibility of unverified/archived WCs, upload validation (fake content, wrong type, corrupted, > 5 MB,
> 5 files), EXIF stripping, partial upload failure cleanup, duplicate uploads, the complete submission → approval →
public map workflow, corrections, repeated and **concurrent approval** (5 parallel requests → 1 toilet), rejection
with reason, correction/resubmission with history, duplicate warnings, self-review prevention, photo moderation,
private image authorization, manager cross-resource access (WCs, uploads, images, reports, cleaning, QR), review
constraints and aggregates, moderation, favorites, notifications ownership, admin WC lifecycle and analytics.

## Production deployment (Ubuntu, no Docker)

```bash
cd backend
npm ci                                   # installs and generates the Prisma client
npx prisma migrate deploy                # uses DIRECT_URL; never `migrate dev`/`reset` in production
npm run build
NODE_ENV=production npm run start:prod   # node dist/src/main.js
```

- Optional PM2: `pm2 start ecosystem.config.cjs && pm2 save && pm2 startup`.
- Terminate HTTPS at Nginx/Caddy or a Cloudflare Tunnel, set `TRUST_PROXY=1`, `COOKIE_SECURE=true`,
  `FRONTEND_URL=https://your-frontend`, and keep `SWAGGER_ENABLED=false` unless the docs should be public.
- If frontend and API are on different *sites* (not just subdomains), set `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true`.
- Do not run the seed in production (it refuses). Create the first administrator with
  `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run admin:create` (no sample data; re-running resets that admin's password and
  sessions).
- Back up the database before applying new migrations to existing data.

## Verification status and known limitations

Verified in this environment (local PostgreSQL 18, Node 26): Prisma validate, migration applied with no drift, seed
(run twice), lint, type check, build, unit tests (24) and e2e tests (57), OpenAPI export, app boot with Swagger UI.

Not verified — requires your credentials:

- **No live Supabase connection was tested** (no project credentials were available). Storage calls were exercised
  only through the in-memory test double; run `npm run storage:setup` and an upload against your project to confirm.
  Migrations were tested on plain PostgreSQL 18, not on Supabase's pooler.
- **No real e-mail was sent** (no SMTP server). Password reset was tested with a fake mailer; without SMTP the API
  returns 503 rather than pretending to send.

Known limitations:

- Rate limiting and the signed-URL cache are in-memory per process; use a single instance or add a shared store.
- Nearby search loads candidate coordinates inside a bounding box (capped at 5 000 per query) and computes Haversine
  distances in the service. Fine for a city pilot; switch to PostGIS for national scale.
- `pg@8.23` prints a deprecation warning (“client.query() when the client is already executing a query”) that comes from
  inside `@prisma/adapter-pg` 7.10, not from this code; it is harmless until `pg@9`.
- `npm audit` reports 0 vulnerabilities for production dependencies (the Prisma CLI's `effect` dependency is pinned to
  the patched 3.22.5 via `overrides`); 19 moderate advisories remain in dev-only tooling (Jest/Nest CLI `glob`/`minimatch`).
