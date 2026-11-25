import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import contract from '../src/services/openapi.generated.json'
import { api, acceptTokens, bodySchema, checked, prepare, spec, supports } from '../src/services/api'
import { fillPath } from '../src/services/contract'
import { valueFor } from '../src/services/forms'
import { uploadField } from '../src/services/upload'
import { useDiscovery } from '../src/stores/discovery'
import { emptyFilters } from '../src/services/records'
import { AxiosHeaders } from '../src/vendor/axios'
import ImageGallery from '../src/components/ImageGallery.vue'
import MapView from '../src/components/MapView.vue'
import ToiletDetailsView from '../src/views/ToiletDetailsView.vue'
import WorkspaceView from '../src/views/WorkspaceView.vue'
import { useAccount } from '../src/stores/account'
import en from '../src/locales/en.json'
const fixture = {
  id: 'fixture',
  name: 'Test restroom',
  address: 'Test street',
  isVerified: true,
  latitude: 11.55,
  longitude: 104.93,
  facilities: { hasWater: null },
  openingHours: [],
  images: [],
}
const pinia = () => setActivePinia(createPinia())
const router = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/toilets/:id', component: { template: '<div/>' } },
      { path: '/admin/toilets/new', meta: { title: 'add' }, component: WorkspaceView },
      { path: '/manager/toilets/:id', meta: { title: 'assigned' }, component: { template: '<div/>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
    ],
  })
