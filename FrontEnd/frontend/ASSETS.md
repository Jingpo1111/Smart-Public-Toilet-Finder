# ToiletGo KH assets

The city scene is an original vector illustration of Phnom Penh’s riverside and palace architecture. It is decorative city artwork. The facility gallery uses only URLs returned by the API and labels the local illustration when a photograph is unavailable.

| Asset | Origin and usage |
| --- | --- |
| `public/images/hero/`, `illustrations/`, `placeholders/`, `branding/`; map markers and favicon | Original SVG artwork created for this project. No downloaded city photographs or stock facility images are used. |
| `public/icons/lucide.svg` | Selected Lucide icon paths from the locally available 0.460.0 distribution, assembled into an SVG sprite. The copyright and ISC/MIT notices are in `public/licenses/lucide.txt`. [Lucide source](https://github.com/lucide-icons/lucide) |
| `public/fonts/inter.woff2` | Subset of the installed Inter variable font, SIL Open Font License 1.1. [Inter](https://rsms.me/inter/) · `public/licenses/inter.txt` |
| `public/fonts/khmer.woff2` | Subset of the installed Noto Sans Khmer Regular font with Khmer shaping features, SIL Open Font License 1.1. [Noto Khmer](https://github.com/notofonts/khmer) · `public/licenses/noto.txt` |
| Map tiles | Requested on demand from OpenStreetMap. The interactive map retains visible linked contributor attribution. There is no tile prefetcher or offline tile cache. [Copyright](https://www.openstreetmap.org/copyright) · [Tile usage policy](https://operations.osmfoundation.org/policies/tiles/) |
| API images | Uploaded contributor, facility and maintenance media stay with the backend storage provider. Private galleries request signed URLs from the authorized parent resource. No user photographs are bundled with the site. |

## Local library distributions

The application bundles the browser distribution of Axios 1.19.0, Leaflet 1.8.0, and Chart.js 4.5.1 with its color dependency. These copies came from locally installed packages or their redistributed bundles. The Leaflet and Chart.js browser modules have small ES module wrappers. The Axios build omits its source-map pointer. Tailwind Preflight and the utilities are built by the compiler specified in `package.json`.

| Library | Source | Local notice |
| --- | --- | --- |
| Axios | [Axios](https://github.com/axios/axios) | `public/licenses/axios.txt` |
| Leaflet | [Leaflet](https://github.com/Leaflet/Leaflet) | `public/licenses/leaflet.txt` |
| Chart.js and @kurkle/color | [Chart.js](https://github.com/chartjs/Chart.js) · [color](https://github.com/kurkle/color) | `public/licenses/chart.txt` |
| Tailwind CSS | [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | `public/licenses/tailwind.txt` |
