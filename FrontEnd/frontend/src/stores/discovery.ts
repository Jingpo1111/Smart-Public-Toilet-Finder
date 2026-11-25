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
  async function load(force = false, filters: Filters = emptyFilters()) {
    const current = ++generation
    active?.abort()
    const controller = new AbortController()
    active = controller
    phase.value = 'loading'
    error.value = ''
    try {
      await discover(force)
      const location = origin.value
      const path =
        filters.radius && location && supports('get', '/toilets/nearby') ? '/toilets/nearby' : '/toilets'
      if (!supports('get', path)) throw new Error(spec.value ? 'unsupported' : 'networkError')
      const all = new Map<string, Toilet>()
      // Filter and sort the entire public collection, including paginated responses.
      const query = {
        q: filters.q.trim() || undefined,
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
      let page = 1
      for (;;) {
        const result = pageOf(
          await request('get', path, { params: { ...query, page }, signal: controller.signal }),
        )
        if (current !== generation) return
        result.items.map(publicToilet).forEach((t) => {
          if (t) all.set(t.id, t)
        })
        if (page >= result.pages) break
        if (
          result.page !== page ||
          !op('get', path)?.parameters?.some((p) => p.in === 'query' && p.name === 'page')
        )
          throw new Error('incompatible')
        page++
      }
      rows.value = [...all.values()]
      phase.value = 'ok'
    } catch (e) {
      if (current === generation) {
        rows.value = []
        phase.value = 'error'
        error.value = e instanceof Error && e.message === 'networkError' ? 'networkError' : failure(e)
      }
    }
  }
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
  return { rows, phase, error, origin, gpsBusy, load, locate }
})