beforeEach(() => {
  checked.value = true
  spec.value = contract
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('the exported NestJS contract', () => {
  it('accepts the actual nested contribution and correction DTOs', () => {
    const fields = bodySchema('post', '/toilet-suggestions')
    expect(fields.required).toEqual(expect.arrayContaining(['name', 'address', 'latitude', 'longitude']))
    expect(
      prepare('post', '/toilet-suggestions', {
        name: 'Test',
        address: 'Test street',
        latitude: 11.55,
        longitude: 104.93,
        facilities: { hasWater: false },
        imageIds: ['owned-id'],
        coverImageId: 'owned-id',
      }),
    ).toHaveProperty('imageIds')
    const c = bodySchema('patch', '/admin/suggestions/:id/status').properties?.corrections
    expect(
      valueFor(c!, { facilities: { hasWater: 'false' }, priceKhr: '500', contributorId: 'forbidden' }),
    ).toEqual({ facilities: { hasWater: false }, priceKhr: 500 })
  })
  it('uses the multipart field declared for each resource', () => {
    for (const path of ['suggestions', 'reports', 'toilets'])
      expect(uploadField('/uploads/' + path)?.[0]).toBe('files')
    expect(uploadField('/uploads/avatar')?.[0]).toBe('file')
  })
  it('resolves the two identifiers used for an assigned facility image', () => {
    const path = '/manager/toilets/:id/images/:imageId'
    expect(supports('delete', path)).toBe(true)
    expect(fillPath(path, 'wc', { imageId: 'photo' })).toBe('/manager/toilets/wc/images/photo')
  })
  it('sends the radius in metres to the nearby controller, with permitted filters only', async () => {
    pinia()
    let query: unknown
    api.defaults.adapter = async (c) => {
      expect(c.url).toBe('/toilets/nearby')
      query = c.params
      return {
        config: c,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        data: { data: [fixture], meta: { page: 1, totalPages: 1 } },
      }
    }
    const s = useDiscovery()
    s.origin = [11.55, 104.93]
    await s.load(false, { ...emptyFilters(), radius: 2, water: true })
    expect(s.phase).toBe('ok')
    expect(query).toMatchObject({ lat: 11.55, lng: 104.93, radius: 2000, hasWater: true })
    expect(query).not.toHaveProperty('sort')
  })
})
describe('map, photos and authenticated interactions', () => {
  it('submits the location picked on the admin creation map with manual adjustments', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    acceptTokens({ accessToken: 'admin' })
    const send = vi.fn()
    api.defaults.adapter = async (config) => {
      send(config.method, config.url, JSON.parse(config.data))
      return { config, status: 201, statusText: 'Created', headers: new AxiosHeaders(), data: {} }
    }
    const r = router()
    await r.push('/admin/toilets/new')
    const w = mount(WorkspaceView, {
      attachTo: document.body,
      global: { plugins: [pinia(), r] },
    })
    try {
      await flushPromises()
      expect(w.get('h1').text()).toBe(en.add)
      const nav = w.get('#workspace-navigation')
      expect(nav.isVisible()).toBe(false)
      await w.get('button[aria-controls="workspace-navigation"]').trigger('click')
      expect(nav.isVisible()).toBe(true)
      const form = w.get('form')
      const basic = form.findAll('input[type=text][required]')
      await basic[0].setValue('WC')
      await basic[1].setValue('Test street')
      const map = w.getComponent(MapView)
      expect(map.props('selected')).toBeUndefined()
      await map.get('.map-zoom button').trigger('click')
      expect(send).not.toHaveBeenCalled()
      await map.get('.leaflet-map').trigger('click', { clientX: 10, clientY: 15 })
      const latitude = form.get<HTMLInputElement>('input[min="9.5"]')
      const longitude = form.get<HTMLInputElement>('input[min="102.2"]')
      const lat = latitude.element.valueAsNumber
      await flushPromises()
      expect(latitude.element.validity.valid).toBe(true)
      expect(map.props('selected')).toEqual([lat, longitude.element.valueAsNumber])
      await longitude.setValue('104.912345')
      expect(map.props('selected')).toEqual([lat, 104.912345])
      await form.trigger('submit')
      await flushPromises()
      expect(send).toHaveBeenCalledWith('post', '/admin/toilets', {
        name: 'WC',
        address: 'Test street',
        latitude: lat,
        longitude: 104.912345,
      })
      expect(r.currentRoute.value.path).toBe('/admin/toilets')
    } finally {
      w.unmount()
    }
  })
  it('mounts a Leaflet picker, emits a selected point and cleans up the map', async () => {
    const w = mount(MapView, {
      attachTo: document.body,
      props: { picker: true },
      global: { plugins: [pinia()] },
    })
    const el = w.find('.leaflet-map').element
    expect(el.classList.contains('leaflet-container')).toBe(true)
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 15 }))
    expect(w.emitted('pick')?.[0]?.[0]).toHaveLength(2)
    expect(w.get('.leaflet-control-attribution').text()).toContain('OpenStreetMap')
    w.unmount()
  })
  it('opens a native photo dialog and navigates using buttons', async () => {
    const w = mount(ImageGallery, {
      attachTo: document.body,
      props: { name: 'Test', images: ['https://example.test/a', 'https://example.test/b'] },
      global: { plugins: [pinia()] },
    })
    await w.get('button').trigger('click')
    expect(document.querySelector('dialog')?.open).toBe(true)
    const buttons = Array.from(document.querySelectorAll('dialog button'))
    buttons
      .find((b) => b.textContent === en.next)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(document.querySelector('.lightbox-image')?.getAttribute('src')).toContain('/b')
    w.unmount()
  })
  it('saves favorites and submits reviews and reports through separate endpoints', async () => {
    const r = router(),
      store = pinia()
    await r.push('/toilets/fixture')
    acceptTokens({ accessToken: 'test' })
    useAccount(store).user = { id: 'user', role: 'USER' }
    const changes: { url: string; method: string; body: unknown }[] = []
    api.defaults.adapter = async (c) => {
      const url = c.url!
      if (c.method !== 'get')
        changes.push({ url, method: c.method!, body: c.data ? JSON.parse(c.data) : undefined })
      return {
        config: c,
        data: { data: url === '/toilets/fixture' ? fixture : [] },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
      }
    }
    const w = mount(ToiletDetailsView, {
      attachTo: document.body,
      global: { plugins: [store, r], stubs: { MapView: true } },
    })
    await flushPromises()
    async function click(label: string) {
      await w
        .findAll('button')
        .find((b) => b.text() === label)!
        .trigger('click')
      await flushPromises()
    }
    await click(en.save)
    expect(changes[0].url).toBe('/me/favorites/fixture')
    await click(en.remove)
    expect(changes[1].method).toBe('delete')
    for (const label of [en.review, en.report]) {
      await click(label)
      const form = document.querySelector('dialog form')!,
        text = form.querySelector('textarea')!
      text.value = 'Test description'
      text.dispatchEvent(new Event('input', { bubbles: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flushPromises()
    }
    expect(changes[2]).toMatchObject({
      url: '/toilets/fixture/reviews',
      body: { rating: 5, cleanlinessRating: 5, comment: 'Test description' },
    })
    expect(changes[3]).toMatchObject({
      url: '/toilets/fixture/reports',
      body: { category: 'DIRTY', description: 'Test description' },
    })
    w.unmount()
  })
  it('does not fall back to public or administrator data after a manager denial', async () => {
    const r = router()
    await r.push('/manager/toilets/unassigned')
    acceptTokens({ accessToken: 'manager' })
    const seen: string[] = []
    api.defaults.adapter = async (c) => {
      seen.push(c.url!)
      throw { isAxiosError: true, response: { status: 403 }, config: c }
    }
    const w = mount(WorkspaceView, { global: { plugins: [pinia(), r], stubs: { MapView: true } } })
    await flushPromises()
    expect(w.text()).toContain(en.forbidden)
    expect(seen).toEqual(['/manager/toilets/unassigned'])
    w.unmount()
  })
})
