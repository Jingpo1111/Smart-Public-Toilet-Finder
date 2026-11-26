import { ref } from 'vue'
import { defineStore } from 'pinia'
import { discover, failure, op, request, spec, supports } from '../services/api'
import { pageOf, publicToilet, emptyFilters, type Filters } from '../services/records'
import type { Point, Toilet } from '../types/api'
export const useDiscovery = defineStore('discovery', () => {
  const rows = ref<Toilet[]>([]),
    phase = ref<'loading' | 'ok' | 'error'>('loading'),
    error = ref(''),
    origin = ref<Point>(),
    gpsBusy = ref(false)
  let generation = 0,
    active: AbortController | undefined
  // Results per query. Re-visiting a query (typing, toggling a filter back, switching pages) is
  // instant; older entries are shown immediately while a background refresh replaces them.
  const cache = new Map<string, { rows: Toilet[]; at: number }>()
  const FRESH_MS = 30_000,
    PAGE_CONCURRENCY = 4
  async function load(force = false, filters: Filters = emptyFilters()) {
    const current = ++generation
    active?.abort()
    const controller = new AbortController()
    active = controller
    error.value = ''
    try {
      await discover(force)
      const location = origin.value
      const path =
        filters.radius && location && supports('get', '/toilets/nearby') ? '/toilets/nearby' : '/toilets'
      if (!supports('get', path)) throw new Error(spec.value ? 'unsupported' : 'networkError')
      // Filter and sort the entire public collection, including paginated responses.
      // Text search is applied locally (filterToilets), so typing never needs a request.
      const query = {
        accessType: filters.access || undefined,
        openNow: filters.open || undefined,
        minRating: filters.rated ? 4 : undefined,
        minCleanliness: filters.cleanliness || undefined,
        wheelchairAccessible: filters.wheelchair || undefined,
        hasWater: filters.water || undefined,
        hasSoap: filters.soap || undefined,
        lat: location?.[0],
        lng: location?.[1],
        radius: location && filters.radius ? filters.radius * 1000 : undefined,
        sort: location ? 'distance' : 'rating',
        limit: 100,
      }
      const key = path + JSON.stringify(query)
      const hit = cache.get(key)
      if (hit) {
        rows.value = hit.rows
        phase.value = 'ok'
        if (!force && Date.now() - hit.at < FRESH_MS) return
      } else phase.value = 'loading'
      const fetchPage = async (page: number) => {
        const result = pageOf(
          await request('get', path, { params: { ...query, page }, signal: controller.signal }),
        )
        if (page > 1 && result.page !== page) throw new Error('incompatible')
        return result
      }
      const first = await fetchPage(1)
      if (current !== generation) return
      if (
        first.pages > 1 &&
        !op('get', path)?.parameters?.some((p) => p.in === 'query' && p.name === 'page')
      )
        throw new Error('incompatible')
      // Page 1 reveals the page count; the remaining pages are fetched in parallel.
      const results = [first]
      const rest = Array.from({ length: Math.max(0, first.pages - 1) }, (_, i) => i + 2)
      for (let i = 0; i < rest.length; i += PAGE_CONCURRENCY) {
        results.push(...(await Promise.all(rest.slice(i, i + PAGE_CONCURRENCY).map(fetchPage))))
        if (current !== generation) return
      }
      const all = new Map<string, Toilet>()
      for (const result of results)
        result.items.map(publicToilet).forEach((t) => {
          if (t) all.set(t.id, t)
        })
      const list = [...all.values()]
      if (cache.size >= 20) cache.delete(cache.keys().next().value!)
      cache.set(key, { rows: list, at: Date.now() })
      rows.value = list
      phase.value = 'ok'
    } catch (e) {
      if (current === generation) {
        rows.value = []
        phase.value = 'error'
        error.value = e instanceof Error && e.message === 'networkError' ? 'networkError' : failure(e)
      }
    }
  }
  /** Drops cached results after a change that alters the public list (e.g. an approved submission). */
  const invalidate = () => cache.clear()
  async function locate() {
    if (!navigator.geolocation) throw new Error('gpsDenied')
    gpsBusy.value = true
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 0 }),
      )
      origin.value = [pos.coords.latitude, pos.coords.longitude] as Point
      return origin.value
    } catch {
      throw new Error('gpsDenied')
    } finally {
      gpsBusy.value = false
    }
  }
  return { rows, phase, error, origin, gpsBusy, load, locate, invalidate }
})
