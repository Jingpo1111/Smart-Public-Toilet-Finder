# ToiletGo KH

A bilingual Vue 3 public restroom finder for Phnom Penh. Visitors can explore a Leaflet map, search for facilities and view photos. Signed-in contributors can submit a location privately and track its review. Administrators can publish or reject suggestions, and managers can maintain their assigned facilities.

## Run locally

Use npm with Node 22.18+ or Node 24.12+. The project was checked with Node 26.13.1.

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open [the local frontend](http://localhost:5173). Vite reads `.env.local` when it starts. The default REST base is `http://localhost:3000/api`. Configure the NestJS backend's `FRONTEND_URL` to allow the exact frontend origin and start that backend separately. Its [Swagger interface](http://localhost:3000/api/docs) describes the deployment.

## Explore the application

| Page | What it does |
| --- | --- |
| `/`, `/explore` | Search by name or address, filter by fee, facilities, opening status or rating, and locate nearby WCs. GPS runs on user request. Distances use a straight line. Search and the location picker also work with manually entered information. |
| `/toilets/:id` | View actual facility photos, hours and facilities, open directions, save a favorite, write a review or send a maintenance report. A manager feedback QR opens this page. |
| `/add-toilet`, `/my-submissions` | Select a pin, enter facilities and hours, choose the photo order and cover, review the suggestion and track the server's decision. Correcting a rejection creates a new submission linked to the original. |
| `/dashboard` | View account counters, recent submissions, reviews, reports, favorites and notifications. Profile and password changes use the signed-in account's endpoints. |
| `/admin/dashboard`, `/admin/submissions` | Inspect aggregate statistics and private submissions. Review the map and photos, select photos for publication, correct fields and confirm a decision. The server publishes approved locations. |
| `/admin/toilets`, `/admin/users`, `/admin/assignments` | Manage inventory, images, accounts, facility managers and assignments. Reviews and maintenance reports have moderation screens. |
| `/manager/dashboard`, `/manager/toilets`, `/manager/cleaning` | Inspect assigned locations, edit permitted details and photos, view feedback QR codes, manage cleaning records and update maintenance reports. |

Language and theme preferences persist locally. Access tokens, private records, photo previews and GPS coordinates stay in memory. The API manages the HttpOnly refresh cookie. Both languages use the same message keys, with local Inter and Noto Sans Khmer fonts.

## API configuration

The client reads the deployed OpenAPI document at `/api/docs-json` by default. An operation must be present in the contract before the UI can call it. Missing actions and unavailable services have an explicit state. The checked-in contract was generated from the sibling NestJS application's Swagger builder. It supports deployments that keep Swagger private.

- Set `VITE_API_BASE_URL` to the desired REST base, including its global prefix.
- Set `VITE_OPENAPI_URL` to use a different export URL, or `VITE_API_CONTRACT=bundled` to use the checked-in contract.
- Regenerate the frontend contract after backend changes with `npm run sync:api -- /path/to/openapi.json`.
- Keep database, mail, storage keys and JWT signing secrets in the backend environment. Vite's `VITE_*` variables are public.

See [API integration and verification](API-INTEGRATION.md) and [asset attribution](ASSETS.md).

## Verification

```bash
npm run lint
npm run type-check
npm test
npm run build
npm run check:api
```

Vitest runs component, router, transport, upload, map and contract tests using isolated fixtures. `check:api` performs read-only HTTP checks on the configured health, Swagger and public listing endpoints. `npm run check:approval` exercises the live approval and rejection scenario on an isolated deployment using the test credentials described in [API-INTEGRATION.md](API-INTEGRATION.md).

## Production

Build with the production API origin configured, then serve `dist/` over HTTPS. Serve existing static assets directly and rewrite other frontend routes to `index.html`. Keep `/api/` routed to NestJS if both share a domain. HTTPS enables browser GPS and secure production cookies. For local inspection of a build, run `npm run preview`. Map tiles and external directions need network access.

## Dependencies and offline build

Vue, Vue Router, Pinia, TypeScript, Vite, Tailwind CSS and Vitest use npm. The browser distributions of Leaflet, Axios and Chart.js, the Lucide sprite and the fonts are local assets. Vue I18n is an optional installation dependency. When it is available the app installs its composer with both dictionaries. The verified offline build uses the same dictionaries directly because Vue I18n was absent from the local package cache.
