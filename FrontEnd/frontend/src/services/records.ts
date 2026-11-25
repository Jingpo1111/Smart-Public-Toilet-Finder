import type { Page, Point, Row, Toilet } from '../types/api'
import { isRow, unwrap } from './api'
export const string = (r: Row, k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '')
export const number = (v: unknown) =>
  (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v))
    ? Number(v)
    : undefined
export function point(lat: unknown, lng: unknown): Point | undefined {
  const a = number(lat),
    b = number(lng)
  return a !== undefined && b !== undefined && Math.abs(a) <= 90 && Math.abs(b) <= 180
    ? [a, b]
    : undefined
}
export function distance(a: Point, b: Point) {
  const rad = Math.PI / 180,
    dLat = (b[0] - a[0]) * rad,
    dLng = (b[1] - a[1]) * rad
  const v =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(Math.min(1, v)))
}
export const idOf = (r: Row) =>
  typeof r.id === 'number' || typeof r.id === 'string' ? String(r.id) : ''
export function imageURL(v: unknown): string {
  if (typeof v !== 'string') return ''
  try {
    const u = new URL(v)
    return !u.username &&
      !u.password &&
      (u.protocol === 'https:' ||
        (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))
      ? u.href
      : ''
  } catch {
    return ''
  }
}
export function pictures(r: Row) {
  const imgs = Array.isArray(r.images) ? r.images : []
  const get = (v: unknown) => imageURL(isRow(v) ? (v.signedUrl ?? v.url ?? v.imageUrl) : v)
  return [
    ...new Set(
      [
        get(r.coverImageUrl ?? r.coverImage),
        ...imgs.filter((i) => isRow(i) && i.isCover === true).map(get),
        ...imgs.map(get),
      ].filter(Boolean),
    ),
  ]
}
export function pageOf(raw: unknown): Page<Row> {
  const v = unwrap(raw),
    rec = isRow(v) ? v : {}
  const rows = Array.isArray(v) ? v : (rec.items ?? rec.data)
  if (!Array.isArray(rows) || rows.some((row) => !isRow(row))) throw new Error('incompatible')
  const meta = isRow(rec.meta) ? rec.meta : isRow(raw) && isRow(raw.meta) ? raw.meta : {}
  return {
    items: rows,
    page: number(meta.page) ?? 1,
    pages: number(meta.totalPages) ?? 1,
    total: number(meta.total),
  }
}
export function publicToilet(r: Row): Toilet | null {
  if (
    r.isVerified === false ||
    r.verified === false ||
    r.archivedAt ||
    r.isArchived ||
    (r.verificationStatus && !['APPROVED', 'VERIFIED'].includes(String(r.verificationStatus))) ||
    ['PENDING', 'REJECTED', 'ARCHIVED'].includes(String(r.status))
  )
    return null
  return toiletOf(r)
}
export function toiletOf(r: Row): Toilet | null {
  const id = idOf(r),
    name = string(r, 'name')
  if (!id || !name) return null
  const fac = isRow(r.facilities) ? r.facilities : isRow(r.facility) ? r.facility : r
  const flag = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
  return {
    id,
    name,
    nameKm: string(r, 'nameKm'),
    descriptionKm: string(r, 'descriptionKm'),
    address: string(r, 'address'),
    description: string(r, 'description'),
    point: point(r.latitude, r.longitude),
    access: string(r, 'accessType') || 'UNKNOWN',
    price: number(r.priceKHR ?? r.priceKhr ?? r.price),
    rating: number(r.averageRating ?? r.rating),
    cleanliness: number(r.cleanlinessRating ?? r.averageCleanliness),
    status: string(r, 'operationalStatus') || string(r, 'status'),
    open: flag(r.isOpenNow ?? r.openNow),
    verifiedAt: string(r, 'lastVerifiedAt') || string(r, 'verifiedAt'),
    images: pictures(r),
    water: flag(fac.hasWater ?? fac.water),
    soap: flag(fac.hasSoap ?? fac.soap),
    wheelchair: flag(fac.wheelchairAccessible ?? fac.wheelchairAccess),
    baby: flag(fac.babyChanging ?? fac.babyChangingFacilities),
    hours: Array.isArray(r.openingHours)
      ? r.openingHours
          .filter(isRow)
          .filter(
            (h) => Number.isInteger(h.dayOfWeek) && Number(h.dayOfWeek) >= 0 && Number(h.dayOfWeek) < 7,
          )
          .map((h) => ({
            day: Number(h.dayOfWeek),
            opens: string(h, 'opensAt'),
            closes: string(h, 'closesAt'),
            nextDay: h.closesNextDay === true,
          }))
      : [],
    district: string(r, 'district'),
    sample: r.isSampleData === true,
  }
}
export interface Filters {
  q: string
  access: string
  open: boolean
  rated: boolean
  wheelchair: boolean
  water: boolean
  soap: boolean
  cleanliness: number
  radius: number
}
export const emptyFilters = (): Filters => ({
  q: '',
  access: '',
  open: false,
  rated: false,
  wheelchair: false,
  water: false,
  soap: false,
  cleanliness: 0,
  radius: 0,
})
export function filterToilets(rows: Toilet[], f: Filters, origin?: Point) {
  const q = f.q.trim().toLocaleLowerCase()
  const list = rows.filter(
    (r) =>
      (!q || [r.name, r.nameKm, r.address, r.district].join(' ').toLocaleLowerCase().includes(q)) &&
      (!f.access || r.access === f.access) &&
      (!f.open || r.open === true) &&
      (!f.rated || (r.rating ?? 0) >= 4) &&
      (!f.wheelchair || r.wheelchair === true) &&
      (!f.water || r.water === true) &&
      (!f.soap || r.soap === true) &&
      (!f.cleanliness || (r.cleanliness ?? 0) >= f.cleanliness) &&
      (!f.radius || (!!origin && !!r.point && distance(origin, r.point) <= f.radius)),
  )
  if (origin)
    list.sort(
      (a, b) =>
        (a.point ? distance(origin, a.point) : Infinity) -
        (b.point ? distance(origin, b.point) : Infinity),
    )
  else if (f.rated) list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  return list
}
