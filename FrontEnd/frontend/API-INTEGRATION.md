# API integration

The owning backend is `../../BackEnd/backend/` relative to this frontend. The implementation was checked against the controllers, Prisma schema, services, DTOs, response interceptor, cookie/CSRF guard and Swagger builder. A root project README was absent at initial inspection.

The checked-in `src/services/openapi.generated.json` contains request metadata for 80 paths and 29 referenced DTOs from the compiled NestJS application. It was exported in-process without listening on a port or querying storage or the database. It contains no example records or configuration secrets. The deployed Swagger document takes precedence in live-discovery mode. A 404 for the default Swagger export falls back to the checked-in contract. Network failures present a retry state. A configured custom document must be reachable.

## Transport and contracts

| Area | Confirmed behavior |
| --- | --- |
| Responses | Nest returns `{success,data,message}`; lists expose `meta.page`, `limit`, `total` and `totalPages`. Empty results and failed reads have separate UI states. |
| Accounts | Register and login set the HttpOnly `tg_refresh` cookie and return `data.accessToken`. `GET /auth/me` supplies the identity and role. Refresh/logout use credentials with `X-CSRF-Protection: 1`. Concurrent 401s share one refresh and retry a protected request once. Password change also returns a rotated access token and cookie. |
| Discovery | `GET /toilets` and `/toilets/nearby` expose verified public records. Nearby expects `lat`, `lng` and radius in **metres**. The UI displays kilometres and never treats its initial Phnom Penh map center as the visitor's location. Filtering and pagination use the documented query keys. The UI labels fictional development records using `isSampleData`. Public statistics come from `/stats`. |
| WC details | Details include `facilities`, `priceKhr`, `openNow`, `openingHours`, `coverImage` and `images`. Local times are for Phnom Penh. Operational status and opening hours are separate. Missing booleans and ratings display as unknown. |
| Contribution | Upload private images to `POST /uploads/suggestions` as multipart field `files`. Submit returned IDs and optional `coverImageId` to `POST /toilet-suggestions`. The JSON payload nests facility flags under `facilities`. Access type, KHR price, coordinates and opening-hour intervals follow the DTO. The contributor cannot set status. |
| My submissions | Use `/me/toilet-suggestions` and its detail endpoint. Rejection feedback comes from `feedback.rejectionReason`. A new suggestion can reference `resubmittedFromId`; an approved entry links via `publishedToiletId`. |
| Admin decision | `PATCH /admin/suggestions/:id/status` accepts `APPROVED` with optional corrections, publication image IDs and cover, or `REJECTED` with a reason. After success the review reloads and discovery refreshes. Private lists and statistics refetch on entry. A 409 reloads the current review and prompts the administrator to inspect it. |
| Other account data | `/me/summary` supplies dashboard counters. Notifications, favorites, reviews, profile and private reports use the authenticated user's endpoints. Report photos use `/uploads/reports`; avatars use the singular multipart field `file`. Public review authors use the backend's abbreviated display name. |
| Administration | The admin inventory includes an archive filter, restore/verify actions, cover and photo management. Users, managers, assignments, review moderation and report status changes use admin endpoints. Analytics series and status counts are generated from the response. |
| Managers | The manager namespace enforces facility assignment. Facility detail, cleaning schedules/logs, photo operations and maintenance reports use manager endpoints. Its QR response includes a PNG data URL and public feedback URL. The UI uses the PNG and plain link. |
| Errors | HTTP 400/422, 401, 403, 404, 409, 429 and server/network failures map to localized messages. The UI does not render response stack traces. Operations missing from the contract are unavailable. |

## Photo handling

The browser checks the MIME type, up to five images and 5 MB per image. The backend validates actual file contents, ownership and expiry. Uploaded suggestion and report IDs are held only for the active form so a partial failure can retry successfully uploaded files without duplicating them. Uploaded references expire after 24 hours. The browser creates multipart boundaries. Local object URLs are revoked after removal or unmount.

The API supplies short-lived signed URLs through the authorized parent resource. The gallery retries a failed signed photo by refetching that resource once. There is no service worker, offline image store or persistence of private records. Storage access and cache headers for signed objects remain backend/storage responsibilities.

## Live acceptance test

Run `npm run check:approval` against a disposable test deployment. It creates two suggestions and uploads a valid local test photo. It checks pending privacy, verifies role denials, approves one suggestion, verifies public visibility and manager restrictions, archives that test WC, and rejects the other suggestion with feedback. The backend retains the test submission and audit history.

Supply the following environment variables to the test process. Keep test credentials outside Vite's public environment.

| Variables | Purpose |
| --- | --- |
| `TEST_API_BASE_URL` | Isolated NestJS base URL, including `/api` |
| `TEST_USER_EMAIL`, `TEST_USER_PASSWORD` | Contributor test account |
| `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD` | Separate authorized reviewer |
| `TEST_MANAGER_EMAIL`, `TEST_MANAGER_PASSWORD` | Manager without assignment to the newly published WC |
| `TEST_PHOTO` | Path to a permitted non-sensitive JPEG, PNG or WebP |

## Verification limits

The local frontend build, lint, type checking and component/contract tests ran. The read-only live API check could not open a network socket in the workspace. Live database-backed decisions, Supabase transfers and signed-image access, mail delivery, real device GPS and the three-account acceptance run remain unverified. Desktop, tablet and mobile styles are implemented. Browser screenshot automation and the Vite HTTP listener were blocked by the same environment restrictions.
