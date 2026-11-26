# ToiletGo KH

A bilingual Vue 3 public restroom finder for Phnom Penh. Visitors can explore a Leaflet map, search for facilities and view photos. Signed-in contributors can submit a location privately and track its review. Administrators can publish or reject suggestions, and managers can maintain their assigned facilities.

## Run locally

Use npm with Node 22.18+ or Node 24.12+. The project was checked with Node 26.13.1.

```bash
cd frontend
npm install
npm run dev
```

Open [the local frontend](http://localhost:5173). Start NestJS separately and include the frontend origin in the backend's `FRONTEND_URL`.

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

## Local and public API URLs

`npm run dev` uses `http://localhost:3005/api`. For Vercel Git deployments, set the project's Root Directory to `FrontEnd/frontend`. The production browser uses `/api` on the Vercel domain. [vercel.json](vercel.json) forwards those requests to the public NestJS endpoint and serves frontend routes through `index.html`.

To change the production backend, update the API rewrite destination in `vercel.json` and redeploy. The upstream must be reachable from the public internet. A Tailscale backend can use Funnel for that endpoint. After deployment, open the Vercel site's `/api/health` to check the forwarded request.

## API configuration

Development reads the OpenAPI document from the local backend at `/api/docs-json`. Production uses the checked-in contract generated from the NestJS application. An operation must be present in the contract before the UI can call it.

- Outside the Vercel build, an explicit `VITE_API_BASE_URL` in the shell overrides the mode selection.
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

When using the same public domain, forward `/api/*` to NestJS with the prefix intact. Include the public frontend origin in the backend's comma-separated `FRONTEND_URL`. Run `npm run build` and serve `dist/` over HTTPS. Serve assets directly and apply the `index.html` fallback to frontend routes such as `/explore` and `/admin/users` after routing API requests.

## Dependencies and offline build

Vue, Vue Router, Pinia, TypeScript, Vite, Tailwind CSS and Vitest use npm. The browser distributions of Leaflet, Axios and Chart.js, the Lucide sprite and the fonts are local assets. Vue I18n is an optional installation dependency. When it is available the app installs its composer with both dictionaries. The verified offline build uses the same dictionaries directly because Vue I18n was absent from the local package cache.
